import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { Object.defineProperty(globalThis, 'location', { value: { search: '' }, configurable: true }); });
import { resetCourseHomeEditor } from './Workspace';

describe('course home reload', () => {
  it('replaces a dirty editor even when the refetched course is unchanged', () => {
    const server = { welcome: 'Welcome to fictional practice.', outcomes: ['Compare fictional methods.'] };
    let welcome = 'Unsaved welcome'; let outcomes = ['Unsaved outcome'];
    resetCourseHomeEditor(server, value => { welcome = value; }, value => { outcomes = value; });
    expect(welcome).toBe(server.welcome);
    expect(outcomes).toEqual(server.outcomes);
    expect(outcomes).not.toBe(server.outcomes);
  });
});
