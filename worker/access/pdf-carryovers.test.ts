import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../../shared/ai';
import type { FileRecord } from '../../shared/domain';
import { MemoryRepo, type ServiceContext } from '../../shared/service';
import { access } from '../../shared/service/access';
import { seedData } from '../../shared/seed';
import { createTestBucket } from '../test/r2-shim';
import { findFileRoute } from '../api/files';
import { createDocumentEngine, fileKeys } from './engine';
import { checkDocument } from './index';

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
const png = (byte: number) => btoa(String.fromCharCode(byte));

async function twoPagePdf(scanned = false): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(pixel);
  for (let page = 1; page <= 2; page++) {
    const sheet = pdf.addPage([300, 400]);
    sheet.drawImage(image, { x: 25, y: 100, width: 100, height: 100 });
    if (!scanned) sheet.drawText(`Page ${page} text`, { x: 25, y: 350, font, size: 12 });
  }
  return Uint8Array.from(await pdf.save()).buffer;
}

async function setup(scanned = false, withBinding = true, writer = true) {
  const FILES = createTestBucket();
  const file: FileRecord = { id: 'file-carry', courseId: 'c-stat110', name: 'Illustrated notes.pdf', kind: 'pdf', mime: 'application/pdf', size: 0, key: '', version: 1, uploadedBy: 'u-okafor', uploadedAt: '2026-09-27T00:00:00.000Z', scan: null };
  file.key = fileKeys.version(file, 1);
  const bytes = await twoPagePdf(scanned);
  file.size = bytes.byteLength;
  await FILES.put(file.key, bytes);
  const calls: string[] = [];
  const binding = { idFromName: (name: string) => name, get: () => ({ fetch: async (req: Request) => {
    const url = new URL(req.url); calls.push(url.pathname);
    if (url.pathname === '/images') return Response.json({ images: [
      { index: 0, page: 1, width: 64, height: 64, png: png(1) },
      { index: 1, page: 2, width: 64, height: 64, png: png(2) },
    ], truncated: false });
    if (url.pathname === '/confidence') return Response.json({ pages: [{ page: 1, confidence: 55 }, { page: 2, confidence: 91 }], totalPages: 2, truncated: false });
    if (url.pathname === '/page') return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
    return new Response(await twoPagePdf(false), { headers: { 'x-ocr-pages': '2', 'x-ocr-seconds': '1' } });
  } }) };
  const engine = createDocumentEngine({ FILES: FILES as never, OCR: withBinding ? binding as never : undefined, WRITER_API_KEY: writer ? 'test' : undefined });
  const repo = new MemoryRepo(seedData());
  await repo.putFile(file);
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), documents: engine, now: () => '2026-09-27T12:00:00.000Z', newId: () => 'scan-x' };
  return { FILES, file, engine, ctx, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('PDF carry-overs', () => {
  it('maps scanner elements 0 and 1 to extracted images on pages 1 and 2', async () => {
    const { engine, file, ctx } = await setup();
    const scanned = await checkDocument('pdf', await twoPagePdf());
    expect(scanned.elements.map((element) => [element.index, element.page])).toEqual([[0, 1], [1, 2]]);
    const prompts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const image = body.messages[0].content[1].image_url.url as string;
      prompts.push(image);
      return Response.json({ choices: [{ message: { content: image.endsWith('AQ==') ? 'First illustration' : 'Second illustration' } }] });
    }));
    expect((await engine.suggest({ kind: 'alt-text', file, element: 0, courseTitle: 'Statistics' }, ctx)).suggestion).toBe('First illustration');
    expect((await engine.suggest({ kind: 'alt-text', file, element: 1, courseTitle: 'Statistics' }, ctx)).suggestion).toBe('Second illustration');
    expect(prompts).toHaveLength(2);
  });

  it('carries reviewed PDF image alt text into reading HTML and EPUB', async () => {
    const { engine, file, FILES } = await setup();
    const fixed = await engine.fix(file, { kind: 'alt-text', element: 0, alt: 'A sample chart', decorative: false }, 'u-okafor');
    const fixedAgain = await engine.fix(fixed, { kind: 'alt-text', element: 1, alt: '', decorative: true }, 'u-okafor');
    const html = await (await FILES.get(await engine.generateFormat(fixedAgain, 'reading')))!.text();
    expect(html).toContain('alt="A sample chart"');
    expect(html).toContain('alt=""');
    expect(html.indexOf('Page 1 text')).toBeLessThan(html.indexOf('alt="A sample chart"'));
    expect(html.indexOf('Page 2 text')).toBeLessThan(html.indexOf('alt=""'));
    const epub = await JSZip.loadAsync(await (await FILES.get(await engine.generateFormat(fixedAgain, 'epub')))!.arrayBuffer());
    expect(await epub.file('OEBPS/text.xhtml')!.async('string')).toContain('alt="A sample chart"');
    expect(epub.file('OEBPS/images/image-0.png')).not.toBeNull();
    expect(new Uint8Array(await (await FILES.get(file.key))!.arrayBuffer())).toEqual(new Uint8Array(await twoPagePdf(false)));
  });

  it('stores low-confidence pages as pending and only kept text enters regenerated formats', async () => {
    const { engine, file, FILES, ctx, calls } = await setup(true);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Reviewed candidate text' } }] })));
    await engine.generateFormat(file, 'ocr');
    const drafts = await access.listTranscriptions(ctx, { fileId: file.id });
    expect(drafts).toMatchObject([{ page: 1, confidence: 55, state: 'pending', provenance: { task: 'element', model: 'palmyra-x5' } }]);
    const before = await (await FILES.get(await engine.generateFormat(file, 'reading')))!.text();
    expect(before).not.toContain('Reviewed candidate text');
    const kept = await access.reviewTranscription(ctx, { fileId: file.id, page: 1, decision: 'keep' });
    expect(kept[0]).toMatchObject({ state: 'kept', reviewedByName: 'Dr. Amara Okafor' });
    const after = await (await FILES.get(await engine.generateFormat(file, 'reading')))!.text();
    expect(after).toContain('Reviewed candidate text');
    expect(after).toContain('Page 1 was transcribed with AI and reviewed by Dr. Amara Okafor');
    expect(after).toContain('class="ai ai--block" data-state="kept"');
    const epub = await JSZip.loadAsync(await (await FILES.get(await engine.generateFormat(file, 'epub')))!.arrayBuffer());
    expect(await epub.file('OEBPS/text.xhtml')!.async('string')).toContain('Reviewed candidate text');
    expect(calls).toContain('/page');
  });

  it('discards drafts and handles missing OCR or Palmyra', async () => {
    const noBinding = await setup(true, false);
    await expect(noBinding.engine.suggest({ kind: 'alt-text', file: noBinding.file, element: 0, courseTitle: '' }, noBinding.ctx)).rejects.toMatchObject({ code: 'unsupported' });
    const noWriter = await setup(true, true, false);
    const skipped = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await noWriter.engine.generateFormat(noWriter.file, 'ocr');
    expect(await noWriter.engine.listTranscriptions(noWriter.file)).toEqual([]);
    expect(noWriter.calls).not.toContain('/confidence');
    expect(skipped).toHaveBeenCalledWith(expect.stringContaining('Palmyra-X5 is not configured'));
    skipped.mockRestore();
    const disabled = await setup(true);
    await disabled.engine.generateFormat(disabled.file, 'ocr', false);
    expect(disabled.calls).not.toContain('/confidence');
    const { engine, file, ctx } = await setup(true);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Do not publish' } }] })));
    await engine.generateFormat(file, 'ocr');
    expect((await access.reviewTranscription(ctx, { fileId: file.id, page: 1, decision: 'discard' }))[0].state).toBe('discarded');
  });

  it('limits reviews to course instructors while staff may list', async () => {
    const { engine, file, ctx } = await setup(true);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Draft text' } }] })));
    await engine.generateFormat(file, 'ocr');
    const administrator = await ctx.repo.getUser('u-admin');
    const staffCtx = { ...ctx, user: administrator };
    expect(await access.listTranscriptions(staffCtx, { fileId: file.id })).toHaveLength(1);
    await expect(access.reviewTranscription(staffCtx, { fileId: file.id, page: 1, decision: 'keep' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(access.reviewTranscription(ctx, { fileId: file.id, page: 2, decision: 'keep' })).rejects.toMatchObject({ code: 'not-found' });
    const mockCtx = { ...ctx, documents: null };
    expect(await access.listTranscriptions(mockCtx, { fileId: file.id })).toEqual([]);
  });

  it('serves page PNGs to staff through the binary route', async () => {
    const { file, ctx, FILES } = await setup();
    const route = findFileRoute('GET', `/files/${file.id}/pages/1`)!;
    const response = await route.handle(new Request(`https://example.test/api/v1/files/${file.id}/pages/1`), ctx, FILES as never, route.params);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1]);
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    await expect(route.handle(new Request(`https://example.test/api/v1/files/${file.id}/pages/1`), student, FILES as never, route.params)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps the OCR output available if the vision pass fails', async () => {
    const { engine, file, FILES } = await setup(true);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const key = await engine.generateFormat(file, 'ocr');
    expect((await FILES.get(key))?.size).toBeGreaterThan(0);
    expect(await engine.listTranscriptions(file)).toEqual([]);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
