// The Worker's document engine (D-022): the service's `DocumentEngine` over R2 and the
// parsers in this folder. Scans read the stored bytes; fixes write a new version and
// never touch the original; suggestions are drafts a person edits; formats are written
// next to the version they came from.
import JSZip from 'jszip';
import tokens from '../../design/tokens.json';
import { ApiError } from '../../shared/api';
import { summarize } from '../../shared/access/score';
import type { AccessReport, AccessibleFormat, Block, FileRecord, PageTranscription, Provenance, User } from '../../shared/domain';
import { canReadFile, type DocumentEngine, type ServiceContext } from '../../shared/service';
import { describeImage, transcribePage, type VisionEnv } from '../ai/vision';
import { applyFix, checkDocument, extractImage, type DocumentCheck } from './index';
import { extractPdfImages, pageConfidences, renderPdfPage, runOcr, type OcrContainer } from '../ocr';

export interface EngineEnv extends VisionEnv { FILES: R2Bucket; OCR?: DurableObjectNamespace<OcrContainer>; OCR_INSTANCES?: string }

const ocrInstances = (env: EngineEnv) => Number(env.OCR_INSTANCES ?? 1) || 1;

// The reading version uses Tessera's tokens (D-007): ink on paper.
const INK = tokens.color.ink.$value, PAPER = tokens.color.surface.$value;

const SCANNABLE = new Set(['pdf', 'docx', 'pptx']);
const TTS_MODEL = '@cf/deepgram/aura-2-en';
/** About 30 minutes of speech; longer documents get the first part and a note. */
const AUDIO_MAX_CHARS = 27_000;
const TTS_CHUNK = 1_800;

export const FORMAT_FILES: Record<AccessibleFormat, { ext: string; mime: string }> = {
  reading: { ext: 'html', mime: 'text/html; charset=utf-8' },
  ocr: { ext: 'pdf', mime: 'application/pdf' },
  epub: { ext: 'epub', mime: 'application/epub+zip' },
  audio: { ext: 'mp3', mime: 'audio/mpeg' },
};

/** R2 keys: every version and format of a file lives under one prefix. */
export const fileKeys = {
  prefix: (f: Pick<FileRecord, 'courseId' | 'id'>) => `files/${f.courseId}/${f.id}/`,
  version: (f: Pick<FileRecord, 'courseId' | 'id' | 'name'>, version: number) => `files/${f.courseId}/${f.id}/v${version}/${safeName(f.name)}`,
  format: (f: Pick<FileRecord, 'courseId' | 'id' | 'version'>, format: keyof typeof FORMAT_FILES) => `files/${f.courseId}/${f.id}/v${f.version}/formats/${format}.${FORMAT_FILES[format].ext}`,
  alt: (f: Pick<FileRecord, 'courseId' | 'id' | 'version'>) => `files/${f.courseId}/${f.id}/v${f.version}/pdf-alt.json`,
  transcriptions: (f: Pick<FileRecord, 'courseId' | 'id' | 'version'>) => `files/${f.courseId}/${f.id}/v${f.version}/transcriptions.json`,
  ocrSource: (f: Pick<FileRecord, 'courseId' | 'id' | 'version'>) => `files/${f.courseId}/${f.id}/v${f.version}/ocr-source.json`,
};

export function safeName(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 120) || 'file';
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function bytesOf(env: EngineEnv, key: string): Promise<ArrayBuffer> {
  const object = await env.FILES.get(key);
  if (!object) throw new ApiError('not-found', 'The file\'s contents are missing from storage.');
  return object.arrayBuffer();
}

type PdfAlt = Record<string, { alt: string; decorative: boolean }>;
async function readJson<T>(env: EngineEnv, key: string, fallback: T): Promise<T> {
  const object = await env.FILES.get(key);
  return object ? JSON.parse(await object.text()) as T : fallback;
}
function pngBytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

