import { ApiError } from '../api';
import type { ArchitectureId, DesignSource, SourceSpan, StructureOption, SyllabusExtraction } from '../domain';
import type { AiTasks } from '../ai';
import { SyllabusExtractionSchema, InstructionalReadSchema } from '../schema/domain';
import { OSCQR_RUBRIC, TESSERA_RUBRIC } from '../quality/rubrics';

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

/** Validate the model's read before writing it to a design session. */
export function validateRead(output: unknown, extraction: SyllabusExtraction, source: DesignSource): AiTasks['syllabus-analyze']['output'] {
  const parsed = InstructionalReadSchema.omit({ workload: true, provenance: true }).strict().safeParse(output);
  if (!parsed.success) throw new ApiError('invalid', 'The instructional read has an invalid shape.');
  const read = parsed.data;
  if (!read.summary.startsWith('Here is what I understood, and here is what I need from you.')) throw new ApiError('invalid', 'The instructional summary must open with what was understood and what is needed.');
  const outcomes = new Set(extraction.outcomes.map(item => item.id));
  const assessments = new Set(extraction.assessments.map(item => item.id));
  if (read.outcomeAudits.length !== outcomes.size || new Set(read.outcomeAudits.map(item => item.outcomeId)).size !== outcomes.size || read.outcomeAudits.some(item => !outcomes.has(item.outcomeId))) throw new ApiError('invalid', 'The read does not audit every outcome exactly once.');
  if (read.outcomeAudits.some(item => item.assessedBy.some(link => !assessments.has(link.assessmentId))) || read.alignment.some(link => !outcomes.has(link.outcomeId) || !assessments.has(link.assessmentId))) throw new ApiError('invalid', 'The read references an unknown outcome or assessment.');
  if (read.learnerCenteredness && (read.learnerCenteredness.palmer.score < 0 || read.learnerCenteredness.palmer.score > 46 || read.learnerCenteredness.palmer.components.some(item => item.score < 0 || item.score > item.max))) throw new ApiError('invalid', 'Palmer score is outside its range.');
  const builtIn = { tessera: new Set(TESSERA_RUBRIC.standards.flatMap(standard => standard.items.map(item => item.number))), oscqr: new Set(OSCQR_RUBRIC.standards.flatMap(standard => standard.items.map(item => item.number))) };
  if (read.deficiencies.some(deficiency => deficiency.rubricRefs.some(ref => ref.rubric !== 'qm' && !builtIn[ref.rubric].has(ref.item)))) throw new ApiError('invalid', 'The read cites an unknown built-in rubric item.');
  const spans: SourceSpan[] = [];
  const collect = (node: unknown): void => {
    if (node && typeof node === 'object') {
      if ('page' in node && 'text' in node && Object.keys(node).length === 2) spans.push(node as SourceSpan);
      else if (Array.isArray(node)) node.forEach(collect);
      else Object.values(node).forEach(collect);
    }
  };
  collect(read);
  validateSpans(spans, source);
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  spans.forEach((span, index) => {
    const passage = normalize(span.text);
    const pageText = normalize(source.sections.filter(section => section.page === span.page).map(section => section.text).join(' '));
    if (!passage || !pageText.includes(passage)) throw new ApiError('invalid', `spans[${index}].text is not in the cited source page.`);
  });
  validateNoLearningStyles(read);
  return read;
}

export function validateObjectiveRewrite(output: unknown): AiTasks['objective-rewrite']['output'] {
  if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).sort().join(',') !== 'text,why' ||
      typeof (output as { text?: unknown }).text !== 'string' || typeof (output as { why?: unknown }).why !== 'string' ||
      !(output as { text: string }).text.trim() || !(output as { why: string }).why.trim()) throw new ApiError('invalid', 'The suggested rewrite has an invalid shape.');
  validateNoLearningStyles(output);
  return output as AiTasks['objective-rewrite']['output'];
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
