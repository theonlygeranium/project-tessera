import { describe, expect, it } from 'vitest';
import { elementSchema, palmyraClient, salvageBlocks } from './palmyra';
import { fixtureAi } from '../../shared/ai';
import { validateBlockContent } from '../../shared/service/validate';
import type { BlockType } from '../../shared/domain';
import seed from '../../shared/seed-syllabus.json';

const block = (text: string) => ({ type: 'text', level: 2, text, tone: '', title: '', question: '', options: [], correctOptionId: '', feedbackCorrect: '', feedbackIncorrect: '' });
const full = JSON.stringify({ blocks: [block('One "quoted" {brace}'), block('Two'), block('Three'), block('Four')] });

describe('salvageBlocks', () => {
  it('keeps every complete block before a cut-off', () => {
    const cut = full.slice(0, full.indexOf('Four') + 2);
    expect(salvageBlocks(cut).map((b) => b.text)).toEqual(['One "quoted" {brace}', 'Two', 'Three']);
  });
  it('reads a complete response', () => {
    expect(salvageBlocks(full)).toHaveLength(4);
  });
});

describe('palmyraClient', () => {
  const reply = (content: string, finish = 'stop') =>
    new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });

  it('reads a syllabus in three parallel parts with page-anchored lines, then merges them', async () => {
    const input = { sourceKind: 'syllabus' as const, name: seed.name, sections: seed.sections };
    const fixture = (await fixtureAi.run('syllabus-extract', input)).output;
    const parts: Record<string, unknown> = {
      syllabus_extract_course: { profile: { ...fixture.profile, materials: undefined }, outcomes: fixture.outcomes, assessments: fixture.assessments },
      syllabus_extract_schedule: { schedule: fixture.schedule },
      syllabus_extract_policies: { materials: fixture.profile.materials, policies: fixture.policies },
    };
    const seen: string[] = [];
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const name = body.response_format.json_schema.name as string;
      seen.push(name);
      expect(body.reasoning_effort).toBe('low');
      expect(body.stop).toEqual(['\n\n\n']);
      expect(Number.isInteger(body.seed)).toBe(true);
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[0].content).toContain("You are Tessera's design partner. The instructor is the subject-matter expert and the instructor of record;");
      expect(body.messages[1].content).toContain('[p. 4] Course schedule\nWeek Dates Topic Reading Due');
      expect(body.messages[1].content).toContain('8 Oct 13–17\n9 Oct 20–24');
      if (name === 'syllabus_extract_course') expect(body.response_format.json_schema.schema.required).toEqual(['profile', 'outcomes', 'assessments']);
      if (name === 'syllabus_extract_schedule') expect(body.messages[0].content).toContain('Never build rows from lists of assignment due dates');
      return reply(JSON.stringify(parts[name]));
    } });
    const output = (await ai.run('syllabus-extract', input)).output;
    expect(seen.sort()).toEqual(['syllabus_extract_course', 'syllabus_extract_policies', 'syllabus_extract_schedule']);
    expect(output.schedule).toHaveLength(14);
    expect(output.outcomes).toHaveLength(6);
    expect(output.profile.materials).toEqual(fixture.profile.materials);
    expect(output.policies).toEqual(fixture.policies);
  });
  it('retries one extraction part without repeating the others', async () => {
    const input = { sourceKind: 'syllabus' as const, name: seed.name, sections: seed.sections };
    const fixture = (await fixtureAi.run('syllabus-extract', input)).output;
    const calls: Record<string, number> = {};
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async (_url, options) => {
      const name = JSON.parse(String(options?.body)).response_format.json_schema.name as string;
      calls[name] = (calls[name] ?? 0) + 1;
      if (name === 'syllabus_extract_schedule' && calls[name] === 1) return reply('{"schedule":[{"week":1', 'length');
      return reply(JSON.stringify(name === 'syllabus_extract_course' ? { profile: fixture.profile, outcomes: fixture.outcomes, assessments: fixture.assessments } : name === 'syllabus_extract_schedule' ? { schedule: fixture.schedule } : { materials: fixture.profile.materials, policies: fixture.policies }));
    } });
    expect((await ai.run('syllabus-extract', input)).output.schedule).toHaveLength(14);
    expect(calls).toEqual({ syllabus_extract_course: 1, syllabus_extract_schedule: 2, syllabus_extract_policies: 1 });
  });
  it('caps only the syllabus source block at 60,000 characters', async () => {
    const long = 'X'.repeat(60_000) + 'SHOULD_NOT_APPEAR';
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const source = body.messages[1].content.split('Source:\n')[1];
      expect(source).toHaveLength(60_000);
      expect(source).not.toContain('SHOULD_NOT_APPEAR');
      return reply(JSON.stringify((await fixtureAi.run('syllabus-extract', { sourceKind: 'syllabus', name: seed.name, sections: seed.sections })).output));
    } });
    await ai.run('syllabus-extract', { sourceKind: 'syllabus', name: 'Long', sections: [{ page: 1, heading: '', level: 0, text: long, lines: [long] }] });
  });

  it('salvages a runaway lesson draft instead of failing (after retrying for a check)', async () => {
    const cut = full.slice(0, full.indexOf('Four') + 2) + ' '.repeat(50);
    let calls = 0;
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async () => { calls++; return reply(cut, 'length'); } });
    const { output, model } = await ai.run('lesson-draft', { courseTitle: 'C', brief: { audience: '', outcomes: [], moduleCount: 1, lessonsPerModule: 1, lessonMinutes: 10, tone: '', notes: '' }, moduleTitle: 'M', lesson: { title: 'L', minutes: 10, objective: 'O' }, sources: [] });
    expect(model).toBe('palmyra-x6');
    expect(output.blocks.map((b) => (b as { text: string }).text)).toEqual(['One "quoted" {brace}', 'Two', 'Three']);
    expect(calls).toBe(3);
  });

  it('accepts a lesson draft that has a knowledge check on the first try', async () => {
    const check = { ...block(''), type: 'check', question: 'Q?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', feedbackCorrect: 'y', feedbackIncorrect: 'n' };
    let calls = 0;
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async () => { calls++; return reply(JSON.stringify({ blocks: [block('One'), block('Two'), check] })); } });
    const { output } = await ai.run('lesson-draft', { courseTitle: 'C', brief: { audience: '', outcomes: [], moduleCount: 1, lessonsPerModule: 1, lessonMinutes: 10, tone: '', notes: '' }, moduleTitle: 'M', lesson: { title: 'L', minutes: 10, objective: 'O' }, sources: [] });
    expect(output.blocks.at(-1)?.type).toBe('check');
    expect(calls).toBe(1);
  });

  it('retries malformed output, then succeeds', async () => {
    let calls = 0;
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async () => (++calls < 3 ? reply('{"title": "cut') : reply('{"title":"Hi","body":"Hello"}')) });
    const { output } = await ai.run('announcement', { courseTitle: 'C', instructorName: 'I', prompt: 'p' });
    expect(output).toEqual({ title: 'Hi', body: 'Hello' });
    expect(calls).toBe(3);
  });

  it('does not retry a 401', async () => {
    let calls = 0;
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async () => { calls++; return new Response('no', { status: 401 }); } });
    await expect(ai.run('announcement', { courseTitle: 'C', instructorName: 'I', prompt: 'p' })).rejects.toMatchObject({ code: 'ai-failed' });
    expect(calls).toBe(1);
  });
});

