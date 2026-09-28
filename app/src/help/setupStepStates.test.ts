import { describe, expect, it } from 'vitest';
import type { CourseOutline, ReadinessResult } from '../../../shared/domain';
import { setupStepStates, type SetupFacts, type SetupRole } from './setupStepStates';

function facts({ instructor = false, students = false, welcome = '', outcomes = [] as string[], lesson = false, draftBlockCount = 0, published = false, readiness = null as ReadinessResult | null }: { instructor?: boolean; students?: boolean; welcome?: string; outcomes?: string[]; lesson?: boolean; draftBlockCount?: number; published?: boolean; readiness?: ReadinessResult | null } = {}): SetupFacts {
  return { outline: { course: { instructorIds: instructor ? ['u-1'] : [], welcome, outcomes }, modules: [{ lessons: lesson ? [{ draftBlockCount, status: published ? 'published' : 'draft' }] : [] }] } as unknown as CourseOutline, enrollments: { userIds: students ? ['u-2'] : [] }, readiness };
}
const goodReadiness = { standards: [{ items: [{ status: 'met' }, { status: 'needs-review' }] }] } as unknown as ReadinessResult;
const badReadiness = { standards: [{ items: [{ status: 'not-met' }] }] } as unknown as ReadinessResult;
const states = (role: SetupRole, data: SetupFacts) => Object.fromEntries(setupStepStates(role, data).map(step => [step.id, step.state]));

describe('setupStepStates', () => {
  it('marks creation done and the first missing admin step current', () => {
    expect(states('admin', facts())).toEqual({ created: 'complete', instructor: 'current', students: 'upcoming', content: 'upcoming', published: 'upcoming' });
  });
  it('checks instructor assignment, enrollment, content, and any published lesson independently', () => {
    expect(states('admin', facts({ instructor: true, students: true, lesson: true, published: true }))).toEqual({ created: 'complete', instructor: 'complete', students: 'complete', content: 'complete', published: 'complete' });
    expect(states('admin', facts({ students: true, lesson: true, published: true }))).toMatchObject({ instructor: 'current', students: 'complete', content: 'complete', published: 'complete' });
    expect(states('admin', facts({ instructor: true, students: true, lesson: true }))).toMatchObject({ content: 'complete', published: 'current' });
  });
  it('requires a nonempty welcome and an outcome for home', () => {
    expect(states('instructor', facts({ welcome: 'Hello' })).home).toBe('current');
    expect(states('instructor', facts({ outcomes: ['Learn'] })).home).toBe('current');
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'] })).home).toBe('complete');
  });
  it('requires a lesson for outline and draft review, and zero AI drafts', () => {
    expect(states('instructor', facts()).outline).toBe('upcoming');
    expect(states('instructor', facts()).drafts).toBe('upcoming');
    expect(states('instructor', facts({ lesson: true, draftBlockCount: 1 }))).toMatchObject({ outline: 'complete', drafts: 'upcoming' });
    expect(states('instructor', facts({ lesson: true })).drafts).toBe('complete');
  });
  it('keeps readiness incomplete on missing, failed, or not-met results', () => {
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true })).readiness).toBe('current');
    expect(states('instructor', { ...facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true }), readiness: undefined }).readiness).toBe('current');
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true, readiness: badReadiness })).readiness).toBe('current');
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true, readiness: goodReadiness })).readiness).toBe('complete');
  });
  it('requires at least one lesson and every lesson published', () => {
    expect(states('instructor', facts({ readiness: goodReadiness })).published).toBe('upcoming');
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true, readiness: goodReadiness })).published).toBe('current');
    expect(states('instructor', facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true, published: true, readiness: goodReadiness })).published).toBe('complete');
    const mixed = facts({ welcome: 'Hello', outcomes: ['Learn'], lesson: true, published: true, readiness: goodReadiness });
    mixed.outline!.modules[0].lessons.push({ ...mixed.outline!.modules[0].lessons[0], id: 'second', status: 'draft' });
    expect(states('instructor', mixed).published).toBe('current');
    expect(states('admin', mixed).published).toBe('complete');
  });
});
