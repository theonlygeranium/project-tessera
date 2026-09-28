import type { ArchitectureId, DesignQuestion, OverlayId, SyllabusExtraction } from '../domain';

export interface CandidateChoice { ids: ArchitectureId[]; closest: ArchitectureId; overlaysDefault: OverlayId[]; weeks: number }
const ALL: ArchitectureId[] = ['weekly', 'thematic', 'case', 'project', 'competency', 'flipped', 'scaffolded', 'performance', 'micro', 'hyflex'];

/** The model receives only these three ids; it does not choose an architecture. */
export function selectCandidates(extraction: SyllabusExtraction, answers: DesignQuestion[], teachingNote: string, allowed: ArchitectureId[] | null = null, sourceKind: 'syllabus' | 'brief' = 'syllabus'): CandidateChoice {
  const { profile, schedule, assessments } = extraction;
  const answer = (needle: string) => answers.find(q => q.text.toLowerCase().includes(needle) && !q.answer?.skipped)?.answer?.value;
  const answeredWeeks = Number(answer('term length') ?? answer('termweeks'));
  const weeks = Number.isInteger(answeredWeeks) && answeredWeeks > 0 ? answeredWeeks : profile.termWeeks.value ?? (schedule.length ? Math.max(...schedule.map(row => row.week)) : 0);
  const text = `${profile.title.value ?? ''} ${profile.description.value ?? ''}`.toLowerCase();
  const note = teachingNote.toLowerCase();
  const rows = schedule.map(row => `${row.dates} ${row.topic}`).join(' ').toLowerCase();
  const isBrief = sourceKind === 'brief';
  const competencies = /\bcompetenc(?:y|ies)\b/.test(`${text} ${rows}`);
  const unitRows = schedule.some(row => /\b(?:unit|module|theme)\s*\d+\b/i.test(`${row.dates} ${row.span?.text ?? ''}`));
  const units = unitRows || /\b(?:unit|module|theme|question)\b/i.test(rows) || /\b(?:unit|theme|question)\b/.test(text) || new Set(schedule.map(row => row.topic.trim().toLowerCase()).filter(Boolean)).size < schedule.filter(row => row.topic.trim()).length;
  const hasWeekly = schedule.some(row => /\bweek\s*\d+\b/i.test(`${row.dates} ${row.span?.text ?? ''}`)) || (schedule.length > 0 && !unitRows);
  const closest: ArchitectureId = isBrief && competencies ? 'competency' : unitRows ? 'thematic' : hasWeekly ? 'weekly' : units ? 'thematic' : competencies ? 'competency' : weeks > 0 ? 'weekly' : 'thematic';
  const modality = profile.modality.value ?? answers.find(q => q.kind === 'choice' && /modality/i.test(q.text))?.answer?.optionId;
  const level = profile.level.value?.toLowerCase() ?? '';
  const skill = /\b(writ\w*|cod\w*|lab\w*|statistic\w*|language\w*)\b/.test(text);
  const priorities: ArchitectureId[] = [];
  if (assessments.some(a => (a.weightPercent ?? 0) >= 30) || /\b(project|portfolio|capstone)\b/.test(note)) priorities.push('project');
  if ((extraction.outcomes.some(o => /^(?:students?\s+(?:will|can)\s+)?(?:evaluate|analy[sz]e)\b/i.test(o.text)) && ((profile.enrolment.value ?? Infinity) <= 60 || modality === 'online-async')) || /\b(cases?|claims?|real data)\b/.test(note)) priorities.push('case');
  if ((modality === 'in-person' || modality === 'hybrid') && (profile.meeting.value?.minutes ?? 0) >= 50 && /\b(statistic\w*|math\w*|comput\w*|cod\w*|lab\w*|health|nurs\w*|medic\w*|language|chem\w*|physic\w*|biolog\w*)\b/.test(text)) priorities.push('flipped');
  if ((!level || /\b(?:100|1\d\d|intro|beginner|cross.list)\b/.test(level)) && !(profile.prerequisites.value?.length) && skill) priorities.push('scaffolded');
  if (units) priorities.push('thematic');
  if (isBrief) { priorities.push('performance'); if (competencies) priorities.push('competency'); if ((profile.weeklyHoursBudget > 0 && profile.weeklyHoursBudget <= 3) || /\b(refresher|procedure)\b/.test(text)) priorities.push('micro'); }
  if (modality === 'hyflex') priorities.push('hyflex');
  const permitted = new Set(allowed ?? ALL);
  if (!permitted.size) throw new Error('The design partner policy allows no course structures.');
  const ids: ArchitectureId[] = [];
  const add = (id: ArchitectureId) => { if (permitted.has(id) && (id !== 'hyflex' || modality === 'hyflex') && (id !== 'micro' || isBrief) && (id !== 'performance' || isBrief) && !ids.includes(id) && !(id === 'micro' && ids.includes('weekly')) && !(id === 'weekly' && ids.includes('micro'))) ids.push(id); };
  add(closest);
  if (isBrief) add('performance');
  for (const id of priorities) add(id);
  for (const id of ALL) add(id);
  // Three when the policy allows it; fewer when an administrator has narrowed the list.
  if (!ids.length) throw new Error('The design partner policy allows no structure that fits this course.');
  return { ids: ids.slice(0, 3), closest: ids[0], weeks: Math.max(weeks, 1), overlaysDefault: ['bookends', 'spaced-review', ...((modality === 'online-async' || modality === 'online-sync' || modality === 'hybrid' || modality === 'hyflex') ? ['teaching-presence' as const] : [])] };
}
