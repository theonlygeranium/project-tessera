import { ApiError } from '../api';
import type { BlockContent, CourseBrief, OutlineDraft } from '../domain';

const invalid = (message: string): never => { throw new ApiError('invalid', message); };
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : invalid('Expected an object.');
const str = (v: unknown, field: string, required = false): string => {
  if (typeof v !== 'string') return invalid(`${field} must be a string.`);
  const value = v.trim();
  if (required && !value) return invalid(`${field} is required.`);
  return value;
};
const intRange = (v: unknown, field: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : invalid(`${field} must be ${min}–${max}.`);

export function validateBlockContent(value: unknown): BlockContent {
  const v = object(value);
  switch (v.type) {
    case 'heading': return { type: 'heading', level: v.level === 2 || v.level === 3 ? v.level : invalid('Heading level must be 2 or 3.'), text: str(v.text, 'text', true) };
    case 'text': return { type: 'text', text: str(v.text, 'text', true) };
    case 'callout': return { type: 'callout', tone: v.tone === 'info' || v.tone === 'tip' || v.tone === 'warning' ? v.tone : invalid('Invalid callout tone.'), title: str(v.title, 'title'), text: str(v.text, 'text') };
    case 'image': return { type: 'image', src: str(v.src, 'src', true), alt: str(v.alt, 'alt'), decorative: typeof v.decorative === 'boolean' ? v.decorative : invalid('decorative must be boolean.'), caption: str(v.caption, 'caption') };
    case 'check': {
      if (!Array.isArray(v.options) || v.options.length < 2 || v.options.length > 6) return invalid('A check needs 2–6 options.');
      const options = v.options.map((raw: unknown) => { const option = object(raw); return { id: str(option.id, 'option id', true), text: str(option.text, 'option text') }; });
      if (new Set(options.map(x => x.id)).size !== options.length) return invalid('Option ids must be unique.');
      const correctOptionId = str(v.correctOptionId, 'correctOptionId');
      return { type: 'check', question: str(v.question, 'question'), options, correctOptionId, feedbackCorrect: str(v.feedbackCorrect, 'feedbackCorrect'), feedbackIncorrect: str(v.feedbackIncorrect, 'feedbackIncorrect') };
    }
    default: return invalid('Unknown block type.');
  }
}

export function validateCourseBrief(value: unknown): CourseBrief {
  const v = object(value);
  if (!Array.isArray(v.outcomes)) return invalid('outcomes must be an array.');
  return { audience: str(v.audience, 'audience', true), outcomes: v.outcomes.map((x: unknown) => str(x, 'outcome', true)), moduleCount: intRange(v.moduleCount, 'moduleCount', 1, 8), lessonsPerModule: intRange(v.lessonsPerModule, 'lessonsPerModule', 1, 8), lessonMinutes: intRange(v.lessonMinutes, 'lessonMinutes', 1, 240), tone: str(v.tone, 'tone'), notes: str(v.notes, 'notes') };
}
export function validateOutlineDraft(value: unknown): OutlineDraft {
  const v = object(value);
  if (!Array.isArray(v.modules) || v.modules.length < 1 || v.modules.length > 8) return invalid('Outline needs 1–8 modules.');
  return { modules: v.modules.map((raw: unknown) => {
    const module = object(raw);
    if (!Array.isArray(module.lessons) || module.lessons.length < 1 || module.lessons.length > 8) return invalid('Module needs 1–8 lessons.');
    return { title: str(module.title, 'module title', true), lessons: module.lessons.map((item: unknown) => { const lesson = object(item); return { title: str(lesson.title, 'lesson title', true), minutes: intRange(lesson.minutes, 'minutes', 1, 240), objective: str(lesson.objective, 'objective', true) }; }) };
  }) };
}
