// Reading level (Flesch–Kincaid grade) for the "reading level suits the audience" check.
// An estimate for English prose: good enough to flag a lesson that reads far above the
// audience, not a verdict on any one sentence.

/** Lessons reading above this grade are flagged (about the end of secondary school). */
export const READING_GRADE_LIMIT = 12;
/** Below this many words, the estimate is too noisy to use. */
export const READING_MIN_WORDS = 80;

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface ReadingEstimate {
  words: number;
  sentences: number;
  /** Flesch–Kincaid grade level, one decimal; null when there are fewer than READING_MIN_WORDS words. */
  grade: number | null;
}

export function readingLevel(text: string): ReadingEstimate {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length + (/[^.!?\s]\s*$/.test(text.trim()) ? 1 : 0));
  if (words.length < READING_MIN_WORDS) return { words: words.length, sentences, grade: null };
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return { words: words.length, sentences, grade: Math.round(grade * 10) / 10 };
}
