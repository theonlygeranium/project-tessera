import type { CourseProfile, DesignQuestion } from '../domain';

const modalities = new Set(['in-person', 'online-async', 'online-sync', 'hybrid', 'hyflex']);
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    if (question.profileField === 'credits' || question.profileField === 'termWeeks') {
      const value = Number(text);
      if (!Number.isFinite(value) || value <= 0 || (question.profileField === 'termWeeks' && !Number.isInteger(value))) continue;
      profile[question.profileField] = { ...accepted, value };
    } else if (question.profileField === 'modality') {
      if (modalities.has(text)) profile.modality = { ...accepted, value: text as NonNullable<CourseProfile['modality']['value']> };
    } else if (question.profileField === 'meeting') {
      const foundDays = days.filter(day => new RegExp(`\\b${day}(?:s)?\\b|\\b${day.slice(0, 3)}\\b`, 'i').test(text));
      const minutes = Number(/\b(\d{1,3})\s*(?:min|minutes)\b/i.exec(text)?.[1]);
      if (foundDays.length && Number.isInteger(minutes) && minutes > 0) profile.meeting = { ...accepted, value: { days: foundDays, minutes } };
    }
  }
  if (profile.credits.value !== null) profile.weeklyHoursBudget = profile.credits.value * 3;
  return profile;
}