describe('element schemas and mapping', () => {
  const types: BlockType[] = ['text', 'callout', 'check', 'document', 'table', 'scenario'];
  it('requires every property and forbids extras at each object depth', () => {
    const inspect = (schema: unknown) => {
      if (!schema || typeof schema !== 'object') return;
      const value = schema as Record<string, unknown>;
      if (value.type === 'object') {
        expect(value.additionalProperties).toBe(false);
        expect(value.required).toEqual(Object.keys(value.properties as object));
        Object.values(value.properties as object).forEach(inspect);
      }
      if (value.type === 'array') inspect(value.items);
    };
    for (const type of types) inspect(elementSchema(type as Parameters<typeof elementSchema>[0]));
  });
  it('maps a sample response of each type to validated block content', async () => {
    for (const type of types) {
      const input = { courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', lessonText: 'A lesson.', type, instruction: '' };
      const sample = (await fixtureAi.run('element', input)).output;
      const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async (_url, options) => {
        const request = JSON.parse(String(options?.body));
        expect(request.response_format.json_schema.schema).toEqual(elementSchema(type as Parameters<typeof elementSchema>[0]));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sample) }, finish_reason: 'stop' }] }), { status: 200 });
      } });
      expect(validateBlockContent((await ai.run('element', input)).output.block).type).toBe(type);
    }
  });
  it('retries invalid element content three times before failing', async () => {
    let calls = 0;
    const invalid = { block: { type: 'check', question: 'Question?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], correctOptionId: 'missing', feedbackCorrect: 'Yes', feedbackIncorrect: 'Try again' } };
    const ai = palmyraClient({ apiKey: 'k', url: 'https://x', fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) }, finish_reason: 'stop' }] }), { status: 200 });
    } });
    await expect(ai.run('element', { courseTitle: 'C', moduleTitle: 'M', lessonTitle: 'L', lessonText: '', type: 'check', instruction: '' })).rejects.toMatchObject({ code: 'ai-failed' });
    expect(calls).toBe(3);
  });
});
