import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from './normalize-extraction';

const row = (week: number, topic: string, extra: object = {}) => ({ week, dates: 'Feb 2–8', topic, reading: '', due: '', span: null, empty: false, ...extra });
describe('normalizeExtraction', () => {
  it('merges rows that share a week and keeps weeks in order', () => {
    const out = normalizeExtraction({ profile: {}, schedule: [row(2, 'Measures'), row(1, 'Introduction'), row(1, 'History of epidemiology', { due: 'Quiz 1' })] }) as { schedule: ReturnType<typeof row>[] };
    expect(out.schedule.map(r => r.week)).toEqual([1, 2]);
    expect(out.schedule[0]).toMatchObject({ topic: 'Introduction; History of epidemiology', due: 'Quiz 1', empty: false });
  });
  it('blanks strings that are only punctuation or null', () => {
    const out = normalizeExtraction({ profile: {}, schedule: [row(3, '', { dates: ':null,', empty: true })], assessments: [{ id: 'a1', title: 'Essay', weightPercent: 20, dueAt: 'null', format: ' , ', span: null }] }) as { schedule: ReturnType<typeof row>[]; assessments: { dueAt: string | null; format: string }[] };
    expect(out.schedule[0]).toMatchObject({ dates: '', topic: '', empty: true });
    expect(out.assessments[0]).toMatchObject({ dueAt: null, format: '' });
  });
  it('keeps the primary code of a cross-listed course', () => {
    const out = normalizeExtraction({ profile: { code: { value: 'EPS 120 / ASTR 120', origin: 'extracted', confidence: 1, spans: [] } } }) as { profile: { code: { value: string } } };
    expect(out.profile.code.value).toBe('EPS 120');
  });
});
