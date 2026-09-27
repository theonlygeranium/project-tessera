// Alt text from an image (D-019, D-022). Palmyra-X6 has no vision, so this uses
// Palmyra-X5 through the same AI Gateway route; without a Writer key it falls back to a
// Workers AI vision model, and without either it returns a deterministic placeholder
// (tests, local development). Whatever it returns is a suggestion a person edits.
import { ApiError } from '../../shared/api';

export interface VisionEnv {
  WRITER_API_KEY?: string;
  AI_GATEWAY_URL?: string;
  AI?: Ai;
}

export interface ImageInput { mime: string; bytes: ArrayBuffer }

const WRITER_DIRECT = 'https://api.writer.com/v1/chat/completions';
const VISION_MODEL = 'palmyra-x5';
const FALLBACK_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PROMPT = (context: string) => `Write alt text for this image in a university course.
${context ? `Context: ${context}\n` : ''}Rules: one or two sentences, under 250 characters. Say what the image shows and the point it makes for a learner (for a chart: the variables and the main trend). Don't start with "Image of" or "Picture of". Don't guess names of real people. Reply with the alt text only.`;

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Trims quotes, a leading "Alt text:" label, and runaway length. */
export function cleanAlt(text: string): string {
  return text.trim().replace(/^alt(?:ernative)? text:\s*/i, '').replace(/^["'“]|["'”]$/g, '').replace(/^(?:an? )?(?:image|picture|photo) of\s+/i, '').trim().slice(0, 300);
}

export async function describeImage(env: VisionEnv, image: ImageInput, context: string, fetchImpl: typeof fetch = fetch): Promise<{ text: string; model: string }> {
  if (image.bytes.byteLength > MAX_IMAGE_BYTES) throw new ApiError('too-large', 'The image is over 5 MB; alt text suggestions need a smaller image.');
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(image.mime)) throw new ApiError('unsupported', `Alt text suggestions support PNG, JPEG, GIF, and WebP images, not ${image.mime}.`);

  if (env.WRITER_API_KEY) {
    const res = await fetchImpl(env.AI_GATEWAY_URL || WRITER_DIRECT, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.WRITER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT(context) },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${base64(image.bytes)}` } },
        ] }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new ApiError('ai-failed', `The vision model returned ${res.status}.`, { status: res.status, detail: (await res.text()).slice(0, 300) });
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = cleanAlt(body.choices?.[0]?.message?.content ?? '');
    if (!text) throw new ApiError('ai-failed', 'The vision model returned an empty description.');
    return { text, model: VISION_MODEL };
  }

  if (env.AI) {
    const out = (await env.AI.run(FALLBACK_MODEL as never, { image: [...new Uint8Array(image.bytes)], prompt: PROMPT(context), max_tokens: 200 } as never)) as { description?: string };
    const text = cleanAlt(out.description ?? '');
    if (!text) throw new ApiError('ai-failed', 'The vision model returned an empty description.');
    return { text, model: FALLBACK_MODEL };
  }

  return { text: `A figure${context ? ` for ${context.slice(0, 80)}` : ''}. Describe what it shows and the point it makes.`, model: 'fixture' };
}
