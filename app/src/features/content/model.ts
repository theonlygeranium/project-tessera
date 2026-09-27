import type { BlockContent } from '../../../../shared/domain';

export type DocumentContent = Extract<BlockContent, { type: 'document' }>;
export type TableContent = Extract<BlockContent, { type: 'table' }>;
export type ScenarioContent = Extract<BlockContent, { type: 'scenario' }>;
export type LinkContent = Extract<BlockContent, { type: 'link' }>;
export type VideoContent = Extract<BlockContent, { type: 'video' }>;
export type ScenarioNode = ScenarioContent['nodes'][number];
export type ScenarioChoice = ScenarioNode['choices'][number];

/** Same host rule as `validateBlockContent` for a YouTube or Vimeo URL. */
const VIDEO_URL = /^https:\/\/(?:www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//;

export const LIMITS = {
  sections: 40,
  rows: 200,
  columns: 20,
  nodes: 60,
  choices: 6,
  minutes: 600,
} as const;

export function moveItem<T>(items: readonly T[], index: number, offset: number): T[] {
  const next = index + offset;
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) return items.slice();
  const copy = items.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function uniqueId(prefix: string, used: readonly string[]): string {
  const taken = new Set(used);
  let n = used.length + 1;
  let id = `${prefix}-${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `${prefix}-${n}`;
  }
  return id;
}

/** Blank lines start a new paragraph, matching the lesson text block. */
export function paragraphList(text: string): string[] {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

export function minutesLabel(minutes: number): string {
  const n = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export function nodeOptionLabel(node: { id: string; text: string }): string {
  const words = node.text.trim().split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  return words ? `${node.id} — ${words}` : node.id;
}

export function pointsNowhere(nextNodeId: string, nodeIds: readonly string[]): boolean {
  return !nodeIds.includes(nextNodeId);
}

/** Pads or clips every row to the same width. An empty table becomes two blank cells. */
export function rectangular(rows: readonly (readonly string[])[]): string[][] {
  if (rows.length === 0) return [['', '']];
  const width = Math.min(LIMITS.columns, Math.max(1, ...rows.map((row) => row.length)));
  return rows.slice(0, LIMITS.rows).map((row) => {
    const cells = row.slice(0, width);
    while (cells.length < width) cells.push('');
    return cells;
  });
}

export function setCell(rows: readonly (readonly string[])[], rowIndex: number, columnIndex: number, text: string): string[][] {
  return rectangular(rows).map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === columnIndex ? text : cell)) : row));
}

export function addRow(rows: readonly (readonly string[])[]): string[][] {
  const grid = rectangular(rows);
  if (grid.length >= LIMITS.rows) return grid;
  return [...grid, Array(grid[0].length).fill('')];
}

export function removeRow(rows: readonly (readonly string[])[], index: number): string[][] {
  const grid = rectangular(rows);
  if (grid.length <= 1) return grid;
  return grid.filter((_, i) => i !== index);
}

export function moveRow(rows: readonly (readonly string[])[], index: number, offset: number): string[][] {
  return moveItem(rectangular(rows), index, offset);
}

export function addColumn(rows: readonly (readonly string[])[]): string[][] {
  const grid = rectangular(rows);
  if (grid[0].length >= LIMITS.columns) return grid;
  return grid.map((row) => [...row, '']);
}

export function removeColumn(rows: readonly (readonly string[])[], index: number): string[][] {
  const grid = rectangular(rows);
  if (grid[0].length <= 1) return grid;
  return grid.map((row) => row.filter((_, i) => i !== index));
}

export function moveColumn(rows: readonly (readonly string[])[], index: number, offset: number): string[][] {
  return rectangular(rows).map((row) => moveItem(row, index, offset));
}

export function videoProviderFromUrl(src: string): 'youtube' | 'vimeo' | null {
  const match = VIDEO_URL.exec(src.trim());
  if (!match) return null;
  return match[1] === 'vimeo.com' || match[1] === 'player.vimeo.com' ? 'vimeo' : 'youtube';
}

export function videoUrlError(src: string, provider: VideoContent['provider']): string | undefined {
  if (provider === 'upload') return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;
  const detected = videoProviderFromUrl(trimmed);
  if (!detected) return 'Enter a YouTube or Vimeo URL, starting with https://.';
  if (detected !== provider) return detected === 'youtube'
    ? 'This URL is YouTube. Set the provider to YouTube, or paste a Vimeo URL.'
    : 'This URL is Vimeo. Set the provider to Vimeo, or paste a YouTube URL.';
  return undefined;
}

/** WCAG 1.2.2: a video is publishable once it has a transcript or a captions file. */
export function videoHasCaptionsOrTranscript(value: Pick<VideoContent, 'transcript' | 'captionsFileId'>): boolean {
  return value.transcript.trim().length > 0 || Boolean(value.captionsFileId && value.captionsFileId.trim());
}

export function embedSrc(value: Pick<VideoContent, 'src' | 'provider'>): string | null {
  if (value.provider === 'upload') return null;
  let url: URL;
  try {
    url = new URL(value.src.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (value.provider === 'youtube') {
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'youtube.com') {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery) return `https://www.youtube.com/embed/${encodeURIComponent(fromQuery)}`;
      const [kind, id] = url.pathname.split('/').filter(Boolean);
      if ((kind === 'embed' || kind === 'shorts' || kind === 'live') && id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    return null;
  }
  if (host === 'player.vimeo.com') {
    const [kind, id] = url.pathname.split('/').filter(Boolean);
    return kind === 'video' && id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).reverse().find((part) => /^\d+$/.test(part));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

/** Lane A serves file bytes at this path. `src` on an upload is the file id. */
export function fileContentUrl(id: string): string {
  const trimmed = id.trim();
  if (/^\/api\/v1\/files\/.+\/content$/.test(trimmed)) return trimmed;
  return `/api/v1/files/${encodeURIComponent(trimmed)}/content`;
}

export function linkUrlError(href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//.test(trimmed)) return 'Enter a URL that starts with http:// or https://.';
  return undefined;
}

const QUALITY_TEXT: Record<ScenarioChoice['quality'], string> = {
  best: 'Best choice.',
  okay: 'Okay choice.',
  poor: 'Poor choice.',
};

export function qualityText(quality: ScenarioChoice['quality']): string {
  return QUALITY_TEXT[quality];
}
