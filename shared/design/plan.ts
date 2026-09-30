import type { Assignment, Block, DesignSession, InstructorProfile, Lesson, Module, Outcome, OutcomeLink, ProvisionPlan, SourceSpan, StructureOption } from '../domain';
import type { CourseSnapshot } from '../quality';
import { AUTOMATIC_CHECKS } from '../quality';
import { automaticCheck } from '../quality/evaluate';
import { stableHash } from '../hash';
import { moduleScaffoldFixture } from '../ai';
import { DEFAULT_AI_DISCLOSURE } from '../policy';

type PlanModule = ProvisionPlan['modules'][number];
type PlanAssignment = NonNullable<PlanModule['assignment']>;
export function coveredWeeks(row: { week: number; dates: string }): number[] {
  const range = /\bweeks?\s*(\d+)\s*[–—-]\s*(\d+)\b/i.exec(row.dates);
  if (!range) return [row.week];
  const first = Number(range[1]), last = Number(range[2]);
  return last >= first && last - first < 53 ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : [row.week];
}
const pointPattern = /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:points?|pts?)\b/gi;
const numberOf = (value: string) => Number(value.replaceAll(',', ''));
export function statedCourseTotal(span: SourceSpan | null): number | null {
  const match = span?.text.match(/\b(?:(?:course|overall|grade)\s+total|total\s+points?)\s*:?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:points?|pts?)?\b/i);
  return match ? numberOf(match[1]) : null;
}
export function explicitAssessmentPoints(span: SourceSpan | null, title = ''): number | null {
  if (!span) return null;
  const rows = span.text.split(/[\n\r]+|(?<=[.!?])\s+/);
  // A dash separates list items only with a space before it; "Mini-project" is one title.
  const titlePattern = title ? new RegExp(`(?:^|[.;!?:|•]|\\s[–—-])\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:–—-]?\\s*$`, 'iu') : null;
  const values = rows.flatMap(row => [...row.matchAll(pointPattern)]
    .filter(match => {
      const before = row.slice(0, match.index);
      if (/\b(?:(?:course|overall|grade)\s+total|total\s+points?)\s*:?\s*$/i.test(before)) return false;
      return titlePattern ? titlePattern.test(before) : rows.length === 1;
    }).map(match => numberOf(match[1])));
  return values.length === 1 ? values[0] : null;
}
const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length > 2).map(w => w.replace(/(ing|edly|ed|es|s)$/u, '').replace(/e$/u, '')));
export function titleOverlap(a: string, b: string): boolean {
  const aa = words(a), bb = words(b);
  const intersection = [...aa].filter(w => bb.has(w)).length;
  return !!intersection && intersection / (aa.size + bb.size - intersection) >= 0.5;
}
const weekOf = (date: string | null, start: string | null): number | null => {
  const at = date ? Date.parse(date) : NaN, first = start ? Date.parse(start) : NaN;
  return Number.isFinite(at) && Number.isFinite(first) ? Math.floor((at - first) / 604800000) + 1 : null;
};
const dayIndex = (day: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].findIndex(s => day.toLowerCase().startsWith(s));
function dueDate(session: DesignSession, week: number, used: string[]): string | null {
  const start = (session.effectiveProfile ?? session.extraction?.profile)?.termStart.value;
  if (!start || !Number.isFinite(Date.parse(start))) return null;
  const base = new Date(Date.parse(start) + (week - 1) * 604800000);
  const meeting = (session.effectiveProfile ?? session.extraction?.profile)?.meeting.value?.days.map(dayIndex).filter(d => d >= 0) ?? [];
  const candidates = Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + i * 86400000)).filter(d => !meeting.length || meeting.includes(d.getUTCDay())).reverse();
  for (const date of candidates) {
    const iso = date.toISOString().slice(0, 10);
    if (used.every(other => Math.abs(Date.parse(other) - Date.parse(iso)) > 3 * 86400000)) { used.push(iso); return `${iso}T23:59:00.000Z`; }
  }
  return null;
}
const aliases: { pattern: RegExp; names: string[] }[] = [
  { pattern: /\b(?:quiz|quizzes)\b/i, names: ['quiz', 'quizzes'] },
  { pattern: /\b(?:hw|homework)\b/i, names: ['hw', 'homework'] },
  { pattern: /\blabs?\b/i, names: ['lab', 'labs'] },
  { pattern: /\bcheckpoints?\b/i, names: ['checkpoint', 'checkpoints'] },
  { pattern: /\b(?:discussions?|studio)\b/i, names: ['discussion', 'discussions', 'studio'] },
  { pattern: /\bbriefs?\b/i, names: ['brief', 'briefs'] },
  { pattern: /\bessays?\b/i, names: ['essay', 'essays'] },
  { pattern: /\bpapers?\b/i, names: ['paper', 'papers'] },
  { pattern: /\b(?:exams?|midterms?|finals?)\b/i, names: ['exam', 'midterm', 'final'] },
  { pattern: /\b(?:projects?|capstones?)\b/i, names: ['project', 'capstone'] },
  { pattern: /\b(?:reflections?|journals?)\b/i, names: ['reflection', 'journal'] },
];
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function occurrenceNames(title: string, due: string, topic: string): string[] {
  const group = aliases.find(item => item.pattern.test(title));
  const stems = /\bmidterm\b/i.test(title) ? ['midterm'] : /\bfinal\b/i.test(title) ? ['final'] : group?.names ?? title.toLowerCase().replace(/\b(?:weekly|course|sets?|applied|analysis|adaptive|studio|graded)\b/g, '').match(/[\p{L}]{4,}/gu) ?? [];
  if (!stems.length) return [];
  const expression = new RegExp(`\\b(?:${stems.map(escaped).join('|')})(?:\\s*(?:#|no\\.?\\s*)?(\\d+))?\\b`, 'gi');
  // A due entry is stronger evidence than a topic label; avoid counting a topic twice.
  const text = expression.test(due) ? due : topic;
  expression.lastIndex = 0;
  return [...text.matchAll(expression)].map(match => {
    const label = match[0].trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}
const statedWeek = (text: string) => /\bweek\s*(\d{1,2})\b/i.exec(text)?.[1];
const countOf = (text: string) => (/\(\s*(\d{1,2})\s*@\s*\d+(?:\.\d+)?\s*(?:points?|pts?)\b[^)]*\)/i.exec(text) ?? /(\d{1,2})\s*@\s*\d+(?:\.\d+)?\s*(?:points?|pts?)\b/i.exec(text) ?? /\(\s*(\d{1,2})\s*\)/.exec(text))?.[1];
const isBreak = (text: string) => /\b(?:break|holiday|recess|no class)\b/i.test(text);
const eachModule = (text: string) => /\b(?:each|every|per)\s+modules?\b/i.test(text);
/** Prefer the assessment span; when it is thin, pull source lines that mention the title. */
function placementBlob(session: DesignSession, item: { title: string; span: SourceSpan | null }): string {
  const span = item.span?.text ?? '';
  const rich = `${item.title} ${span}`;
  if (statedModules(rich).length || eachModule(rich) || statedWeek(rich) || statedCalendarDate(rich, null)) return rich;
  const needle = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 3).slice(0, 4);
  if (!needle.length || !session.source?.sections?.length) return rich;
  const cue = /\b(?:due|modules?\s*\d|each\s+modules?|every\s+modules?|per\s+modules?|week\s*\d)\b/i;
  const hits = session.source.sections.flatMap(section => {
    const lines = [section.heading, ...(section.lines ?? section.text.split(/\n/))].map(line => line.trim()).filter(Boolean);
    // Also join adjacent lines so "Homework assignments" + next-line module list still matches.
    const windows = lines.flatMap((line, i) => [line, [line, lines[i + 1] ?? ''].join(' '), [lines[i - 1] ?? '', line].join(' ')]);
    return windows.filter(line => {
      const lower = line.toLowerCase();
      const hitsNeedle = needle.filter(w => lower.includes(w)).length;
      return hitsNeedle >= Math.min(2, needle.length) || (hitsNeedle >= 1 && cue.test(line));
    });
  });
  const unique = [...new Set(hits.map(h => h.trim()).filter(Boolean))].slice(0, 8);
  return unique.length ? `${rich} ${unique.join(' ')}` : rich;
}
/** Module numbers named in prose: "Module 7", "Modules 2, 3, 5, and 6". */
export function statedModules(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/\bmodules?\s*((?:\d{1,2}\s*(?:,?\s*(?:and|&)\s*|,\s*|\s+through\s+|\s*[–—-]\s*)?)+)/gi)) {
    const chunk = match[1];
    const nums = [...chunk.matchAll(/\d{1,2}/g)].map(m => Number(m[0])).filter(n => n >= 1 && n <= 52);
    if (/\bthrough\b|[–—-]/.test(chunk) && nums.length >= 2) {
      const [first, last] = [Math.min(...nums), Math.max(...nums)];
      for (let n = first; n <= last; n++) found.add(n);
    } else nums.forEach(n => found.add(n));
  }
  return [...found].sort((a, b) => a - b);
}
const monthIndex = (name: string) => ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex(m => m.startsWith(name.toLowerCase().slice(0, 3)));
/** Calendar due date in a title or span: 9/15, 9/15/14, March 28, 2014, week of March 3. */
export function statedCalendarDate(text: string, termStart: string | null): string | null {
  const start = termStart && Number.isFinite(Date.parse(termStart)) ? new Date(termStart) : null;
  const yearOf = (explicit: number | null, month: number) => {
    if (explicit != null) return explicit < 100 ? 2000 + explicit : explicit;
    if (!start) return new Date().getUTCFullYear();
    const y = start.getUTCFullYear();
    // Term crossing New Year: a January date after an August start belongs to y+1.
    return month < start.getUTCMonth() ? y + 1 : y;
  };
  const named = /\b(?:week\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{2,4}))?\b/i.exec(text);
  if (named) {
    const month = monthIndex(named[1]);
    const day = Number(named[2]);
    const year = yearOf(named[3] ? Number(named[3]) : null, month);
    if (month >= 0 && day >= 1 && day <= 31) return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const numeric = /\b(?:due(?:\s+(?:on|by))?\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)\w*,?\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i.exec(text);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    const year = yearOf(numeric[3] ? Number(numeric[3]) : null, month);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}