async function secondPass(env: EngineEnv, file: FileRecord, pdf: ArrayBuffer): Promise<void> {
  if (!env.OCR || await env.FILES.get(fileKeys.transcriptions(file))) return;
  if (!env.WRITER_API_KEY) { console.info(`AI transcription skipped for ${file.id} v${file.version}: Palmyra-X5 is not configured.`); return; }
  let measured: Awaited<ReturnType<typeof pageConfidences>>;
  try { measured = await pageConfidences(env.OCR, file.id, pdf, ocrInstances(env)); }
  catch (error) { console.warn(`AI transcription confidence pass failed for ${file.id} v${file.version}: ${String(error)}`); return; }
  if (measured.truncated) console.info(`AI transcription confidence checked the first ${measured.pages.length} of ${measured.totalPages} pages for ${file.id}.`);
  const pending: PageTranscription[] = [];
  for (const result of measured.pages.filter((p) => p.confidence < 70)) {
    try {
      const image = await renderPdfPage(env.OCR, file.id, pdf, result.page, ocrInstances(env));
      const transcription = await transcribePage(env, image, result.page);
      if (!transcription) continue;
      pending.push({ fileId: file.id, version: file.version, page: result.page, confidence: result.confidence,
        text: transcription.text, provenance: provenance(transcription.model, 'element', `Transcribed page ${result.page} of ${file.name}`, { id: file.id, name: file.name }, new Date().toISOString()),
        state: 'pending', reviewedBy: null, reviewedByName: null, reviewedAt: null });
    } catch (error) { console.warn(`AI transcription failed for ${file.id} page ${result.page}: ${String(error)}`); }
  }
  await env.FILES.put(fileKeys.transcriptions(file), JSON.stringify(pending), { httpMetadata: { contentType: 'application/json' } });
}

async function check(env: EngineEnv, file: FileRecord): Promise<DocumentCheck> {
  if (!SCANNABLE.has(file.kind)) throw new ApiError('unsupported', 'Tessera Access scans PDF, Word, and PowerPoint files.');
  try {
    return await checkDocument(file.kind, await bytesOf(env, file.key));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('invalid', `This ${file.kind.toUpperCase()} couldn't be read. It may be damaged or password-protected.`, { cause: String(error) });
  }
}

/** The document as semantic HTML: title, headings in order, paragraphs. Shared by the reading version and the EPUB. */
export function documentBody(file: Pick<FileRecord, 'name'>, doc: DocumentCheck, replacements: Map<number, PageTranscription> = new Map(), pageExtras: Map<number, string[]> = new Map()): { title: string; html: string; text: string } {
  const title = doc.text.title.trim() || file.name.replace(/\.[^.]+$/, '');
  const parts: string[] = [];
  const spoken: string[] = [title];
  let page = 0;
  for (const s of doc.text.sections) {
    if (s.page && s.page !== page && !s.heading) { page = s.page; parts.push(`<h2>Page ${page}</h2>`); }
    if (s.heading && s.level > 0) {
      const level = Math.min(Math.max(s.level + 1, 2), 6);
      parts.push(`<h${level}>${escapeHtml(s.heading)}</h${level}>`);
      spoken.push(s.heading);
      const rest = s.text.trim() === s.heading.trim() ? '' : s.text.trim();
      if (rest) { parts.push(...rest.split(/\n+/).map((p) => `<p>${escapeHtml(p)}</p>`)); spoken.push(rest); }
    } else if (s.text.trim() || (s.page && replacements.has(s.page))) {
      const replacement = s.page ? replacements.get(s.page) : undefined;
      const content = replacement?.text ?? s.text.trim();
      const paragraphs = content.split(/\n+/).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
      if (replacement) parts.push(`<section class="ai ai--block" data-state="kept"><p class="ai-who">Page ${s.page} was transcribed with AI and reviewed by ${escapeHtml(replacement.reviewedByName ?? 'a reviewer')}. <span class="ai-src">· Page ${s.page} of ${escapeHtml(file.name)}</span></p><div class="ai-body">${paragraphs}</div></section>`);
      else parts.push(paragraphs);
      spoken.push(content);
    }
    if (s.page) parts.push(...(pageExtras.get(s.page) ?? []));
  }
  return { title, html: parts.join('\n'), text: spoken.join('\n\n') };
}

