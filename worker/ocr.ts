// OCR for scanned PDFs (D-022, option B): a Cloudflare Container running OCRmyPDF and
// Tesseract (containers/ocr/). The Worker sends a PDF and gets back a searchable PDF.
// Up to three instances run at once; each sleeps after a few idle minutes.
import { Container, getContainer } from '@cloudflare/containers';
import { ApiError } from '../shared/api';

export class OcrContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '3m';
  enableInternet = false;
  pingEndpoint = 'localhost/health';
}

const LANGS: Record<string, string> = { en: 'eng', es: 'spa', fr: 'fra' };

/** Tesseract language codes for a BCP 47 tag; English when unknown. */
export function tesseractLang(language: string | null | undefined): string {
  return LANGS[(language ?? 'en').toLowerCase().split('-')[0]] ?? 'eng';
}

/**
 * Spreads files across instances by id, so one large scan doesn't queue every other
 * request. `instances` must not exceed the environment's `max_instances` (OCR_INSTANCES:
 * 3 in production, 1 in previews), or the extra instances fail to start.
 */
export function instanceFor(fileId: string, instances = 1): string {
  let h = 0;
  for (const c of fileId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `ocr-${h % Math.max(1, Math.floor(instances))}`;
}

export async function runOcr(binding: DurableObjectNamespace<OcrContainer> | undefined, fileId: string, pdf: ArrayBuffer, language?: string, instances = 1): Promise<{ pdf: ArrayBuffer; pages: number; seconds: number }> {
  if (!binding) throw new ApiError('unsupported', 'OCR isn\'t available in this environment.');
  const res = await getContainer(binding, instanceFor(fileId, instances)).fetch(new Request(`http://ocr/ocr?lang=${tesseractLang(language)}`, {
    method: 'POST', body: pdf, headers: { 'content-type': 'application/pdf' },
  }));
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 413) throw new ApiError('too-large', 'OCR accepts PDFs up to 30 MB.');
    throw new ApiError('ai-failed', 'OCR couldn\'t read this PDF.', { status: res.status, detail: detail.slice(0, 300) });
  }
  return { pdf: await res.arrayBuffer(), pages: Number(res.headers.get('x-ocr-pages') ?? 0), seconds: Number(res.headers.get('x-ocr-seconds') ?? 0) };
}
