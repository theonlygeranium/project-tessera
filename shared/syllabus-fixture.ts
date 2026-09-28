import type { AiTasks } from './ai';
import type { Extracted, SourceSpan } from './domain';

type Input = AiTasks['syllabus-extract']['input'];
type Output = AiTasks['syllabus-extract']['output'];
type Line = { text: string; page: number | null };

/** A deterministic, line-oriented parser for fictional demo syllabi. It does not infer absent facts. */
export function extractSyllabusFixture(input: Input): Output {
  const lines: Line[] = input.sections.flatMap(section => (section.lines ?? section.text.split('\n')).map(text => ({ text: text.trim(), page: section.page })).filter(line => line.text));
  const find = (pattern: RegExp) => lines.find(line => pattern.test(line.text));
  const span = (line: Line): SourceSpan => ({ page: line.page, text: line.text });
  const field = <T>(value: T | null, line?: Line, origin: 'extracted' | 'inferred' = 'extracted'): Extracted<T> => value === null
    ? { value: null, origin: 'missing', confidence: 0, spans: [] }
    : { value, origin, confidence: origin === 'inferred' ? 0.65 : 1, spans: line ? [span(line)] : [] };
  const header = find(/\b[A-Z]{2,}\s*\d{2,}\b/);
  const term = find(/\b\d+\s+weeks\b/i);
  const contact = find(/Instructor:/i);
  const meeting = find(/\bMeets\b/i);
  const descriptionAt = lines.findIndex(line => /^Course description$/i.test(line.text));
  const materialsAt = lines.findIndex(line => /^Required text$/i.test(line.text));
  const code = header?.text.match(/\b([A-Z]{2,}\s*\d{2,})\b/)?.[1] ?? null;
  const title = header?.text.split('·')[1]?.trim() ?? null;
  const credits = term?.text.match(/(\d+)\s+credits/i);
  const weeks = term?.text.match(/(\d+)\s+weeks/i);
  const name = contact?.text.match(/Instructor:\s*([^·]+?)(?=\s*·|$)/i)?.[1]?.trim();
  const email = contact?.text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/)?.[0];
  const officeHours = contact?.text.match(/Office hours\s+(.+)$/i)?.[1] ?? '';
  const minutes = meeting?.text.match(/\((\d+)\s*min\)/i);
  const days = meeting?.text.match(/Meets\s+(.+?),\s*\d/i)?.[1].split(/\s+and\s+|\s*,\s*/).map(day => day.trim()) ?? [];
  const prereq = meeting?.text.match(/Prerequisite:\s*([^.]*)/i);
  const level = meeting?.text.match(/(\d+-level)/i);
  const descriptionLines = descriptionAt < 0 ? [] : lines.slice(descriptionAt + 1, materialsAt < 0 ? descriptionAt + 1 : materialsAt);
  const material = materialsAt < 0 ? undefined : lines[materialsAt + 1];
  const outcomeStart = lines.findIndex(line => /^Learning outcomes$/i.test(line.text));
  const gradingStart = lines.findIndex(line => /^Grading$/i.test(line.text));
  const outcomes = (outcomeStart < 0 ? [] : lines.slice(outcomeStart + 1, gradingStart < 0 ? undefined : gradingStart))
    .flatMap(line => { const match = line.text.match(/^(\d+)\.\s+(.+)$/); return match ? [{ id: `outcome-${match[1]}`, text: match[2], span: span(line), origin: 'extracted' as const }] : []; });
  const scheduleStart = lines.findIndex(line => /^Course schedule$/i.test(line.text));
  const assessments = (gradingStart < 0 ? [] : lines.slice(gradingStart + 1, scheduleStart < 0 ? undefined : scheduleStart))
    .flatMap(line => {
      const match = line.text.match(/^(.+?)\s*(?:\|\s*)?(\d+(?:\.\d+)?)%/);
      if (!match) return [];
      const title = match[1].trim();
      const due = line.text.match(/\bDue\s+(?:[A-Za-z]+,?\s+)?(December|Dec)\s+(\d{1,2})\b/i);
      return [{ id: `assessment-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title, weightPercent: Number(match[2]), dueAt: due ? `2026-12-${due[2].padStart(2, '0')}` : null, format: /multiple choice/i.test(line.text) ? 'multiple choice' : title, span: span(line) }];
    });
  const policyStart = lines.findIndex(line => /^Course policies$/i.test(line.text));
  const schedule = (scheduleStart < 0 ? [] : lines.slice(scheduleStart + 1, policyStart < 0 ? undefined : policyStart))
    .flatMap(line => {
      const match = line.text.match(/^(\d{1,2})\s*(?:\|\s*)?((?:[A-Z][a-z]+\s*)?\d{1,2}[–-](?:(?:[A-Z][a-z]+\s*)?\d{1,2}))\s*(.*)$/);
      if (!match) return [];
      const rest = match[3].replace(/\s*\|\s*/g, ' ').trim();
      const [topic, after] = rest.split(/\s+Ch\.\s*/);
      const readingMatch = after?.match(/^(\d+)(.*)$/);
      return [{ week: Number(match[1]), dates: match[2], topic: topic ?? '', reading: readingMatch ? `Ch. ${readingMatch[1]}` : '', due: readingMatch?.[2]?.trim() === '—' ? '' : readingMatch?.[2]?.trim() ?? '', span: span(line), empty: !rest }];
    });
  const policyKinds: Record<string, Output['policies'][number]['kind']> = { Attendance: 'attendance', 'Late work': 'late-work', 'Academic integrity': 'integrity', 'Generative AI': 'ai-use', Accommodations: 'accommodations' };
  const policies: Output['policies'] = [];
  for (const line of policyStart < 0 ? [] : lines.slice(policyStart + 1)) {
    const match = line.text.match(/^([^:]+):\s*(.*)$/);
    if (match) policies.push({ kind: policyKinds[match[1]] ?? 'other', text: match[2], span: span(line) });
    else if (policies.length) { policies[policies.length - 1].text += ` ${line.text}`; policies[policies.length - 1].span.text += ` ${line.text}`; }
  }
  const startEnd = term?.text.match(/\(([A-Z][a-z]+)\s+(\d+)\s*[–-]\s*([A-Z][a-z]+)\s+(\d+)\)/);
  const iso = (month: string, day: string) => { const number = new Date(`${month} 1, 2026`).getMonth() + 1; return `2026-${String(number).padStart(2, '0')}-${day.padStart(2, '0')}`; };
  const profile: Output['profile'] = {
    code: field(code, header), title: field(title, header), credits: field(credits ? Number(credits[1]) : null, term),
    termWeeks: field(weeks ? Number(weeks[1]) : null, term),
    termStart: field(startEnd ? iso(startEnd[1], startEnd[2]) : null, term), termEnd: field(startEnd ? iso(startEnd[3], startEnd[4]) : null, term),
    meeting: field(minutes && days.length ? { days, minutes: Number(minutes[1]) } : null, meeting),
    modality: field(meeting ? 'in-person' : null, meeting, 'inferred'), level: field(level?.[1] ?? null, meeting),
    prerequisites: field(prereq ? (prereq[1].trim().toLowerCase() === 'none' ? [] : [prereq[1].trim()]) : null, meeting),
    enrolment: field<number>(null), instructor: field(name && email ? { name, email, officeHours } : null, contact),
    description: field(descriptionLines.length ? descriptionLines.map(line => line.text).join(' ') : null, descriptionLines[0]),
    materials: field(material ? [{ title: material.text, kind: 'textbook', span: span(material) }] : null, material),
    business: field<{ goal: string; metric: string; audienceRole: string }>(null), weeklyHoursBudget: credits ? Number(credits[1]) * 3 : 0,
  };
  if (descriptionLines.length) profile.description.spans = descriptionLines.map(span);
  return { profile, outcomes, assessments, schedule, policies };
}