function readingHtml(title: string, body: string, language: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; font: 1.125rem/1.6 system-ui, sans-serif; color: ${INK}; background: ${PAPER}; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
  p { margin: 0 0 1em; }
  img { max-width: 100%; height: auto; }
  .ai { border: 1px solid ${INK}; padding: 1rem; margin: 1rem 0; }
  .ai-who { font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p><em>Reading version generated by Tessera from the original file.</em></p>
${body}
</main>
</body>
</html>
`;
}

export async function buildEpub(title: string, body: string, language: string, id: string, images: { path: string; bytes: Uint8Array }[] = []): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const t = escapeHtml(title), lang = escapeHtml(language);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:tessera:${escapeHtml(id)}</dc:identifier><dc:title>${t}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta><meta property="schema:accessMode">textual</meta><meta property="schema:accessibilityFeature">structuralNavigation</meta><meta property="schema:accessibilityHazard">none</meta><meta property="schema:accessibilitySummary">Text and headings from the original document; reviewed images are included when available.</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>${images.map((image, index) => `<item id="image${index}" href="${image.path}" media-type="image/png"/>`).join('')}</manifest>
<spine><itemref idref="text"/></spine>
</package>`);
  const xhtml = (inner: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><title>${t}</title></head><body${extra}>${inner}</body></html>`;
  zip.file('OEBPS/nav.xhtml', xhtml(`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="text.xhtml">${t}</a></li></ol></nav>`));
  // EPUB content is XHTML: close void-free markup already; just make sure it's well formed.
  zip.file('OEBPS/text.xhtml', xhtml(`<h1>${t}</h1>\n${body}`));
  for (const image of images) zip.file(`OEBPS/${image.path}`, image.bytes);
  const out = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' });
  return Uint8Array.from(out).buffer;
}

/** Splits text into chunks under `size` characters at sentence or paragraph boundaries. */
export function speechChunks(text: string, size = TTS_CHUNK): string[] {
  const sentences = text.replace(/\s+\n/g, '\n').split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    for (let i = 0; i < sentence.length; i += size) {
      const piece = sentence.slice(i, i + size);
      if ((current + ' ' + piece).length > size && current) { chunks.push(current); current = ''; }
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function speak(env: EngineEnv, text: string): Promise<ArrayBuffer> {
  if (!env.AI) throw new ApiError('unsupported', 'Audio versions need Workers AI, which isn\'t available here.');
  const clipped = text.length > AUDIO_MAX_CHARS ? `${text.slice(0, AUDIO_MAX_CHARS)} … This audio version covers the first part of the document.` : text;
  const parts: Uint8Array[] = [];
  for (const chunk of speechChunks(clipped)) {
    const out = (await env.AI.run(TTS_MODEL as never, { text: chunk } as never)) as unknown;
    if (out instanceof ReadableStream) parts.push(new Uint8Array(await new Response(out).arrayBuffer()));
    else if (out && typeof out === 'object' && 'audio' in out && typeof (out as { audio: unknown }).audio === 'string') {
      parts.push(Uint8Array.from(atob((out as { audio: string }).audio), (c) => c.charCodeAt(0)));
    } else if (out instanceof ArrayBuffer) parts.push(new Uint8Array(out));
    else throw new ApiError('ai-failed', 'The speech model returned no audio.');
  }
  // MP3 frames concatenate into a playable stream.
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  return joined.buffer;
}

async function imageForBlock(env: EngineEnv, ctx: ServiceContext, block: Extract<Block, { type: 'image' }>): Promise<{ mime: string; bytes: ArrayBuffer }> {
  const fileId = /\/api(?:\/v1)?\/files\/([^/?#]+)\/content/.exec(block.src)?.[1];
  if (fileId) {
    const f = await ctx.repo.getFile(decodeURIComponent(fileId));
    const lesson = await ctx.repo.getLesson(block.lessonId);
    // The image must be a file of this lesson's course that the person can read.
    if (!f || !lesson || f.courseId !== lesson.courseId) throw new ApiError('not-found', 'The image file was not found in this course.');
    await canReadFile(ctx, f);
    return { mime: f.mime, bytes: await bytesOf(env, f.key) };
  }
  if (/^https:\/\//.test(block.src)) {
    const res = await fetch(block.src, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new ApiError('invalid', `The image couldn't be downloaded (${res.status}).`);
    return { mime: (res.headers.get('content-type') ?? '').split(';')[0].trim(), bytes: await res.arrayBuffer() };
  }
  throw new ApiError('unsupported', 'Upload the image to Tessera, or use an https address, to get an alt text suggestion.');
}

