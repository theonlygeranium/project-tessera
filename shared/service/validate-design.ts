import { ApiError } from '../api';
import type { ArchitectureId, DesignSource, SourceSpan, StructureOption } from '../domain';
import type { AiTasks } from '../ai';
import { SyllabusExtractionSchema } from '../schema/domain';

/** Check cited pages against the source document's anchored pages. */
export function validateSpans(spans: SourceSpan[], source: DesignSource): void {
  const pages = source.sections.map(section => section.page).filter((page): page is number => page !== null);
  const available = new Set(pages);
  spans.forEach((span, index) => {
    const valid = available.size === 0 ? span.page === null : span.page !== null && available.has(span.page);
    if (!valid) throw new ApiError('invalid', `spans[${index}].page is outside the source page range.`);
  });
}

/** Validate the complete extraction before any session field is written. */
export function validateExtraction(output: unknown, source: DesignSource): AiTasks['syllabus-extract']['output'] {
  const parsed = SyllabusExtractionSchema.omit({ problems: true, provenance: true }).strict().safeParse(output);
  if (!parsed.success) throw new ApiError('invalid', 'The syllabus extraction has an invalid shape.');
  const value = parsed.data;
  const ids = [...value.outcomes.map(item => item.id), ...value.assessments.map(item => item.id)];
  if (new Set(ids).size !== ids.length) throw new ApiError('invalid', 'The syllabus extraction repeats an id.');
  if (value.assessments.some(item => item.weightPercent !== null && (item.weightPercent < 0 || item.weightPercent > 100))) throw new ApiError('invalid', 'A grading weight is outside 0–100%.');
  const spans: SourceSpan[] = [];
  const collect = (node: unknown): void => {
    if (node && typeof node === 'object') {
      if ('page' in node && 'text' in node && Object.keys(node).length === 2) spans.push(node as SourceSpan);
      else if (Array.isArray(node)) node.forEach(collect);
      else Object.values(node).forEach(collect);
    }
  };
  collect(value);
  validateSpans(spans, source);
  validateNoLearningStyles(value);
  return value;
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
