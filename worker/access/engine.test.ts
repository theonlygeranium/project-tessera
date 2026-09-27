import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../../shared/ai';
import type { Block, FileRecord } from '../../shared/domain';
import { MemoryRepo, type ServiceContext } from '../../shared/service';
import { seedData } from '../../shared/seed';
import { createTestBucket } from '../test/r2-shim';
import { createDocumentEngine, fileKeys, safeName, speechChunks } from './engine';

async function docx(): Promise<Uint8Array> {
  const z = new JSZip();
  z.file('word/document.xml', '<w:document xmlns:w="x" xmlns:wp="x" xmlns:a="x" xmlns:r="x"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sampling basics</w:t></w:r></w:p><w:p><w:r><w:t>A sample is part of a population.</w:t></w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"/><a:blip r:embed="rId5"/></wp:inline></w:drawing></w:p></w:body></w:document>');
  z.file('word/styles.xml', '<w:styles xmlns:w="x"><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults></w:styles>');
  z.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId5" Target="media/image1.png"/></Relationships>');
  z.file('word/media/image1.png', new Uint8Array([137, 80, 78, 71]));
  z.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="x" xmlns:dc="x"><dc:title></dc:title></cp:coreProperties>');
  return z.generateAsync({ type: 'uint8array' });
}

async function setup(env: Record<string, unknown> = {}) {
  const bucket = createTestBucket();
  const file: FileRecord = { id: 'file-1', courseId: 'c-stat110', name: 'Week 1 notes.docx', kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 0, key: '', version: 1, uploadedBy: 'u-okafor', uploadedAt: '2026-09-27T00:00:00.000Z', scan: null };
  file.key = fileKeys.version(file, 1);
  const bytes = await docx();
  await bucket.put(file.key, bytes);
  file.size = bytes.length;
  const engine = createDocumentEngine({ FILES: bucket as never, ...env });
  const repo = new MemoryRepo(seedData());
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => '2026-09-27T12:00:00.000Z', newId: (p) => `${p}-x` };
  return { bucket, file, engine, ctx };
}

describe('document engine (Worker)', () => {
  it('scans the stored version and reports it as a file target', async () => {
    const { engine, file } = await setup();
    const report = await engine.scan(file);
    expect(report.target).toEqual({ kind: 'file', fileId: 'file-1', version: 1 });
    expect(report.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['docx_images_no_alt', 'docx_no_language']));
    expect(report.score).toBeLessThan(100);
  });

  it('writes a fix as a new version and leaves the original untouched', async () => {
    const { engine, file, bucket } = await setup();
    const original = await (await bucket.get(file.key))!.arrayBuffer();
    const fixed = await engine.fix(file, { kind: 'alt-text', element: 0, alt: 'A dot plot of sample means', decorative: false }, 'u-okafor');
    expect(fixed.version).toBe(2);
    expect(fixed.key).toBe('files/c-stat110/file-1/v2/Week-1-notes.docx');
    expect(new Uint8Array(await (await bucket.get(file.key))!.arrayBuffer())).toEqual(new Uint8Array(original));
    expect((await engine.scan(fixed)).issues.map((i) => i.code)).not.toContain('docx_images_no_alt');
  });

  it('generates a reading version and an EPUB with the document structure', async () => {
    const { engine, file, bucket } = await setup();
    const readingKey = await engine.generateFormat(file, 'reading');
    const html = await (await bucket.get(readingKey))!.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1>Week 1 notes</h1>');
    expect(html).toContain('<h2>Sampling basics</h2>');
    expect(html).toContain('<p>A sample is part of a population.</p>');
    const epubKey = await engine.generateFormat(file, 'epub');
    const zip = await JSZip.loadAsync(await (await bucket.get(epubKey))!.arrayBuffer());
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('schema:accessibilitySummary');
    await expect(engine.generateFormat(file, 'ocr')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('joins speech chunks into one audio file', async () => {
    const calls: string[] = [];
    const AI = { run: async (_model: string, input: { text: string }) => { calls.push(input.text); return new Response(new Uint8Array([1, 2, 3])).body; } };
    const { engine, file, bucket } = await setup({ AI });
    const key = await engine.generateFormat(file, 'audio');
    expect(calls.join(' ')).toContain('Sampling basics');
    expect((await bucket.get(key))!.size).toBe(3 * calls.length);
    expect(key.endsWith('/formats/audio.mp3')).toBe(true);
  });

  it('suggests alt text from an image in the file and link text for a block, as drafts with provenance', async () => {
    const { engine, file, ctx } = await setup();
    const alt = await engine.suggest({ kind: 'alt-text', courseTitle: 'Statistics', file, element: 0 }, ctx);
    expect(alt.provenance).toMatchObject({ model: 'fixture', task: 'alt-text', sources: [{ id: 'file-1', name: 'Week 1 notes.docx' }] });
    const link = { id: 'b-l', lessonId: 'l', position: 0, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: '', type: 'link', href: 'https://example.edu/guide', text: 'click here', description: 'The sampling guide for week one.' } as Block;
    const out = await engine.suggest({ kind: 'link-text', courseTitle: 'Statistics', block: link }, ctx);
    expect(out.suggestion).not.toMatch(/click here/i);
    expect(out.provenance.task).toBe('link-text');
  });

  it('removes every version and format of a file', async () => {
    const { engine, file, bucket } = await setup();
    await engine.generateFormat(file, 'reading');
    await bucket.put('files/c-stat110/file-2/v1/other.pdf', 'keep');
    await engine.remove(file);
    expect([...bucket.store.keys()]).toEqual(['files/c-stat110/file-2/v1/other.pdf']);
  });

  it('chunks speech at sentence boundaries under the limit', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = speechChunks(text, 200);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
    expect(safeName('../Week 1: notes?.docx')).toBe('Week-1-notes.docx');
  });
});
