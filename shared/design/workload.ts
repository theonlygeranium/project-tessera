import type { CourseProfile, ExtractedAssessment, ScheduleRow, WorkloadEstimate, WorkloadRates } from '../domain';

/** A transparent planning estimate; no hours are inferred from unstated activities. */
export function estimateWorkload(profile: CourseProfile, schedule: ScheduleRow[], assessments: ExtractedAssessment[], rates: WorkloadRates): WorkloadEstimate {
  const budget = profile.credits.value === null ? profile.weeklyHoursBudget : profile.credits.value * 3;
  const meetings = profile.meeting.value ? profile.meeting.value.days.length * profile.meeting.value.minutes / 60 : 0;
  const materialText = (profile.materials.value ?? []).map(item => `${item.title} ${item.span.text}`).join(' ');
  const chapterPages = Number(materialText.match(/(?:\b(\d+)\s+pages?\s+(?:per|each)\s+chapter|chapter[^.]*?\b(\d+)\s+pages?)/i)?.slice(1).find(Boolean)) || 30;
  const pagesByChapter = new Map([...materialText.matchAll(/\bCh(?:apter)?\.?\s*(\d+)\s*(?:[:(]|is)?\s*(\d+)\s*(?:pages?|pp\.?)/gi)].map(match => [Number(match[1]), Number(match[2])]));
  const count = Math.max(1, profile.termWeeks.value ?? 0, ...schedule.map(row => row.week));
  const weeks = Array.from({ length: count }, (_, index) => ({ week: index + 1, hours: meetings, overBudget: false, drivers: meetings ? [`${meetings.toFixed(1)} h class meetings`] : [] }));
  const byWeek = new Map(weeks.map(week => [week.week, week]));
  const add = (week: number, hours: number, driver: string) => { const target = byWeek.get(week); if (target && hours > 0) { target.hours += hours; target.drivers.push(driver); } };
  for (const row of schedule) {
    const chapters = [...row.reading.matchAll(/Ch(?:apter)?\.?\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi)].flatMap(match => Array.from({ length: Math.max(1, (match[2] ? Number(match[2]) : Number(match[1])) - Number(match[1]) + 1) }, (_, offset) => Number(match[1]) + offset));
    const explicitPages = [...row.reading.matchAll(/(?:pp?\.?\s*)(\d+)\s*[–-]\s*(\d+)/gi)].reduce((sum, match) => sum + Math.max(0, Number(match[2]) - Number(match[1]) + 1), 0);
    const pages = explicitPages || chapters.reduce((sum, chapter) => sum + (pagesByChapter.get(chapter) ?? chapterPages), 0);
    add(row.week, pages / rates.readingPagesPerHour, `${pages} pages reading`);
    if (/\b(?:HW|homework|problem\s*set)\b/i.test(row.due)) add(row.week, rates.problemSetHours, 'problem set');
    if (/\bquiz\b/i.test(row.due)) add(row.week, rates.quizMinutes / 60, 'quiz');
    const writingPages = Number(row.due.match(/(\d+)\s*pages?\b/i)?.[1] ?? 0);
    if (writingPages) add(row.week, writingPages * rates.writingHoursPerPage, `${writingPages} pages writing`);
    if (/\bdiscussion\b/i.test(row.due)) add(row.week, rates.discussionMinutes / 60, 'discussion');
  }
  const project = assessments.find(item => /project/i.test(`${item.title} ${item.format}`));
  if (project) {
    const milestones = schedule.filter(row => /project\s*(?:draft|milestone|checkpoint|proposal)/i.test(row.due)).map(row => row.week);
    const final = schedule.find(row => /project\s*(?:due|final)/i.test(row.due))?.week ?? schedule.at(-1)?.week ?? 1;
    const start = milestones.length ? Math.max(1, Math.min(...milestones) - 1) : Math.max(1, final - 2);
    const parts = milestones.length ? [0.4, 0.3, 0.3] : [1 / 3, 1 / 3, 1 / 3];
    const projectWeeks = milestones.length ? [milestones[0], Math.min(final, milestones[0] + 1), final] : [start, Math.min(final, start + 1), final];
    projectWeeks.forEach((week, index) => add(week, rates.projectHours * parts[index], `project ${Math.round(parts[index] * 100)}%`));
  }
  for (const week of weeks) { week.hours = Math.round(week.hours * 10) / 10; week.overBudget = budget > 0 && week.hours > budget; }
  return { weeklyBudgetHours: budget, averageHours: Math.round(weeks.reduce((sum, week) => sum + week.hours, 0) / weeks.length * 10) / 10, weeks, rates: { ...rates }, assumptions: [profile.credits.value === null ? `Stated seat time sets a ${budget} h session budget.` : `${profile.credits.value} credits × 3 sets a ${budget} h weekly budget.`, `${chapterPages} pages per chapter unless the materials or a reading list a page count; ${rates.readingPagesPerHour} pages per reading hour.`, `Each problem set is ${rates.problemSetHours} h, each quiz ${rates.quizMinutes} min, and the project is ${rates.projectHours} h.`, project ? 'Project hours use the listed draft and due weeks as planning anchors; a draft uses a 40/30/30 split.' : 'No project hours were added.'] };
}
