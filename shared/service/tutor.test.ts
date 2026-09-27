import { describe, expect, it, vi } from 'vitest';
import { fixtureAi, type AiClient } from '../ai';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

let next = 0;
async function context(repo: MemoryRepo, id: string, ai: AiClient = fixtureAi): Promise<ServiceContext> {
  return { repo, ai, user:await repo.getUser(id), now:() => SEED_NOW, newId:p => `${p}-test-${++next}` };
}
const lesson = { activityKind:'lesson' as const, activityId:'l-stat-1' };
const assignment = { activityKind:'assignment' as const, activityId:'asg-stat-1' };
const setting = (activity: typeof lesson | typeof assignment, mode: 'off' | 'hints' | 'explain' | 'open', maxHints = 2, allowedSourceIds: string[] = []) => ({ ...activity, mode, maxHints, allowedSourceIds });

describe('tutor service journey 10', () => {
  it('gives a hint and a reason for an answer request on graded work, and an answer in Open practice', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await context(repo,'u-okafor'), student = await context(repo,'u-marcus');
    const graded = await dispatch(service,student,'startTutorSession',assignment);
    const g = await dispatch(service,student,'sendTutorMessage',{ sessionId:graded.id,text:'What is the answer?',intent:'answer' });
    expect(g.reply).toMatchObject({ kind:'hint',hintNumber:1 });
    expect(g.reply.text).toMatch(/graded work/);
    expect(g.session.hintsUsed).toBe(1);
    await dispatch(service,teacher,'setTutorSetting',setting(lesson,'open'));
    const practice = await dispatch(service,student,'startTutorSession',lesson);
    const p = await dispatch(service,student,'sendTutorMessage',{ sessionId:practice.id,text:'Show me the answer.',intent:'answer' });
    expect(p.reply.kind).toBe('answer');
    expect(p.reply.text).toMatch(/hours a week Meridian State students study/);
    expect(p.session.hintsUsed).toBe(0);
    expect((await repo.getTutorSession(practice.id))?.answerRequests).toBe(1);
    expect((await dispatch(service,student,'startTutorSession',lesson)).id).toBe(practice.id);
  });

  it('counts hints, handles exhaustion, and refuses Off without calling AI', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await context(repo,'u-okafor');
    const run = vi.fn(fixtureAi.run.bind(fixtureAi)) as AiClient['run'];
    const student = await context(repo,'u-priya',{ run });
    await dispatch(service,teacher,'setTutorSetting',setting(assignment,'hints',1));
    const s = await dispatch(service,student,'startTutorSession',assignment);
    expect((await dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:'Hint please',intent:'hint'})).session.hintsUsed).toBe(1);
    const before = vi.mocked(run).mock.calls.length;
    const exhausted = await dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:'Another hint',intent:'hint'});
    expect(exhausted.reply.kind).toBe('refusal');
    expect(vi.mocked(run).mock.calls.length).toBe(before);
    await dispatch(service,teacher,'setTutorSetting',setting(lesson,'off'));
    const off = await dispatch(service,student,'startTutorSession',lesson);
    const refused = await dispatch(service,student,'sendTutorMessage',{sessionId:off.id,text:'Can you help?',intent:'chat'});
    expect(refused.reply.kind).toBe('refusal');
    expect(vi.mocked(run).mock.calls.length).toBe(before);
  });

  it('never sends answer keys or feedback as sources, filters citations, and replaces leaking replies', async () => {
    const repo = new MemoryRepo(seedData());
    const check = (await repo.listBlocks('l-stat-1')).find(b => b.type === 'check');
    if (!check || check.type !== 'check') throw new Error('Seed check missing');
    const correct = check.options.find(o => o.id === check.correctOptionId)!;
    const run = vi.fn(async (task: string, input: unknown) => task === 'tutor'
      ? { model:'spy', output:{ text:`The answer is ${correct.text}`, citeIds:['b-s1-1','not-a-source'] } }
      : { model:'spy', output:{ summary:'Course topics need more practice.' } }) as unknown as AiClient['run'];
    const student = await context(repo,'u-priya',{ run });
    const s = await dispatch(service,student,'startTutorSession',lesson);
    const response = await dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:'Help me choose',intent:'hint'});
    expect(response.reply.text).toMatch(/Here is a hint/);
    expect(response.reply.text).not.toContain(correct.text);
    expect(response.reply.cites).toEqual([]);
    const input = vi.mocked(run).mock.calls[0][1] as { sources:{ text:string }[] };
    expect(JSON.stringify(input.sources)).not.toMatch(/correctOptionId|feedbackCorrect|feedbackIncorrect/);
    expect(input.sources.length).toBeGreaterThan(0);
  });

  it('uses course file names only and excludes another student’s upload', async () => {
    const repo = new MemoryRepo(seedData());
    for (const [id,name,uploadedBy] of [['file-guide','Guide.pdf','u-okafor'],['file-private','Private submission.pdf','u-marcus']]) {
      await repo.putFile({ id,courseId:'c-stat110',name,kind:'pdf',mime:'application/pdf',size:10,key:`private/${id}`,version:1,uploadedBy,uploadedAt:SEED_NOW,scan:null });
    }
    const run = vi.fn(fixtureAi.run.bind(fixtureAi)) as AiClient['run'];
    const student = await context(repo,'u-priya',{ run });
    const s = await dispatch(service,student,'startTutorSession',lesson);
    await dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:'Help',intent:'chat'});
    const sources = (vi.mocked(run).mock.calls[0][1] as { sources:{ id:string; text:string }[] }).sources;
    expect(sources.find(source => source.id === 'file-guide')?.text).toBe('Guide.pdf');
    expect(sources.some(source => source.id === 'file-private')).toBe(false);
    expect(JSON.stringify(sources)).not.toContain('private/file-guide');
  });

  it('enforces ownership, publication, input limits, and setting bounds', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await context(repo,'u-okafor'), priya = await context(repo,'u-priya'), marcus = await context(repo,'u-marcus');
    await expect(dispatch(service,teacher,'setTutorSetting',setting(assignment,'open'))).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,teacher,'setTutorSetting',setting(lesson,'hints',11))).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,teacher,'setTutorSetting',setting(lesson,'hints',-1))).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,teacher,'setTutorSetting',setting(lesson,'hints',2,['wrong-id']))).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,priya,'startTutorSession',{ activityKind:'lesson',activityId:'l-stat-3' })).rejects.toMatchObject({code:'not-found'});
    const session = await dispatch(service,priya,'startTutorSession',lesson);
    await expect(dispatch(service,marcus,'sendTutorMessage',{sessionId:session.id,text:'Hello',intent:'chat'})).rejects.toMatchObject({code:'forbidden'});
    await expect(dispatch(service,priya,'sendTutorMessage',{sessionId:session.id,text:' ',intent:'chat'})).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,priya,'sendTutorMessage',{sessionId:session.id,text:'x'.repeat(2001),intent:'chat'})).rejects.toMatchObject({code:'invalid'});
  });

  it('stops at 60 messages per session', async () => {
    const repo = new MemoryRepo(seedData()), student = await context(repo,'u-priya');
    const s = await dispatch(service,student,'startTutorSession',lesson);
    for (let i=0;i<30;i++) await dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:`Question ${i}`,intent:'chat'});
    expect((await repo.getTutorSession(s.id))?.messages).toHaveLength(60);
    await expect(dispatch(service,student,'sendTutorMessage',{sessionId:s.id,text:'One more',intent:'chat'})).rejects.toMatchObject({code:'conflict'});
  });

  it('returns only course students and summaries, never transcripts, and excludes other instructors', async () => {
    const repo = new MemoryRepo(seedData()), priya = await context(repo,'u-priya'), marcus = await context(repo,'u-marcus'), teacher = await context(repo,'u-okafor'), chen = await context(repo,'u-chen');
    const p = await dispatch(service,priya,'startTutorSession',lesson);
    await dispatch(service,priya,'sendTutorMessage',{sessionId:p.id,text:'Private wording about variation 12345',intent:'chat'});
    const m = await dispatch(service,marcus,'startTutorSession',assignment);
    await dispatch(service,marcus,'sendTutorMessage',{sessionId:m.id,text:'Another private question',intent:'answer'});
    const other = await context(repo,'u-jordan');
    const comm = await dispatch(service,other,'startTutorSession',{activityKind:'lesson',activityId:'l-comm-1'});
    await dispatch(service,other,'sendTutorMessage',{sessionId:comm.id,text:'Question from another course',intent:'chat'});
    const rows = await dispatch(service,teacher,'getTutorSummaries',{courseId:'c-stat110'});
    expect(rows.map(row => row.studentId)).toEqual(['u-marcus','u-priya']);
    expect(JSON.stringify(rows)).not.toMatch(/Private wording|Another private question|Question from another course|messages/);
    expect(rows.every(row => row.provenance?.task === 'tutor-summary')).toBe(true);
    expect(rows.find(row => row.studentId === 'u-marcus')?.answerRequests).toBe(1);
    await expect(dispatch(service,chen,'getTutorSummaries',{courseId:'c-stat110'})).rejects.toMatchObject({code:'forbidden'});
  });
});
