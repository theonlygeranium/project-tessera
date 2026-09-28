import { describe, expect, it } from 'vitest';
import { uniqueKey } from './keys';

describe('template editor keys', () => {
  it('makes readable unique keys within the contract length', () => {
    expect(uniqueKey('Course Overview', [])).toBe('course-overview');
    expect(uniqueKey('Course Overview', ['course-overview'])).toBe('course-overview-2');
    expect(uniqueKey('Long '.repeat(20), []).length).toBeLessThanOrEqual(40);
    expect(uniqueKey('é', [])).toBe('e');
  });
});