function provenance(model: string, task: Provenance['task'], summary: string, source: { id: string; name: string } | null, now: string): Provenance {
  return { model, task, generatedAt: now, sources: source ? [source] : [], summary };
}

export function createDocumentEngine(env: EngineEnv): DocumentEngine {
  return {
    async extract(file) {
      if (file.kind !== 'pdf' && file.kind !== 'docx') throw new ApiError('unsupported', 'Use a PDF or DOCX syllabus.');
      let doc = await check(env, file);
      let ocr = false;
      if (!doc.document?.hasText && file.kind === 'pdf') {
        const result = await runOcr(env.OCR, file.id, await bytesOf(env, file.key), undefined, ocrInstances(env));
        doc = await checkDocument('pdf', result.pdf);
        ocr = true;
      }
      if (!doc.document?.hasText) throw new ApiError('invalid', 'I could not find readable text in this file.');
      return { sections: doc.text.sections, ocr };
    },
    async scan(file): Promise<AccessReport> {
      const doc = await check(env, file);
      if (file.kind === 'pdf') {
        const alt = await readJson<PdfAlt>(env, fileKeys.alt(file), {});
        const reviewed = Object.keys(alt).length;
        doc.issues = doc.issues.flatMap((issue) => {
          if (issue.code !== 'pdf_images_no_alt') return [issue];
          const remaining = Math.max(0, issue.count - reviewed);
          if (!remaining) return [];
          const next = doc.elements.find((element) => !(String(element.index) in alt));
          return [{ ...issue, count: remaining, description: `${remaining} image(s) have no matching Figure alt text or reviewed accessible-version alt text.`, location: { ...issue.location, page: next?.page, element: next?.index } }];
        });
      }
      return { ...summarize(doc.issues, new Date().toISOString()), target: { kind: 'file', fileId: file.id, version: file.version }, issues: doc.issues, document: doc.document };
    },

    async fix(file, fix) {
      if (!SCANNABLE.has(file.kind)) throw new ApiError('unsupported', 'Only PDF, Word, and PowerPoint files can be fixed.');
      let fixed: ArrayBuffer;
      if (fix.kind === 'alt-text' && file.kind === 'pdf') {
        const source = await bytesOf(env, file.key);
        const doc = await checkDocument('pdf', source);
        if (!doc.elements.some((element) => element.index === fix.element && element.kind === 'image')) throw new ApiError('invalid', 'That PDF image does not exist.');
        fixed = source.slice(0);
      } else if (fix.kind === 'ocr') {
        if (file.kind !== 'pdf') throw new ApiError('invalid', 'OCR is for scanned PDFs.');
        fixed = (await runOcr(env.OCR, file.id, await bytesOf(env, file.key), fix.language, ocrInstances(env))).pdf;
      } else try {
        fixed = await applyFix(file.kind, await bytesOf(env, file.key), fix);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('invalid', error instanceof Error ? error.message : 'This fix couldn\'t be applied.');
      }
      const version = file.version + 1;
      const key = fileKeys.version(file, version);
      await env.FILES.put(key, fixed, { httpMetadata: { contentType: file.mime } });
      const updated = { ...file, key, version, size: fixed.byteLength, scan: null };
      if (file.kind === 'pdf') {
        const alt = await readJson<PdfAlt>(env, fileKeys.alt(file), {});
        if (fix.kind === 'alt-text') alt[String(fix.element)] = { alt: fix.alt, decorative: fix.decorative };
        if (Object.keys(alt).length) await env.FILES.put(fileKeys.alt(updated), JSON.stringify(alt));
        if (fix.kind === 'ocr' || await env.FILES.get(fileKeys.ocrSource(file))) await env.FILES.put(fileKeys.ocrSource(updated), JSON.stringify(true));
      }
      return updated;
    },

    async suggest(target, ctx) {
      const now = ctx.now();
      if ('block' in target) {
        const b = target.block;
        if (target.kind === 'alt-text') {
          if (b.type !== 'image') throw new ApiError('invalid', 'Alt text suggestions are for image blocks.');
          const out = await describeImage(env, await imageForBlock(env, ctx, b), [target.courseTitle, b.caption].filter(Boolean).join(' · '));
          return { suggestion: out.text, provenance: provenance(out.model, 'alt-text', 'Alt text suggested from the image', null, now) };
        }
        if (target.kind === 'link-text') {
          if (b.type !== 'link') throw new ApiError('invalid', 'Link text suggestions are for link blocks.');
          const r = await ctx.ai.run('link-text', { courseTitle: target.courseTitle, href: b.href, currentText: b.text, context: b.description });
          return { suggestion: r.output.text, provenance: provenance(r.model, 'link-text', `Link text suggested for ${b.href}`, null, now) };
        }
        const text = b.type === 'text' ? b.text : b.type === 'callout' ? b.text : b.type === 'document' ? b.sections.map((s) => `${s.heading}\n${s.text}`).join('\n\n') : '';
        if (!text.trim()) throw new ApiError('invalid', 'Plain-language rewrites are for blocks with text.');
        const r = await ctx.ai.run('rewrite', { courseTitle: target.courseTitle, text });
        return { suggestion: r.output.text, provenance: provenance(r.model, 'rewrite', 'Plain-language rewrite of this block', null, now) };
      }
      const f = target.file;
      const source = { id: f.id, name: f.name };
      if (target.kind !== 'alt-text') throw new ApiError('unsupported', 'For files, Tessera suggests alt text; rewrite the text in the original document.');
      if (f.kind === 'pdf' && !env.OCR) throw new ApiError('unsupported', 'Tessera can\'t extract images from PDFs yet; describe this image from the page.');
      const bytes = await bytesOf(env, f.key);
      const extracted = f.kind === 'pdf' ? await extractPdfImages(env.OCR, f.id, bytes, ocrInstances(env)) : null;
      const matched = extracted?.images.find((entry) => entry.index === target.element);
      const image = matched ? { mime: 'image/png', bytes: Uint8Array.from(pngBytes(matched.png)).buffer } : await extractImage(f.kind, bytes, target.element);
      if (!image) throw new ApiError('unsupported', 'That image wasn\'t found in the file.');
      const out = await describeImage(env, image, `${target.courseTitle} · ${f.name}`);
      return { suggestion: out.text, provenance: provenance(out.model, 'alt-text', `Alt text suggested for image ${target.element + 1} in ${f.name}`, source, now) };
    },

    async generateFormat(file, format, allowAi = true) {
      const key = fileKeys.format(file, format);
      const meta = { httpMetadata: { contentType: FORMAT_FILES[format].mime } };
      if (format === 'ocr') {
        if (file.kind !== 'pdf') throw new ApiError('unsupported', 'OCR is for scanned PDFs.');
        const original = await bytesOf(env, file.key);
        await env.FILES.put(key, (await runOcr(env.OCR, file.id, original, undefined, ocrInstances(env))).pdf, meta);
        if (allowAi) await secondPass(env, file, original);
        return key;
      }
      let doc = await check(env, file);
      if (file.kind === 'pdf' && allowAi && (format === 'reading' || format === 'epub') && await env.FILES.get(fileKeys.ocrSource(file))) {
        await secondPass(env, file, await bytesOf(env, file.key));
      }
      if (!doc.document?.hasText && file.kind === 'pdf') {
        // A scan: use its OCR text, running OCR first if it hasn't been.
        const ocrKey = fileKeys.format(file, 'ocr');
        let ocr = await env.FILES.get(ocrKey);
        if (!ocr) { await env.FILES.put(ocrKey, (await runOcr(env.OCR, file.id, await bytesOf(env, file.key), undefined, ocrInstances(env))).pdf, { httpMetadata: { contentType: FORMAT_FILES.ocr.mime } }); ocr = await env.FILES.get(ocrKey); }
        doc = await checkDocument('pdf', await ocr!.arrayBuffer());
        if (allowAi) await secondPass(env, file, await bytesOf(env, file.key));
      }
      if (!doc.document?.hasText) throw new ApiError('unsupported', 'This file has no text to convert, even after OCR.');
      const language = 'en';
      const kept = new Map((await readJson<PageTranscription[]>(env, fileKeys.transcriptions(file), [])).filter((entry) => entry.state === 'kept').map((entry) => [entry.page, entry]));
      const extra = new Map<number, string[]>();
      const epubImages: { path: string; bytes: Uint8Array }[] = [];
      if (file.kind === 'pdf' && env.OCR && (format === 'reading' || format === 'epub')) {
        const alt = await readJson<PdfAlt>(env, fileKeys.alt(file), {});
        if (Object.keys(alt).length) {
          const extracted = await extractPdfImages(env.OCR, file.id, await bytesOf(env, file.key), ocrInstances(env));
          for (const image of extracted.images) {
            const saved = alt[String(image.index)];
            if (!saved) continue;
            const path = `images/image-${image.index}.png`;
            const src = format === 'reading' ? `data:image/png;base64,${image.png}` : path;
            const tags = extra.get(image.page) ?? [];
            tags.push(`<p><img src="${src}" alt="${escapeHtml(saved.decorative ? '' : saved.alt)}" /></p>`);
            extra.set(image.page, tags);
            if (format === 'epub') epubImages.push({ path, bytes: pngBytes(image.png) });
          }
        }
      }
      const { title, html, text } = documentBody(file, doc, kept, extra);
      if (format === 'reading') await env.FILES.put(key, readingHtml(title, html, language), meta);
      else if (format === 'epub') await env.FILES.put(key, await buildEpub(title, html, language, `${file.id}-v${file.version}`, epubImages), meta);
      else await env.FILES.put(key, await speak(env, text), meta);
      return key;
    },

    async listTranscriptions(file) { return readJson<PageTranscription[]>(env, fileKeys.transcriptions(file), []); },
    async reviewTranscription(file, page, decision, reviewer: User, now) {
      const all = await readJson<PageTranscription[]>(env, fileKeys.transcriptions(file), []);
      const current = all.find((entry) => entry.page === page);
      if (!current) throw new ApiError('not-found', 'Transcription not found for this file version.');
      if (current.state !== 'pending') throw new ApiError('conflict', 'This transcription was already reviewed.');
      current.state = decision === 'keep' ? 'kept' : 'discarded';
      current.reviewedBy = reviewer.id; current.reviewedByName = reviewer.name; current.reviewedAt = now;
      await env.FILES.put(fileKeys.transcriptions(file), JSON.stringify(all));
      return all;
    },
    async pageImage(file, page) {
      const doc = await check(env, file);
      if (page > (doc.document?.pages ?? 0)) throw new ApiError('not-found', 'Page not found.');
      return renderPdfPage(env.OCR, file.id, await bytesOf(env, file.key), page, ocrInstances(env));
    },

    async remove(file) {
      let cursor: string | undefined;
      do {
        const page = await env.FILES.list({ prefix: fileKeys.prefix(file), cursor });
        if (page.objects.length) await env.FILES.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}