/** Map a calendar ISO date onto a schedule row whose dates cover that day (2/2-2/8 or Feb 2–8). */
export function weekForCalendarDate(date: string, schedule: { week: number; dates: string; due: string }[], termStart: string | null): number | null {
  const at = Date.parse(date);
  if (!Number.isFinite(at)) return null;
  const day = new Date(at);
  const month = day.getUTCMonth() + 1;
  const number = day.getUTCDate();
  for (const row of schedule) {
    const text = `${row.dates} ${row.due}`;
    if (new RegExp(`\\b${month}\\s*[\/.–—-]\\s*${number}\\b`).test(text)) return row.week;
    const monthName = day.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    if (new RegExp(`\\b${monthName}\\w*\\s+${number}\\b`, 'i').test(text)) return row.week;
    // Inclusive numeric ranges like 2/2-2/8 or 3/2-3/8.
    const range = /(\d{1,2})\/(\d{1,2})\s*[–—-]\s*(\d{1,2})\/(\d{1,2})/.exec(row.dates);
    if (range) {
      const y = day.getUTCFullYear();
      const from = Date.parse(`${y}-${range[1].padStart(2, '0')}-${range[2].padStart(2, '0')}`);
      const to = Date.parse(`${y}-${range[3].padStart(2, '0')}-${range[4].padStart(2, '0')}`);
      if (Number.isFinite(from) && Number.isFinite(to) && at >= from && at <= to + 86400000 - 1) return row.week;
    }
  }
  return weekOf(date, termStart);
}
function shares(total: number, count: number): number[] {
  const units = Math.round(total * 10000);
  const base = Math.floor(units / count);
  return Array.from({ length: count }, (_, index) => (base + (index < units - base * count ? 1 : 0)) / 10000);
}
function sourceSpans(session: DesignSession, module: PlanModule): SourceSpan[] {
  return (session.extraction?.schedule ?? []).filter(row => row.span && module.lessons.some(lesson => (lesson.weeks ?? (lesson.week === null ? [] : [lesson.week])).some(week => coveredWeeks(row).includes(week)))).map(row => row.span!);
}
export function previewProvisionPlan(session: DesignSession, snapshot: CourseSnapshot, instructorProfile: InstructorProfile | null = null, defaultDisclosure = DEFAULT_AI_DISCLOSURE): ProvisionPlan {
  if (!session.selection || !session.options || !session.confirmedOutcomes || !session.extraction) throw Error('Choose an approach and confirm outcomes first.');
  const selected = session.selection.optionIds.map(id => session.options!.find(option => option.id === id)).filter((v): v is StructureOption => !!v);
  if (!selected.length) throw Error('The selected approach is unavailable.');
  const spine = selected[0];
  const nextCode = snapshot.outcomes.length + 1;
  const codes = new Map(session.confirmedOutcomes.map((item, index) => [item.code, `O${nextCode + index}`]));
  const outcomes = session.confirmedOutcomes.map(item => ({ code: codes.get(item.code)!, text: item.text, source: item.text === item.originalText ? 'confirmed' as const : 'rewritten' as const }));
  const template = snapshot.template;
  const base = snapshot.modules.length ? Math.max(...snapshot.modules.map(m => m.position)) + 1 : 0;
  const skeleton = selected.some(o => o.id === 'case') ? 'case' : selected.some(o => o.id === 'project' || o.id === 'performance') ? 'milestone' : selected.some(o => o.id === 'competency' || o.id === 'scaffolded') ? 'merrill' : 'gagne';
  const patternNotes: Record<string, string> = { weekly: 'Revisit the previous week before starting this one.', thematic: 'Connect this topic to the larger theme.', case: 'Test a claim, then critique the evidence.', project: 'Build and review one project milestone.', competency: 'Demonstrate the target competency.', flipped: 'Prepare before the meeting, then apply the idea together.', scaffolded: 'Study a model, practise with support, then try independently.', performance: 'Make a decision in a realistic job context.', micro: 'Use a short retrieval and application cycle.', hyflex: 'Offer equivalent participation paths.' };
  const patternNote = selected.slice(1).map(option => patternNotes[option.id]).join(' ');
  const modules: PlanModule[] = spine.modules.map((item, index) => {
    const weeks = [...new Set(item.weeks)].sort((a, b) => a - b);
    const rows = session.extraction!.schedule.filter(row => weeks.some(week => coveredWeeks(row).includes(week)) && !row.empty);
    const lessonCount = Math.max(1, Math.round(item.lessons));
    const lessons = Array.from({ length: lessonCount }, (_, n) => {
      const lessonWeeks = weeks.slice(Math.floor(n * weeks.length / lessonCount), Math.floor((n + 1) * weeks.length / lessonCount));
      if (!lessonWeeks.length && weeks.length) lessonWeeks.push(weeks[Math.min(n, weeks.length - 1)]);
      const week = lessonWeeks[0] ?? rows[n]?.week ?? null;
      const topics = [...new Set(rows.filter(row => lessonWeeks.some(value => coveredWeeks(row).includes(value))).map(row => row.topic.trim()).filter(Boolean))];
      const topic = topics.join(' / ') || item.title;
      return { key: `module-${index + 1}/lesson-${n + 1}`, title: lessonCount === 1 ? topic : `${topic}${n >= rows.length ? ` · part ${n + 1}` : ''}`, objective: item.objective || session.confirmedOutcomes![0]?.text || topic, minutes: Math.max(1, Math.round(item.lessonMinutes)), week, weeks: lessonWeeks, skeleton, ...(patternNote ? { patternNote } : {}), resurface: session.selection!.overlays.includes('spaced-review'), announcementSlot: session.selection!.overlays.includes('teaching-presence') && (n === 0 || week !== weeks[Math.min(n - 1, weeks.length - 1)]), alternativeFormatSlot: session.selection!.overlays.includes('udl-choice') } as PlanModule['lessons'][number];
    });
    const matched = snapshot.modules.find(m => titleOverlap(item.title, m.title));
    const matchedTemplate = template?.modules.find(m => titleOverlap(item.title, m.title));
    const outcomeCodes = item.outcomeIds.map(code => codes.get(code)).filter((c): c is string => !!c);
    if (!outcomeCodes.length && outcomes.length) outcomeCodes.push(outcomes[index % outcomes.length].code);
    return { key: `module-${index + 1}`, title: item.title, objective: item.objective, position: base + index, outcomeCodes, templateKey: matchedTemplate?.key ?? null, overlaps: matched ? { moduleId: matched.id, title: matched.title } : null, lessons, assignment: null, assignments: [], hours: item.hours, leastSure: false };
  });
  if (session.selection.overlays.includes('bookends') || session.extraction.assessments.some(a => /\b(?:participation|engagement|attendance)\b/i.test(a.title))) {
    const first: PlanModule = { key: 'start-here', title: 'Start here', objective: 'Find your way through the course, contact the instructor, and identify the learning outcomes.', position: base, outcomeCodes: outcomes.map(o => o.code), templateKey: template?.modules.find(m => /start here/i.test(m.title))?.key ?? 'start-here', overlaps: null, lessons: [{ key: 'start-here/lesson-1', title: 'Start here', objective: 'Explain how this course works and how to contact the instructor.', minutes: 20, week: null, skeleton: 'start-here' }], assignment: null, assignments: [], hours: 0.3, leastSure: false };
    const last: PlanModule = { key: 'wrap-up', title: 'Wrap-up', objective: 'Revisit the course outcomes and reflect on progress.', position: base + modules.length + 1, outcomeCodes: outcomes.map(o => o.code), templateKey: null, overlaps: null, lessons: [{ key: 'wrap-up/lesson-1', title: 'Wrap-up and reflect', objective: 'Reflect on your progress toward the course outcomes.', minutes: 30, week: Math.max(...modules.flatMap(m => m.lessons.map(l => l.week ?? 0)), 1), skeleton: 'wrap-up' }], assignment: null, assignments: [], hours: 0.5, leastSure: false };
    modules.unshift(first);
    if (session.selection.overlays.includes('bookends')) modules.push(last);
    modules.forEach((m, i) => { m.position = base + i; });
  }
  const instructional = modules.filter(m => m.key.startsWith('module-'));
  const moduleWeeks = (module: PlanModule) => spine.modules[Number(module.key.slice('module-'.length)) - 1]?.weeks ?? module.lessons.map(l => l.week).filter((week): week is number => week !== null);
  const usedDates = snapshot.assignments.flatMap(a => a.dueAt ? [a.dueAt.slice(0, 10)] : []);
  const breakWeeks = new Set(session.extraction.schedule.filter(row => isBreak(`${row.topic} ${row.due}`) || /\bexam week\b/i.test(`${row.topic} ${row.due}`)).flatMap(coveredWeeks));
  for (const question of session.questions) {
    const answer = question.answer;
    if (!answer || answer.skipped || (!['break', 'exam'].includes(answer.optionId ?? '') && !isBreak(answer.value ?? '') && !/\bexam week\b/i.test(answer.value ?? ''))) continue;
    for (const week of question.weekIds ?? []) breakWeeks.add(week);
    for (const match of (answer.value ?? '').matchAll(/\bweek\s*(\d+)\b/gi)) breakWeeks.add(Number(match[1]));
  }
  const contentWeek = (module: PlanModule) => moduleWeeks(module).find(week => !breakWeeks.has(week) && !session.extraction!.schedule.some(row => coveredWeeks(row).includes(week) && isBreak(`${row.topic} ${row.due}`))) ?? null;
  const content = instructional.filter(m => contentWeek(m) !== null);
  const moduleForWeek = (week: number) => content.find(m => moduleWeeks(m).includes(week)) ?? content.reduce<PlanModule | null>((best, module) => {
    const distance = Math.min(...moduleWeeks(module).map(value => Math.abs(value - week)));
    return !best || distance < Math.min(...moduleWeeks(best).map(value => Math.abs(value - week))) ? module : best;
  }, null);
  const scheduledDateWeek = (date: string) => {
    const day = new Date(date);
    if (!Number.isFinite(day.getTime())) return null;
    const month = day.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const number = day.getUTCDate();
    return session.extraction!.schedule.find(row => new RegExp(`\\b${month}\\w*\\s+${number}\\b`, 'i').test(`${row.due} ${row.dates}`))?.week ?? null;
  };
  for (const [index, item] of session.extraction.assessments.entries()) {
    const answered = session.confirmedPoints?.[item.id] ?? Number(session.questions.find(q => q.id === `question-assessment-points-${item.id}`)?.answer?.value);
    const points = item.weightPercent ?? explicitAssessmentPoints(item.span, item.title) ?? (Number.isFinite(answered) && answered > 0 ? answered : null);
    if (points === null) throw Error(`Confirm the points for ${item.title} before applying this plan.`);
    const total = statedCourseTotal(item.span);
    const weightPercent = item.weightPercent ?? (total && total > 0 ? Math.round(points / total * 10000) / 100 : null);
    const add = (target: PlanModule, title: string, share: number, weight: number | null, week: number | null, placement: string, dueAt: string | null = null, suffix = 1) => {
      const sourceWeek = dueAt ? scheduledDateWeek(dueAt) ?? weekOf(dueAt, (session.effectiveProfile ?? session.extraction!.profile).termStart.value) : null;
      const assignedDate = week && !breakWeeks.has(week) ? (dueAt && !breakWeeks.has(sourceWeek ?? -1) ? dueAt : dueDate(session, week, usedDates)) : null;
      const assignment: PlanAssignment = { key: `${target.key}/assessment-${index + 1}-${suffix}`, title, points: share, weightPercent: weight, dueAt: assignedDate, outcomeCodes: target.outcomeCodes, replaces: item.title, placement };
      target.assignments!.push(assignment);
      target.assignment ??= assignment;
    };
    if (/\b(?:participation|engagement|attendance)\b/i.test(item.title)) {
      const start = modules.find(m => m.key === 'start-here')!;
      add(start, item.title, points, weightPercent, null, 'Coursewide participation is recorded here; no submission is due.');
      continue;
    }
    const blob = `${item.title} ${item.span?.text ?? ''}`;
    const termStart = (session.effectiveProfile ?? session.extraction.profile).termStart.value;
    const stated = statedWeek(blob);
    const modulesNamed = statedModules(blob);
    const calendar = item.dueAt ?? statedCalendarDate(blob, termStart);
    const dateWeek = calendar ? weekForCalendarDate(calendar, session.extraction.schedule, termStart) ?? scheduledDateWeek(calendar) ?? weekOf(calendar, termStart) : null;
    const final = /\bfinal\s*(?:exam|assessment|test)\b/i.test(item.title);
    const placeOne = (requested: number | null, note: string, dueAt: string | null = null) => {
      const target = requested ? moduleForWeek(requested) : content[content.length - 1];
      if (!target) return false;
      const actual = requested && moduleWeeks(target).includes(requested) && !breakWeeks.has(requested) ? requested : contentWeek(target);
      const resolved = requested !== actual && requested != null ? `${note} Placed in nearest content module, Week ${actual}.` : note;
      add(target, item.title, points, weightPercent, actual, resolved, dueAt);
      return true;
    };
    if (final) {
      placeOne(Math.max(...content.flatMap(moduleWeeks)), 'Final exam placed in the last content module.', item.dueAt);
      continue;
    }
    if (item.dueAt || stated) {
      const requested = stated ? Number(stated) : dateWeek;
      placeOne(requested, item.dueAt ? `Placed by syllabus due date ${item.dueAt}.` : `Placed by syllabus Week ${requested}.`, item.dueAt);
      continue;
    }
    if (modulesNamed.length) {
      const pointShares = shares(points, modulesNamed.length);
      const weightShares = weightPercent === null ? [] : shares(weightPercent, modulesNamed.length);
      modulesNamed.forEach((week, n) => {
        const target = moduleForWeek(week);
        if (target) add(target, modulesNamed.length === 1 ? item.title : `${item.title.replace(/\s*\(\s*\d{1,2}\s*@\s*\d+(?:\.\d+)?\s*(?:points?|pts?)[^)]*\)/i, '').trim()} ${n + 1}`, pointShares[n], weightShares[n] ?? null, week, `Syllabus names Module ${week}.`, null, n + 1);
      });
      continue;
    }
    if (eachModule(blob)) {
      const weeks = content.map(contentWeek).filter((week): week is number => week !== null);
      const n = weeks.length || content.length;
      const pointShares = shares(points, n);
      const weightShares = weightPercent === null ? [] : shares(weightPercent, n);
      (weeks.length ? weeks : content.map((_, i) => i)).forEach((weekOrIndex, i) => {
        const target = weeks.length ? moduleForWeek(weekOrIndex) : content[weekOrIndex];
        if (!target) return;
        const week = weeks.length ? weekOrIndex : contentWeek(target);
        add(target, `${item.title} ${i + 1}`, pointShares[i], weightShares[i] ?? null, week, `Due each module; Week ${week}.`, null, i + 1);
      });
      continue;
    }
    const occurrences = session.extraction.schedule.flatMap(row => row.empty || isBreak(`${row.topic} ${row.due}`) ? [] : occurrenceNames(item.title, row.due, row.topic).map(title => ({ title, week: row.week })));
    if (occurrences.length) {
      const pointShares = shares(points, occurrences.length);
      const weightShares = weightPercent === null ? [] : shares(weightPercent, occurrences.length);
      occurrences.forEach((occurrence, n) => {
        const target = moduleForWeek(occurrence.week);
        if (target) add(target, occurrence.title, pointShares[n], weightShares[n] ?? null, occurrence.week, `Scheduled in Week ${occurrence.week}: ${occurrence.title}.`, null, n + 1);
      });
      continue;
    }
    if (calendar && dateWeek) {
      placeOne(dateWeek, `Placed by syllabus due date ${calendar}.`, `${calendar}T23:59:00.000Z`);
      continue;
    }
    const count = Number(countOf(blob));
    if (count > 0 || /\b(?:weekly|each week|per module)\b/i.test(blob)) {
      const n = count || content.length;
      const pointShares = shares(points, n);
      const weightShares = weightPercent === null ? [] : shares(weightPercent, n);
      Array.from({ length: n }, (_, i) => i).forEach(i => {
        const target = content[Math.round((i + 0.5) * content.length / n - 0.5)] ?? content[content.length - 1];
        if (!target) return;
        const week = contentWeek(target);
        add(target, `${item.title.replace(/\s*\(\s*\d{1,2}\s*@\s*\d+(?:\.\d+)?\s*(?:points?|pts?)[^)]*\)/i, '').replace(/\s+\d{1,2}\s*@\s*\d+(?:\.\d+)?\s*(?:points?|pts?)(?:\s+each)?/i, '').replace(/\s*\(\s*\d+\s*\)/, '').trim()} ${i + 1}`, pointShares[i], weightShares[i] ?? null, week, `${count ? `${count} stated instances` : 'Recurring'} spread across content modules; Week ${week}.`, null, i + 1);
      });
      continue;
    }
    // Last resort: pull due/module cues from source lines that mention this title.
    const enriched = placementBlob(session, item);
    if (enriched !== blob) {
      const modulesFromSource = statedModules(enriched);
      if (modulesFromSource.length) {
        const pointShares = shares(points, modulesFromSource.length);
        const weightShares = weightPercent === null ? [] : shares(weightPercent, modulesFromSource.length);
        modulesFromSource.forEach((week, n) => {
          const target = moduleForWeek(week);
          if (target) add(target, modulesFromSource.length === 1 ? item.title : `${item.title} ${n + 1}`, pointShares[n], weightShares[n] ?? null, week, `Syllabus names Module ${week}.`, null, n + 1);
        });
        continue;
      }
      if (eachModule(enriched)) {
        const weeks = content.map(contentWeek).filter((week): week is number => week !== null);
        const n = weeks.length || content.length;
        const pointShares = shares(points, n);
        const weightShares = weightPercent === null ? [] : shares(weightPercent, n);
        (weeks.length ? weeks : content.map((_, i) => i)).forEach((weekOrIndex, i) => {
          const target = weeks.length ? moduleForWeek(weekOrIndex) : content[weekOrIndex];
          if (!target) return;
          const week = weeks.length ? weekOrIndex : contentWeek(target);
          add(target, `${item.title} ${i + 1}`, pointShares[i], weightShares[i] ?? null, week, `Due each module; Week ${week}.`, null, i + 1);
        });
        continue;
      }
      const cal = statedCalendarDate(enriched, termStart);
      const calWeek = cal ? weekForCalendarDate(cal, session.extraction.schedule, termStart) ?? weekOf(cal, termStart) : null;
      if (cal && calWeek) {
        placeOne(calWeek, `Placed by syllabus due date ${cal}.`, `${cal}T23:59:00.000Z`);
        continue;
      }
    }
    const target = content[content.length - 1];
    if (target) {
      const week = contentWeek(target);
      add(target, item.title, points, weightPercent, week, `No due week found; placed in the last content module, Week ${week}.`);
    }
  }
  if (selected.slice(1).some(option => option.id === 'case')) for (const module of instructional) {
    const critique: PlanAssignment = { key: `${module.key}/claim-critique`, title: `Claim critique: ${module.title}`, points: 0, dueAt: null, outcomeCodes: module.outcomeCodes, replaces: null };
    module.assignments!.push(critique);
    module.assignment ??= critique;
  }
  for (const module of instructional) if (!module.assignments!.length) {
    const practice: PlanAssignment = { key: `${module.key}/practice`, title: `Practice: ${module.title}`, points: 0, dueAt: null, outcomeCodes: module.outcomeCodes, replaces: null };
    module.assignments!.push(practice);
    module.assignment = practice;
  }
  const readings = modules.filter(m => m.key.startsWith('module-')).flatMap(m => session.extraction!.schedule.filter(row => row.span && row.reading.trim()).flatMap(row => m.lessons.flatMap(l => (l.weeks ?? (l.week === null ? [] : [l.week])).filter(week => coveredWeeks(row).includes(week)).map(week => ({ title: row.reading.trim(), span: row.span!, moduleKey: m.key, week })))));
  const placeholders = modules.reduce((sum, m) => sum + m.lessons.filter(l => l.skeleton !== 'start-here' && !readings.some(r => r.moduleKey === m.key && (l.weeks ?? [l.week]).includes(r.week ?? null))).length, 0);
  const citedCount = (module: PlanModule) => new Set([
    ...sourceSpans(session, module),
    ...session.extraction!.assessments.filter(a => module.assignments?.some(item => item.replaces === a.title)).map(a => a.span).filter((span): span is SourceSpan => !!span),
    ...session.extraction!.outcomes.filter(o => o.span && module.outcomeCodes.some(code => outcomes.find(p => p.code === code)?.text === o.text)).map(o => o.span!),
  ].map(span => `${span.page}:${span.section ?? ''}:${span.text}`)).size;
  const unsure = instructional.length ? instructional.reduce((a, b) => citedCount(a) <= citedCount(b) ? a : b) : modules[0];
  if (unsure) unsure.leastSure = true;
  const assignmentCount = modules.reduce((n, m) => n + (m.assignments?.length ?? 0), 0);
  const counts = { modules: modules.length, lessons: modules.reduce((n, m) => n + m.lessons.length, 0), checks: modules.reduce((n, m) => n + m.lessons.reduce((x, l) => x + (l.skeleton === 'start-here' ? 5 : 1), 0), 0), assignments: assignmentCount, outcomes: outcomes.length, links: modules.reduce((n, m) => n + m.lessons.reduce((x, l) => x + (l.skeleton === 'start-here' ? 5 : 1) * m.outcomeCodes.length, 0) + (m.assignments?.length ?? 0) * m.outcomeCodes.length, 0) };
  const summary = `Will add ${counts.modules} modules, ${counts.lessons} lessons, ${counts.checks} checks, ${counts.assignments} assignments, ${counts.outcomes} outcomes and ${counts.links} alignment links. Renames nothing. Removes nothing.`;
  const satisfied = template?.modules.filter(t => modules.some(m => m.templateKey === t.key) || snapshot.modules.some(m => m.templateKey === t.key)).map(t => t.title) ?? [];
  const missing = template?.modules.filter(t => !satisfied.includes(t.title)).map(t => t.title) ?? [];
  const planned: CourseSnapshot = { ...snapshot, course: { ...snapshot.course, outcomes: [...snapshot.course.outcomes, ...outcomes.map(o => o.text)] }, modules: [...snapshot.modules, ...modules.map(m => ({ id: m.key, courseId: session.courseId, title: m.title, objective: m.objective, position: m.position, templateKey: m.templateKey } as Module))], lessons: [...snapshot.lessons, ...modules.flatMap(m => m.lessons.map((l, i) => ({ id: l.key, moduleId: m.key, courseId: session.courseId, title: l.title, objective: l.objective, minutes: l.minutes, position: i, status: 'draft', publishedAt: null, templateKey: l.skeleton === 'start-here' ? 'start-here' : null } as Lesson)))], assignments: [...snapshot.assignments, ...modules.flatMap(m => (m.assignments ?? []).map((a, i) => ({ id: a.key, moduleId: m.key, courseId: session.courseId, title: a.title, position: i, status: 'draft', publishedAt: null, dueAt: a.dueAt, points: a.points, submissionType: 'text', rubric: [], instructions: [] } as Assignment)))], outcomes: [...snapshot.outcomes, ...outcomes.map((o, i) => ({ id: o.code, courseId: session.courseId, code: o.code, text: o.text, position: snapshot.outcomes.length + i } as Outcome))], outcomeLinks: [...snapshot.outcomeLinks, ...modules.flatMap(m => (m.assignments ?? []).flatMap(a => a.outcomeCodes.map(code => ({ courseId: session.courseId, outcomeId: code, targetKind: 'assignment' as const, targetId: a.key } as OutcomeLink))))], blocks: { ...snapshot.blocks } };
  const startLesson = modules.flatMap(m => m.lessons).find(l => l.skeleton === 'start-here');
  if (startLesson) {
    const contact = session.extraction.profile.instructor.value?.email || session.extraction.profile.instructor.value?.officeHours || 'Contact your instructor through the course message tool.';
    planned.blocks[startLesson.key] = [
      `Open the course outline to find each module and lesson. Work through the lessons in order, then review the draft assignments. Your instructor can be reached at ${contact}.\n\n[Your welcome and course navigation example]`,
      `Course outcomes:\n${outcomes.map(o => `${o.code}: ${o.text}`).join('\n')}\n\n${instructorProfile?.disclosureText ?? defaultDisclosure}\n\n[Your AI-use guidance]`,
    ].map((text, position) => ({ id: `forecast-start-${position}`, lessonId: startLesson.key, position, type: 'text', text, origin: 'ai', aiState: 'draft', provenance: null, previous: null, updatedAt: session.updatedAt } as Block));
  }
  for (const module of modules) for (const lesson of module.lessons) {
    if (lesson.skeleton === 'start-here') {
      const baseline = moduleScaffoldFixture({ courseTitle: snapshot.course.title, module, lesson, skeleton: lesson.skeleton, outcomes, spans: [], teachingNote: session.teachingNote, instructorProfile: null, priorLessonTitles: [] }).blocks.find(value => value.type === 'check')!;
      planned.blocks[lesson.key].push(...Array.from({ length: 5 }, (_, i) => ({ ...baseline, id: `forecast-${lesson.key}-baseline-${i}`, lessonId: lesson.key, position: i + 2, origin: 'ai', aiState: 'draft', provenance: null, previous: null, updatedAt: session.updatedAt } as Block)));
      continue;
    }
    const fixture = moduleScaffoldFixture({ courseTitle: snapshot.course.title, module, lesson, skeleton: lesson.skeleton, outcomes, spans: [], teachingNote: session.teachingNote, instructorProfile: null, priorLessonTitles: [] });
    planned.blocks[lesson.key] = fixture.blocks.map((value, position) => ({ ...value, id: `forecast-${lesson.key}-${position}`, lessonId: lesson.key, position, origin: 'ai', aiState: 'draft', provenance: null, previous: null, updatedAt: session.updatedAt } as Block));
  }
  for (const module of modules) for (const lesson of module.lessons) for (const block of planned.blocks[lesson.key] ?? []) {
    if (block.type === 'check' || block.type === 'scenario') planned.outcomeLinks.push(...module.outcomeCodes.map(code => ({ outcomeId: code, targetKind: 'block' as const, targetId: block.id })));
  }
  const readinessForecast = (Object.keys(AUTOMATIC_CHECKS) as (keyof typeof AUTOMATIC_CHECKS)[]).map(check => ({ check, expected: automaticCheck(planned, check).status === 'met' ? 'met' as const : 'not-met' as const }));
  const plan = { sessionId: session.id, courseId: session.courseId, outcomes, modules, readings, placeholders, counts, summary, template: template ? { name: template.name, satisfied, missing } : null, readinessForecast };
  return { ...plan, hash: stableHash({ plan, confirmedPoints: session.confirmedPoints ?? {}, instructorDisclosure: instructorProfile?.disclosureText ?? defaultDisclosure, existing: { course: snapshot.course, modules: snapshot.modules, lessons: snapshot.lessons, blocks: snapshot.blocks, assignments: snapshot.assignments, outcomes: snapshot.outcomes, links: snapshot.outcomeLinks, access: snapshot.access, template: snapshot.template?.updatedAt } }) };
}
