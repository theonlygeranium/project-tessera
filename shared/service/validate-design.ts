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
      if ('page' in node && 'text' in node) spans.push(node as SourceSpan);
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
      if ('page' in node && 'text' in node) spans.push(node as SourceSpan);
      else if (Array.isArray(node)) node.forEach(collect);
      else Object.values(node).forEach(collect);
    }
  };
  collect(read);
  validateSpans(spans, source);
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

const OPENER = 'Here is what I understood, and here is what I need from you.';
type ReadOutput = AiTasks['syllabus-analyze']['output'];
/**
 * Repairs what a model's read can safely lose or garble before `validateRead` checks it:
 * one audit per outcome (Tessera's rule-based audit fills a missing one), no links to unknown
 * outcomes or assessments, no rubric numbers that don't exist, Palmer scores inside their
 * ranges, and the fixed summary opener. Shape errors are left for `validateRead` to reject.
 * Returns what was repaired so the provenance can say so.
 */
export function repairRead(output: unknown, extraction: SyllabusExtraction, fallback: ReadOutput): { value: unknown; repairs: string[] } {
  if (!output || typeof output !== 'object') return { value: output, repairs: [] };
  const read = structuredClone(output) as Partial<ReadOutput> & Record<string, unknown>;
  const repairs: string[] = [];
  const outcomes = new Set(extraction.outcomes.map(item => item.id));
  const assessments = new Set(extraction.assessments.map(item => item.id));
  if (typeof read.summary === 'string' && !read.summary.startsWith(OPENER)) { read.summary = `${OPENER} ${read.summary.trim()}`; repairs.push('summary opener'); }
  if (Array.isArray(read.outcomeAudits)) {
    const seen = new Map<string, ReadOutput['outcomeAudits'][number]>();
    for (const audit of read.outcomeAudits) if (audit && outcomes.has(audit.outcomeId) && !seen.has(audit.outcomeId)) seen.set(audit.outcomeId, audit);
    const filled = extraction.outcomes.filter(item => !seen.has(item.id));
    if (filled.length) repairs.push(`rule-based audit for ${filled.map(item => item.id).join(', ')}`);
    if (seen.size !== read.outcomeAudits.length) repairs.push('duplicate or unknown audits removed');
    read.outcomeAudits = extraction.outcomes.map(item => seen.get(item.id) ?? fallback.outcomeAudits.find(audit => audit.outcomeId === item.id)!).filter(Boolean)
      .map(audit => Array.isArray(audit.assessedBy) ? { ...audit, assessedBy: audit.assessedBy.filter(link => assessments.has(link?.assessmentId)) } : audit);
  }
  if (Array.isArray(read.alignment)) {
    const kept = read.alignment.filter(link => link && outcomes.has(link.outcomeId) && assessments.has(link.assessmentId));
    if (kept.length !== read.alignment.length) repairs.push('links to unknown outcomes or assessments removed');
    read.alignment = kept;
  }
  const palmer = read.learnerCenteredness?.palmer;
  if (palmer && Array.isArray(palmer.components)) {
    const components = palmer.components.map(item => ({ ...item, score: Math.max(0, Math.min(item.score, item.max)) }));
    const score = Math.max(0, Math.min(46, components.reduce((sum, item) => sum + item.score, 0)));
    if (score !== palmer.score || components.some((item, i) => item.score !== palmer.components[i].score)) repairs.push('Palmer scores kept within range');
    read.learnerCenteredness = { ...read.learnerCenteredness!, palmer: { ...palmer, components, score, band: score >= 30 ? 'learning-focused' : score >= 15 ? 'transitional' : 'content-focused' } };
  }
  if (Array.isArray(read.deficiencies)) {
    const builtIn = { tessera: new Set(TESSERA_RUBRIC.standards.flatMap(standard => standard.items.map(item => item.number))), oscqr: new Set(OSCQR_RUBRIC.standards.flatMap(standard => standard.items.map(item => item.number))) };
    let dropped = 0;
    read.deficiencies = read.deficiencies.map(item => {
      if (!item || !Array.isArray(item.rubricRefs)) return item;
      const rubricRefs = item.rubricRefs.filter(ref => ref && (ref.rubric === 'qm' || builtIn[ref.rubric as 'tessera' | 'oscqr']?.has(ref.item)));
      dropped += item.rubricRefs.length - rubricRefs.length;
      return { ...item, rubricRefs };
    });
    if (dropped) repairs.push(`${dropped} unknown rubric reference${dropped === 1 ? '' : 's'} removed`);
  }
  return { value: read, repairs };
}

