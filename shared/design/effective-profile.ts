import type { CourseProfile, DesignQuestion } from '../domain';

const modalities: Record<string, NonNullable<CourseProfile['modality']['value']>> = { 'in-person': 'in-person', 'in person': 'in-person', 'face-to-face': 'in-person', 'online-async': 'online-async', online: 'online-async', 'fully online': 'online-async', 'asynchronous online': 'online-async', 'online-sync': 'online-sync', 'synchronous online': 'online-sync', 'live online': 'online-sync', hybrid: 'hybrid', hyflex: 'hyflex' };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayAliases = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type CorrectionField = 'credits' | 'termWeeks' | 'meeting' | 'modality';
export function parseProfileCorrection(field: CorrectionField, text: string): number | CourseProfile['meeting']['value'] | CourseProfile['modality']['value'] | null {
  const value = text.trim();
  if (field === 'credits' || field === 'termWeeks') {
    const match = field === 'credits' ? /^(\d+(?:\.\d+)?)\s*(?:credits?)?$/i.exec(value) : /^(\d+)\s*(?:weeks?)?$/i.exec(value);
    const number = match ? Number(match[1]) : 0;
    return number > 0 ? number : null;
  }
  if (field === 'modality') return modalities[value.toLowerCase()] ?? null;
  if (/[-\p{Pd}\u2212\uFE58\uFE63\uFF0D]\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?)\b/iu.test(value)) return null;
  if (/(?:^|[^\d])[-\p{Pd}\u2212\uFE58\uFE63\uFF0D]?\s*\.\d+\s*(?:hours?|hrs?|h|minutes?|mins?)\b/iu.test(value)) return null;
  if (/\b\d+\.\d+\s*(?:minutes?|mins?)\b/i.test(value)) return null;
  const foundDays = days.filter((day, index) => new RegExp(`\\b(?:${day}|${dayAliases[index]})(?:s)?\\b`, 'i').test(value));
  const hours = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(value);
  const minutePart = /\b(\d+)\s*(?:minutes?|mins?)\b/i.exec(value);
  const minutes = (hours ? Number(hours[1]) * 60 : 0) + (minutePart ? Number(minutePart[1]) : 0);
  if (!foundDays.length && !minutes) return null;
  if (hours && (Number(hours[1]) <= 0 || !Number.isInteger(Number(hours[1]) * 60)) || minutePart && Number(minutePart[1]) <= 0) return null;
  return { days: foundDays, minutes };
}

/** Accepted answers change planning inputs while the extracted record remains intact. */
export function effectiveProfile(extracted: CourseProfile, questions: DesignQuestion[], corrections: Partial<Record<'credits' | 'termWeeks' | 'meeting' | 'modality', string>> = {}): CourseProfile {
  const profile: CourseProfile = structuredClone(extracted);
  const correctionQuestions: DesignQuestion[] = Object.entries(corrections).map(([field, value]) => ({ id: `correction-${field}`, text: '', spans: [], kind: 'text', profileField: field as 'credits' | 'termWeeks' | 'meeting' | 'modality', options: [], required: false, answer: { optionId: null, value, skipped: false }, fromProblem: null }));
  for (const question of [...correctionQuestions, ...questions]) {
    const answer = question.answer;
    if (!question.profileField || !answer || answer.skipped) continue;
    const text = (answer.value ?? answer.optionId ?? '').trim();
    if (!text) continue;
    const accepted = { origin: 'user_supplied' as const, confidence: 1, spans: [] };
    const parsed = parseProfileCorrection(question.profileField, text);
    if (parsed === null) continue;
    if (question.profileField === 'credits' || question.profileField === 'termWeeks') profile[question.profileField] = { ...accepted, value: parsed as number };
    else if (question.profileField === 'modality') profile.modality = { ...accepted, value: parsed as NonNullable<CourseProfile['modality']['value']> };
    else {
      const meeting = parsed as NonNullable<CourseProfile['meeting']['value']>;
      profile.meeting = { ...accepted, value: { days: meeting.days.length ? meeting.days : profile.meeting.value?.days ?? [], minutes: meeting.minutes || profile.meeting.value?.minutes || 0 } };
    }
  }
  if (profile.credits.value !== null) profile.weeklyHoursBudget = profile.credits.value * 3;
  return profile;
}
