import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../shared/api';
import { ACCENTS, TUTOR_MODES } from '../../../../shared/policy';
import {
  applyApiFieldError, countPhrase, importSummary, modesFrom, policyValueFrom, roleChangeMessage, roleChangeSentence,
  toAiPolicy, tutorChoice,
} from './form';

describe('admin form helpers', () => {
  it('places required, conflict, and email errors on fields', () => {
    expect(applyApiFieldError(new ApiError('invalid', 'name is required.'))).toEqual({ name: 'Enter a name.' });
    expect(applyApiFieldError(new ApiError('invalid', 'shortName is required.'))).toEqual({ shortName: 'Enter a short name.' });
    expect(applyApiFieldError(new ApiError('conflict', 'Email already exists.'))).toEqual({ email: 'That email is already used.' });
    expect(applyApiFieldError(new ApiError('invalid', 'Invalid email or role.'), { email: 'nope', role: 'student' })).toEqual({
      email: 'Enter an email address like name@school.edu.',
    });
    expect(applyApiFieldError(new ApiError('invalid', 'Unknown accent.'))).toEqual({ accent: 'Choose an accent.' });
    expect(applyApiFieldError(new ApiError('invalid', 'name is required.', { fields: { email: 'Use a school email.' } }))).toEqual({
      email: 'Use a school email.',
    });
    expect(applyApiFieldError(new ApiError('forbidden', 'Sign in first.'))).toEqual({});
  });

  it('summarizes an import the way the page reads it', () => {
    expect(importSummary(3, 1)).toBe('3 added, 1 needs attention');
    expect(importSummary(3, 0)).toBe('3 added');
    expect(importSummary(0, 2)).toBe('0 added, 2 need attention');
    expect(countPhrase(1, 'student')).toBe('1 student');
    expect(countPhrase(4, 'student')).toBe('4 students');
  });

  it('keeps Off and drops Open on graded work', () => {
    expect(modesFrom(['hints'], 'graded')).toEqual(['off', 'hints']);
    expect(modesFrom(['open', 'hints', 'off'], 'graded')).toEqual(['hints', 'off']);
    expect(modesFrom(['open', 'off'], 'practice')).toEqual(['open', 'off']);
    const policy = toAiPolicy(policyValueFrom({
      aiAuthoring: true,
      tutorModes: { graded: ['open', 'hints'], practice: ['hints'] },
    }));
    expect(policy.tutorModes.graded).not.toContain('open');
    expect(policy.tutorModes.graded).toContain('off');
    expect(policy.tutorModes.practice).toContain('off');
    expect(policy.aiAuthoring).toBe(true);
  });

  it('disables Off everywhere and Open on graded work, with the reasons', () => {
    const off = TUTOR_MODES.find((mode) => mode.id === 'off');
    const open = TUTOR_MODES.find((mode) => mode.id === 'open');
    expect(off && tutorChoice(off, 'practice')).toMatchObject({ disabled: true, description: expect.stringContaining('Off is always allowed.') });
    expect(open && tutorChoice(open, 'graded').description).toContain('Open is never allowed on graded work.');
    expect(open && tutorChoice(open, 'graded').description).not.toMatch(/D-\d+/);
    expect(open && tutorChoice(open, 'graded').disabled).toBe(true);
    expect(open && tutorChoice(open, 'practice').disabled).toBe(false);
  });

  it('describes a role change, including the one you cannot make', () => {
    expect(roleChangeSentence('Priya Natarajan', 'student')).toBe('Priya Natarajan is now a student.');
    expect(roleChangeSentence('Dr. Amara Okafor', 'instructor')).toBe('Dr. Amara Okafor is now an instructor.');
    expect(roleChangeMessage(new ApiError('invalid', 'Cannot change this role.'))).toBe("You can't change your own role.");
  });

  it('paints a swatch for every accent option', () => {
    const css = readFileSync(new URL('./Admin.module.css', import.meta.url), 'utf8');
    for (const accent of ACCENTS) {
      expect(css).toContain(`--accent-option-${accent.id}`);
      expect(css).toContain(`value='${accent.id}'`);
    }
  });
});
