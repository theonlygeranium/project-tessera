import type { CalcInput, CalcItem, GradeCategory } from './types';
import { defaultGradebookSetup } from './defaults';

const due = '2026-01-01T00:00:00.000Z';
const now = '2026-02-01T00:00:00.000Z';
const category = (id: string, name: string, weight: number, position: number, lowest = 0, keepAtLeast = 1): GradeCategory => ({ id, courseId: 'stat110-04', name, weight, position, drop: { lowest, highest: 0, keepAtLeast }, lateApplies: true });
export const goldenSetup = defaultGradebookSetup('stat110-04', { categories: [category('hw', 'Homework', 15, 0, 1, 2), category('quiz', 'Quizzes', 20, 1, 1, 2), category('mid', 'Midterm', 20, 2), category('project', 'Project', 40, 3), category('participation', 'Participation', 5, 4)] });
const definitions: [string, string, string, number, boolean][] = [
  ['hw1', 'HW 1', 'hw', 10, false], ['hw2', 'HW 2', 'hw', 10, false], ['hw3', 'HW 3', 'hw', 10, false], ['hw4', 'HW 4', 'hw', 10, false], ['ec', 'Extra credit', 'hw', 5, true],
  ['q1', 'Quiz 1', 'quiz', 20, false], ['q2', 'Quiz 2', 'quiz', 20, false], ['q3', 'Quiz 3', 'quiz', 20, false], ['mid', 'Midterm', 'mid', 100, false], ['prop', 'Proposal', 'project', 20, false], ['draft', 'Draft', 'project', 40, false],
];
type Score = number | 'M' | 'EX' | 'TG' | null | { late: number; score: number } | { override: number };
const rows: [string, string, Score[]][] = [
  ['u-aguilar', 'Aguilar Tomás', [9, { late: 2, score: 9 }, 8, 9, null, 17, 15, 18, 84, 17, 33]],
  ['u-asante', 'Asante Kwame', [8, 7, 9, 'TG', 2, 14, 'M', 16, 72, 15, 29]],
  ['u-bello', 'Bello Aisha', [10, 10, 9, 10, 5, 19, 20, 18, 96, 20, 38]],
  ['u-brooks', 'Brooks Hannah', [7, 8, 'EX', 8, null, 15, 16, 14, { override: 82 }, 16, 31]],
  ['u-ellis', 'Ellis Jordan', ['M', 6, 7, 'M', null, 11, 13, 12, 61, 13, 24]],
  ['u-haddad', 'Haddad Fatima', [9, 9, 10, 8, 4, 18, 17, 19, 88, 18, 35]],
  ['u-marchetti', 'Marchetti Sofia', [8, 9, 8, { late: 1, score: 8 }, null, 16, 17, 15, 79, 17, 32]],
  ['u-petrova', 'Petrova Elena', [10, 9, 9, 9, 3, 'EX', 18, 19, 91, 19, 36]],
  ['u-ramirez', 'Ramírez Diego', [7, 'TG', 8, 7, null, 13, 15, 14, 74, { late: 3, score: 16 }, 28]],
  ['u-priya', 'Natarajan Priya', [9, 10, { late: 1, score: 7 }, 7, 3, 16, 18, 'EX', 81, 18, 34]],
  ['u-whitaker', 'Whitaker Noah', [8, 8, 7, 9, null, 15, 14, 'M', 77, 16, 30]],
  ['u-zhao', 'Zhao Lin', [9, 10, 9, 8, 2, 18, 19, 17, 90, 19, 37]],
];
export const goldenNames = new Map(rows.map(([id, name]) => [id, name]));
export function goldenInput(studentId: string, view: 'student' | 'held' = 'student'): CalcInput {
  const row = rows.find(([id]) => id === studentId);
  if (!row) throw new Error(`Unknown fixture student ${studentId}`);
  const items: CalcItem[] = definitions.map(([assignmentId, title, categoryId, points, extraCredit], position) => {
    const value = row[2][position];
    const late = typeof value === 'object' && value !== null && 'late' in value ? value.late : 0;
    const score = typeof value === 'number' ? value : typeof value === 'object' && value !== null ? ('score' in value ? value.score : value.override) : null;
    const submission = value === null || value === 'M' || value === 'EX' ? null : { state: (value === 'TG' ? 'submitted' : 'graded') as 'submitted' | 'graded', submittedAt: new Date(Date.parse(due) + late * 86400000).toISOString(), score, released: assignmentId !== 'draft' };
    const itemState = value === 'EX' ? { excused: { reason: 'Fixture', studentNote: null, by: 'u-okafor', at: now }, missing: null, lateWaived: null, override: null } : typeof value === 'object' && value !== null && 'override' in value ? { excused: null, missing: null, lateWaived: null, override: { score: value.override, reason: 'Fixture', by: 'u-okafor', at: now } } : null;
    return { assignmentId, title, categoryId, points, extraCredit, countsTowardGrade: true, dueAt: due, position, submission, itemState, hypothetical: null };
  });
  return { setup: goldenSetup, studentId, items, view, now, finalOverride: null };
}
export function pendingItem(assignmentId: string, title: string, categoryId: string, points: number, position: number): CalcItem {
  return { assignmentId, title, categoryId, points, extraCredit: false, countsTowardGrade: true, dueAt: '2026-03-01T00:00:00.000Z', position, submission: null, itemState: null, hypothetical: null };
}
