import type { AiTasks } from '../ai';

type Extraction = AiTasks['syllabus-extract']['output'];
const JUNK = /^[\s:,;"'\-–—]*(?:null|undefined|n\/a)?[\s:,;"'\-–—]*$/i;
const clean = (value: string) => (JUNK.test(value) ? '' : value.trim());
const joined = (values: string[]) => [...new Set(values.map(clean).filter(Boolean))].join('; ');

/**
 * Tidies a model's extraction before validation, without inventing anything: strings that are
 * only punctuation or "null" become empty, a cross-listed code keeps its first (primary) code,
 * and schedule rows that share a week are merged (a syllabus may list an "Introduction" row and
 * "Module 1" for the same dates). Leaves anything it doesn't recognise unchanged.
 */
export function normalizeExtraction(output: unknown): unknown {
  if (!output || typeof output !== 'object') return output;
  const ex = structuredClone(output) as Extraction;
  const code = ex.profile?.code;
  if (code && typeof code.value === 'string') {
    const codes = code.value.match(/\b[A-Z]{2,5}\s?-?\d{3,4}[A-Z]?\b/g);
    if (codes && codes.length > 1) code.value = codes[0];
  }
  if (Array.isArray(ex.schedule)) {
    const byWeek = new Map<number, Extraction['schedule']>();
    for (const row of ex.schedule) {
      if (!row || typeof row !== 'object') continue;
      const clean_ = { ...row, dates: clean(String(row.dates ?? '')), topic: clean(String(row.topic ?? '')), reading: clean(String(row.reading ?? '')), due: clean(String(row.due ?? '')) };
      byWeek.set(row.week, [...(byWeek.get(row.week) ?? []), clean_]);
    }
    ex.schedule = [...byWeek.entries()].sort(([a], [b]) => a - b).map(([week, rows]) => rows.length === 1 ? rows[0] : {
      week,
      dates: rows.find(row => row.dates)?.dates ?? '',
      topic: joined(rows.map(row => row.topic)),
      reading: joined(rows.map(row => row.reading)),
      due: joined(rows.map(row => row.due)),
      span: rows.find(row => row.span)?.span ?? null,
      empty: rows.every(row => row.empty || !row.topic),
    });
  }
  if (Array.isArray(ex.assessments)) ex.assessments = ex.assessments.map(item => item && typeof item === 'object' ? { ...item, format: clean(String(item.format ?? '')), dueAt: item.dueAt == null || JUNK.test(String(item.dueAt)) ? null : item.dueAt } : item);
  return ex;
}
