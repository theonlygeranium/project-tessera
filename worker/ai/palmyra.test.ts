import { describe, expect, it } from 'vitest';
import { palmyraClient, salvageBlocks } from './palmyra';

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
