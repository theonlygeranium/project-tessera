import type { DesignSource, SourceSpan } from '../domain';

const normalize = (text: string): string => text.toLocaleLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑‒–—−]/g, '-')
  .replace(/(\p{L})-\s+(?=\p{L})/gu, '$1').replace(/\s+/g, ' ').trim();

/** Ground every citation without changing the model's passage wording. */
export function groundSpans<T>(value: T, source: DesignSource): { value: T; unmatched: number } {
  let unmatched = 0;
  const sections = source.sections.map(section => ({ section, text: normalize([section.heading, ...section.lines].join(' ')) }));
  const whole = sections.map(item => item.text).join(' ');
  const pages = new Set(source.sections.map(section => section.page).filter((page): page is number => page != null));
  const match = (span: SourceSpan): SourceSpan => {
    const fragments = span.text.split(/\.\.\.|…/).map(normalize).filter(part => part.length >= 12);
    const wanted = fragments.length ? fragments : [normalize(span.text)].filter(Boolean);
    // A quote usually sits in one section; one that runs across a page or heading boundary is
    // anchored where it starts.
    const found = wanted.length ? sections.find(item => wanted.every(part => item.text.includes(part)))
      ?? (whole.includes(wanted.join(' ')) || wanted.every(part => whole.includes(part)) ? sections.find(item => item.text.includes(wanted[0].slice(0, 40))) : undefined) : undefined;
    if (found) return { ...span, page: found.section.page, section: found.section.heading || (source.fileId && found.section.page === null ? 'start' : null) };
    unmatched++;
    const label = span.section?.replace(/^\[?§\s*/, '').replace(/\]$/, '').trim();
    const real = source.sections.find(section => section.heading ? normalize(section.heading) === normalize(label ?? '') : label === 'start' && source.fileId && section.page === null);
    // Never keep a page the document doesn't have.
    return { ...span, page: span.page != null && pages.has(span.page) ? span.page : null, section: real ? real.heading || 'start' : null };
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
