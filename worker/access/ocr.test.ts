import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { FileRecord } from '../../shared/domain';
import { createTestBucket } from '../test/r2-shim';
import { instanceFor, tesseractLang } from '../ocr';
import { checkDocument } from './index';
import { createDocumentEngine, fileKeys } from './engine';

const ab = (u: Uint8Array) => Uint8Array.from(u).buffer;
async function blankPdf() { const d = await PDFDocument.create(); d.addPage([300, 400]); return ab(await d.save()); }
async function textPdf() { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); d.addPage([300, 400]).drawText('Scanned syllabus page', { x: 30, y: 350, font: f, size: 12 }); return ab(await d.save()); }

/** A fake OCR binding: returns a PDF with text, like OCRmyPDF would; records calls. */
function fakeOcr(status = 200) {
  const calls: { name: string; url: string; bytes: number }[] = [];
  const binding = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: async (req: Request) => {
        calls.push({ name, url: req.url, bytes: (await req.arrayBuffer()).byteLength });
        return status === 200 ? new Response(await textPdf(), { headers: { 'content-type': 'application/pdf', 'x-ocr-pages': '1', 'x-ocr-seconds': '2.0' } }) : new Response('{"error":"OCR failed."}', { status });
      },
    }),
  };
  return { binding, calls };
}

async function setup(status = 200) {
  const FILES = createTestBucket();
  const file: FileRecord = { id: 'file-scan', courseId: 'c-stat110', name: 'Scanned syllabus.pdf', kind: 'pdf', mime: 'application/pdf', size: 0, key: '', version: 1, uploadedBy: 'u-okafor', uploadedAt: '2026-09-27T00:00:00.000Z', scan: null };
  file.key = fileKeys.version(file, 1);
  await FILES.put(file.key, await blankPdf());
  const ocr = fakeOcr(status);
  const engine = createDocumentEngine({ FILES: FILES as never, OCR: ocr.binding as never });
  return { FILES, file, engine, ocr };
}

describe('OCR (container)', () => {
  it('flags a scanned PDF with the OCR fix', async () => {
    const { engine, file } = await setup();
    const report = await engine.scan(file);
    expect(report.issues.find((i) => i.code === 'pdf_no_text')).toMatchObject({ severity: 'critical', fix: 'ocr' });
  });

  it('saves the searchable PDF as a new version, leaving the original', async () => {
    const { engine, file, FILES, ocr } = await setup();
    const fixed = await engine.fix(file, { kind: 'ocr', language: 'es-MX' }, 'u-okafor');
    expect(fixed).toMatchObject({ version: 2, key: 'files/c-stat110/file-scan/v2/Scanned-syllabus.pdf' });
    expect(ocr.calls[0].url).toContain('lang=spa');
    expect((await checkDocument('pdf', await (await FILES.get(fixed.key))!.arrayBuffer())).document?.hasText).toBe(true);
    expect((await checkDocument('pdf', await (await FILES.get(file.key))!.arrayBuffer())).document?.hasText).toBe(false);
    expect((await engine.scan(fixed)).issues.map((i) => i.code)).not.toContain('pdf_no_text');
  });

  it('builds reading and audio versions of a scan from its OCR text, running OCR once', async () => {
    const { engine, file, FILES, ocr } = await setup();
    const html = await (await FILES.get(await engine.generateFormat(file, 'reading')))!.text();
    expect(html).toContain('Scanned syllabus page');
    await engine.generateFormat(file, 'epub');
    expect(ocr.calls).toHaveLength(1);
    expect(FILES.store.has(fileKeys.format(file, 'ocr'))).toBe(true);
  });

  it('reports OCR failures and missing containers plainly', async () => {
    const failing = await setup(422);
    await expect(failing.engine.generateFormat(failing.file, 'ocr')).rejects.toMatchObject({ code: 'ai-failed' });
    const FILES = createTestBucket();
    const none = createDocumentEngine({ FILES: FILES as never });
    await FILES.put(failing.file.key, await blankPdf());
    await expect(none.generateFormat(failing.file, 'ocr')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('maps languages and spreads files across instances', () => {
    expect([tesseractLang('en-US'), tesseractLang('fr'), tesseractLang('de'), tesseractLang(undefined)]).toEqual(['eng', 'fra', 'eng', 'eng']);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => instanceFor(id, 3))).size).toBeGreaterThan(1);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => instanceFor(id)))).toEqual(new Set(['ocr-0']));
    expect(instanceFor('file-1', 3)).toBe(instanceFor('file-1', 3));
  });
});
