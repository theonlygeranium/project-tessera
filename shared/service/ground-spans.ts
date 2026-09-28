import type { DesignSource, SourceSpan } from '../domain';

const normalize = (text: string): string => text.toLocaleLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑‒–—−]/g, '-')
  .replace(/(\p{L})-\s+(?=\p{L})/gu, '$1').replace(/\s+/g, ' ').trim();

/** Ground every citation without changing the model's passage wording. */
export function groundSpans<T>(value: T, source: DesignSource): { value: T; unmatched: number } {
  let unmatched = 0;
  const sections = source.sections.map(section => ({ section, text: normalize([section.heading, ...section.lines].join(' ')) }));
  const match = (span: SourceSpan): SourceSpan => {
    const fragments = span.text.split(/\.\.\.|…/).map(normalize).filter(part => part.length >= 12);
    const wanted = fragments.length ? fragments : [normalize(span.text)].filter(Boolean);
    const found = wanted.length ? sections.find(item => wanted.every(part => item.text.includes(part))) : undefined;
    if (found) return { ...span, page: found.section.page, section: found.section.heading || (source.fileId && found.section.page === null ? 'start' : null) };
    unmatched++;
    const label = span.section?.replace(/^\[?§\s*/, '').replace(/\]$/, '').trim();
    const real = source.sections.find(section => section.heading ? normalize(section.heading) === normalize(label ?? '') : label === 'start' && source.fileId && section.page === null);
    return { ...span, section: real ? real.heading || 'start' : null };
  };
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      if ('page' in node && 'text' in node && typeof (node as SourceSpan).text === 'string') return match(node as SourceSpan);
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item)]));
    }
    return node;
  };
  return { value: walk(value) as T, unmatched };
}
