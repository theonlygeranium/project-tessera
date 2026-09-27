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
    case 'document': {
      if (!Array.isArray(v.sections) || v.sections.length < 1 || v.sections.length > 40) return invalid('A document needs 1–40 sections.');
      return { type: 'document', title: str(v.title, 'title', true), sections: v.sections.map((raw: unknown) => { const sec = object(raw); return { heading: str(sec.heading, 'section heading', true), text: str(sec.text, 'section text', true) }; }) };
    }
    case 'file': return { type: 'file', fileId: str(v.fileId, 'fileId', true), title: str(v.title, 'title', true), description: str(v.description, 'description') };
    case 'video': {
      const provider = v.provider === 'youtube' || v.provider === 'vimeo' || v.provider === 'upload' ? v.provider : invalid('Invalid video provider.');
      const src = str(v.src, 'src', true);
      if (provider !== 'upload' && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//.test(src)) return invalid('Video src must be a YouTube or Vimeo URL.');
      return { type: 'video', src, provider, title: str(v.title, 'title', true), captionsFileId: v.captionsFileId == null ? null : str(v.captionsFileId, 'captionsFileId', true), transcript: str(v.transcript, 'transcript'), minutes: intRange(v.minutes ?? 0, 'minutes', 0, 600) };
    }
    case 'table': {
      if (!Array.isArray(v.rows) || v.rows.length < 1 || v.rows.length > 200) return invalid('A table needs 1–200 rows.');
      const rows = v.rows.map((row: unknown) => { if (!Array.isArray(row) || row.length < 1 || row.length > 20) return invalid('A table row needs 1–20 cells.'); return row.map((cell: unknown) => str(cell, 'cell')); });
      const width = rows[0].length;
      if (rows.some((r: string[]) => r.length !== width)) return invalid('Every table row needs the same number of cells.');
      return { type: 'table', caption: str(v.caption, 'caption'), headerRow: typeof v.headerRow === 'boolean' ? v.headerRow : invalid('headerRow must be boolean.'), rows };
    }
    case 'scenario': {
      if (!Array.isArray(v.nodes) || v.nodes.length < 1 || v.nodes.length > 60) return invalid('A scenario needs 1–60 nodes.');
      const nodes = v.nodes.map((raw: unknown) => {
        const n = object(raw);
        if (!Array.isArray(n.choices) || n.choices.length > 6) return invalid('A scenario node has 0–6 choices.');
        return { id: str(n.id, 'node id', true), text: str(n.text, 'node text', true), outcome: str(n.outcome, 'outcome'),
          choices: n.choices.map((c: unknown) => { const ch = object(c); return { id: str(ch.id, 'choice id', true), text: str(ch.text, 'choice text', true), nextNodeId: str(ch.nextNodeId, 'nextNodeId', true), feedback: str(ch.feedback, 'feedback'), quality: (ch.quality === 'best' || ch.quality === 'okay' || ch.quality === 'poor' ? ch.quality : invalid('Invalid choice quality.')) as 'best' | 'okay' | 'poor' }; }) };
      });
      const ids = new Set(nodes.map((n) => n.id));
      if (ids.size !== nodes.length) return invalid('Scenario node ids must be unique.');
      const startNodeId = str(v.startNodeId, 'startNodeId', true);
      if (!ids.has(startNodeId)) return invalid('startNodeId must be a node.');
      for (const n of nodes) for (const c of n.choices) if (!ids.has(c.nextNodeId)) return invalid(`Choice "${c.text}" points to a missing node.`);
      return { type: 'scenario', title: str(v.title, 'title', true), setting: str(v.setting, 'setting'), nodes, startNodeId };
    }
    case 'link': {
      const href = str(v.href, 'href', true);
      if (!/^https?:\/\//.test(href)) return invalid('Link href must be http(s).');
      return { type: 'link', href, text: str(v.text, 'text', true), description: str(v.description, 'description') };
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
