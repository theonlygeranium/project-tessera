import { describe, expect, it } from 'vitest';
import type { AiPolicy } from './domain';
import { DEFAULT_AI_DISCLOSURE, DEFAULT_DESIGN_PARTNER, RICE_DEFAULTS, designPartnerPolicy, workloadRatesFor } from './policy';

const policy: AiPolicy = { aiAuthoring: true, tutorModes: { graded: ['off'], practice: ['off'] } };

describe('design partner policy defaults', () => {
  it('uses the named defaults only when policy values are absent', () => {
    expect(workloadRatesFor(policy)).toEqual({ readingPagesPerHour: 34, problemSetHours: 2, writingHoursPerPage: 1, projectHours: 30, quizMinutes: 20, discussionMinutes: 45 });
    expect(workloadRatesFor(policy)).toEqual(RICE_DEFAULTS);
    expect(designPartnerPolicy(policy)).toEqual(DEFAULT_DESIGN_PARTNER);
    const custom = { ...RICE_DEFAULTS, readingPagesPerHour: 20 };
    expect(workloadRatesFor({ ...policy, workloadRates: custom })).toEqual(custom);
    expect(DEFAULT_AI_DISCLOSURE).toMatch(/syllabus/i);
    expect(DEFAULT_AI_DISCLOSURE).toMatch(/responsible/i);
  });
  it('disables the design partner whenever AI authoring is off', () => {
    expect(designPartnerPolicy({ ...policy, aiAuthoring: false }).enabled).toBe(false);
    expect(designPartnerPolicy({ ...policy, aiAuthoring: false, designPartner: { enabled: true, allowedArchitectures: ['weekly'] } })).toEqual({ enabled: false, allowedArchitectures: ['weekly'] });
  });
});
