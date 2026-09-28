import { ApiError } from '../api';
import type { ArchitectureId, DesignSource, SourceSpan, StructureOption } from '../domain';

/** Check cited pages against the source document's anchored pages. */
export function validateSpans(spans: SourceSpan[], source: DesignSource): void {
  const pages = source.sections.map(section => section.page).filter((page): page is number => page !== null);
  const first = Math.min(...pages);
  const last = Math.max(...pages);
  spans.forEach((span, index) => {
    const valid = source.fileId === null
      ? span.page === null
      : Number.isInteger(span.page) && span.page !== null && span.page >= first && span.page <= last;
    if (!valid) throw new ApiError('invalid', `spans[${index}].page is outside the source page range.`);
  });
}

/** Reject the unsupported learning-styles claim anywhere in JSON output. */
export function validateNoLearningStyles(value: unknown): void {
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string' && /learning style/i.test(node)) {
      throw new ApiError('invalid', `${path} contains "learning style".`);
    }
    if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (node !== null && typeof node === 'object') {
      Object.entries(node).forEach(([key, item]) => { walk(key, `${path}.${key}`); walk(item, `${path}.${key}`); });
    }
  };
  walk(value, 'value');
}

/** The model may describe only the deterministic candidates selected by the service. */
export function validateArchitectureIds(options: StructureOption[], candidates: ArchitectureId[]): void {
  if (options.length !== candidates.length || new Set(options.map(option => option.id)).size !== candidates.length ||
      options.some(option => !candidates.includes(option.id))) {
    throw new ApiError('invalid', 'options must have exactly the candidate architecture ids.');
  }
}
