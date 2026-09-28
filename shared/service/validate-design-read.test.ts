import { describe, expect, it } from 'vitest';
import seed from '../seed-syllabus.json';
import { fixtureAi } from '../ai';
import { extractSyllabusFixture } from '../syllabus-fixture';
import { RICE_DEFAULTS } from '../policy';
import type { DesignSource, SyllabusExtraction } from '../domain';
import { validateObjectiveRewrite, validateRead } from './validate-design';

const source = seed as DesignSource;
const extracted = extractSyllabusFixture({ sourceKind: 'syllabus', name: source.name, sections: source.sections });
const extraction = { ...extracted, problems: [], provenance: { model: 'fixture', task: 'syllabus-extract' as const, generatedAt: '2026-09-28T12:00:00.000Z', sources: [], summary: '' } } satisfies SyllabusExtraction;
const make = async () => (await fixtureAi.run('syllabus-analyze', { extraction, profileAnswers: {}, rates: RICE_DEFAULTS, rubricRefsAllowed: ['tessera', 'oscqr'] })).output;
const invalid = (value: unknown) => expect(() => validateRead(value, extraction, source)).toThrowError(/invalid|unknown|outside|Palmer|outcome|learning style/i);

describe('instructional read validation', () => {
  it('accepts the fixture mapping', async () => { const read = validateRead(await make(), extraction, source); expect(read.outcomeAudits).toHaveLength(6); expect(read.alignment).toHaveLength(30); });
  it('rejects malformed analysis output', () => invalid({ summary: 'bad' }));
  it('rejects unknown outcome IDs', async () => invalid({ ...await make(), outcomeAudits: [{ ...(await make()).outcomeAudits[0], outcomeId: 'absent' }, ...(await make()).outcomeAudits.slice(1)] }));
  it('rejects unknown assessment IDs', async () => { const read = await make(); invalid({ ...read, alignment: [{ ...read.alignment[0], assessmentId: 'absent' }, ...read.alignment.slice(1)] }); });
  it('rejects spans outside the source', async () => { const read = await make(); invalid({ ...read, cites: [{ page: 999, text: 'absent' }] }); });
  it('rejects Bloom outside the union', async () => { const read = await make(); invalid({ ...read, outcomeAudits: [{ ...read.outcomeAudits[0], bloom: 'invent' }, ...read.outcomeAudits.slice(1)] }); });
  it('rejects Fink outside the union', async () => { const read = await make(); invalid({ ...read, outcomeAudits: [{ ...read.outcomeAudits[0], fink: 'invent' }, ...read.outcomeAudits.slice(1)] }); });
  it('rejects Palmer above 46', async () => { const read = await make(); invalid({ ...read, learnerCenteredness: { ...read.learnerCenteredness!, palmer: { ...read.learnerCenteredness!.palmer, score: 47 } } }); });
  it('rejects learning styles claims', async () => invalid({ ...await make(), summary: 'Here is what I understood, and here is what I need from you. This uses learning styles.' }));
  it('rejects malformed objective rewrites', () => expect(() => validateObjectiveRewrite({ text: 'Explain it.' })).toThrowError(/invalid shape/));
});
