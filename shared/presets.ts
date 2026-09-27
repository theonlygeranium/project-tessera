import type { LearningProfile, Preset, PresetId } from './domain';

export const PRESETS: readonly Preset[] = [
  { id: 'undergraduate', title: 'Full-time student', description: 'Sets 30-minute sessions, weekly reminders, and standard reading.', sessionMinutes: 30, reminders: 'weekly', readingLevel: 'standard' },
  { id: 'working-learner', title: 'Working learner', description: 'Sets 15-minute sessions, daily reminders, and standard reading.', sessionMinutes: 15, reminders: 'daily', readingLevel: 'standard' },
  { id: 'compliance', title: 'Required training', description: 'Sets 20-minute sessions, weekly reminders, and plain language.', sessionMinutes: 20, reminders: 'weekly', readingLevel: 'plain' },
  { id: 'certification', title: 'Exam preparation', description: 'Sets 45-minute sessions, daily reminders, and standard reading.', sessionMinutes: 45, reminders: 'daily', readingLevel: 'standard' },
  { id: 'graduate', title: 'Graduate study', description: 'Sets 60-minute sessions, weekly reminders, and standard reading.', sessionMinutes: 60, reminders: 'weekly', readingLevel: 'standard' },
];

export const presetById = (id: PresetId): Preset | undefined => PRESETS.find(preset => preset.id === id);

const weeklyTime = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}` : `${minutes} minutes`;

/** A deterministic recommendation based only on the student's stated goals and time. */
export function recommendPreset(profile: LearningProfile): { preset: Preset; why: string } {
  const { goals, weeklyMinutes } = profile;
  const time = `You plan about ${weeklyTime(weeklyMinutes)} a week`;
  let id: PresetId;
  let reason: string;
  if (goals.includes('compliance')) { id = 'compliance'; reason = 'need to complete required training'; }
  else if (goals.includes('career-change') && weeklyMinutes <= 180) { id = 'working-learner'; reason = 'want to change careers'; }
  else if (goals.includes('upskill') && weeklyMinutes <= 180) { id = 'working-learner'; reason = 'want to build work skills'; }
  else if (goals.includes('finish-degree') && weeklyMinutes >= 360) { id = 'undergraduate'; reason = 'want to finish your degree'; }
  else if (goals.includes('finish-degree')) { id = 'working-learner'; reason = 'want to finish your degree'; }
  else if (goals.includes('curiosity')) { id = 'working-learner'; reason = 'want to explore a topic'; }
  else { id = 'undergraduate'; reason = 'have not picked a specific goal'; }
  const preset = presetById(id)!;
  return { preset, why: `${time} and ${reason}, so ${preset.sessionMinutes}-minute sessions and ${preset.reminders} reminders are suggested.` };
}
