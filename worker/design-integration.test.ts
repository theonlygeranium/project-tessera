import { describe, expect, it, vi } from 'vitest';
import { fixtureAi } from '../shared/ai';
import { ROUTES } from '../shared/api';
import type { DesignSession, FileRecord } from '../shared/domain';
import type { Repo } from '../shared/repo';
import { seedData } from '../shared/seed';
import { MemoryRepo, service } from '../shared/service';
import type { ServiceContext } from '../shared/service/context';
import { advanceExtractJob } from '../shared/service/design-partner';
import { coveredWeeks } from '../shared/design/plan';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
import { findFileRoute } from './api/files';
import { palmyraClient, sourceText } from './ai/palmyra';

const at = '2026-09-28T12:00:00.000Z';
async function setup(kind: 'memory' | 'd1') {
  const repo: Repo = kind === 'memory' ? new MemoryRepo(seedData()) : new D1Repo(createTestDb() as never);
  if (kind === 'd1') await (repo as D1Repo).reset(seedData());
  let next = 0;
  const ctx: ServiceContext = { repo, ai: fixtureAi, user: await repo.getUser('u-okafor'), now: () => at, newId: prefix => `${prefix}-${kind}-${++next}` };
  return ctx;
}
async function read(ctx: ServiceContext) {
  const started = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
  await service.advanceDesignSession(ctx, { sessionId: started.id });
  return service.advanceDesignSession(ctx, { sessionId: started.id });
}
async function options(ctx: ServiceContext, session: DesignSession) {
  await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
  return service.advanceDesignSession(ctx, { sessionId: session.id });
}

for (const kind of ['memory', 'd1'] as const) describe(`${kind} Night 4 integration`, () => {
  it('pauses possible rosters before persistence, jobs, background work, or AI', async () => {
    const ctx = await setup(kind);
    const run = vi.fn(fixtureAi.run);
    const ai = { run } as ServiceContext['ai'];
    const background = { startGeneration: vi.fn(async () => {}) };
    const runCtx = { ...ctx, ai, background };
    const saveSession = vi.spyOn(ctx.repo, 'putDesignSession');
    const saveJob = vi.spyOn(ctx.repo, 'putGenerationJob');
    const baseline = await ctx.repo.listDesignSessions('c-stat110');
    for (const text of [
      'Course notes\nName | Email\nCasey Sample | casey@example.edu',
      'Course notes\nName | Email\nCasey Sample | casey@example.edu\n\nAvery Example | avery@example.edu',
      'Course notes\nName | ID\nCasey Sample | 1234567\n\nAvery Example | 7654321',
      'Course notes\nAvery Example | 7654321',
      'Course notes\nAvery Example | 1234',
      'Course notes\nAvery Example, 1234',
      'Course notes\nAvery Example\t1234',
      'Course notes\nPat Example, pexample@university.example.edu',
    ]) {
      await expect(service.createDesignSession(runCtx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false } })).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' }, message: expect.stringContaining('Nothing has been sent to the model') });
      expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(baseline);
    }
    expect(saveSession).not.toHaveBeenCalled();
    expect(saveJob).not.toHaveBeenCalled();
    expect(background.startGeneration).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps recognizable roster rows out of extraction after instructor confirmation', async () => {
    const ctx = await setup(kind);
    for (const text of [
      'Course notes\nName | Email\nCasey Sample | casey@example.edu\n\nAvery Example | avery@example.edu',
      'Course notes\nName | ID\nCasey Sample | 1234567\n\nAvery Example | 7654321',
    ]) {
      const run = vi.fn(fixtureAi.run);
      const ai = { run } as ServiceContext['ai'];
      const session = await service.createDesignSession({ ...ctx, ai }, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
      expect(session.source.sections.map(section => section.text).join('\n')).not.toContain('Casey Sample');
      expect(run).not.toHaveBeenCalled();
      await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
      expect(JSON.stringify(run.mock.calls)).not.toContain('Casey Sample');
      expect(run).toHaveBeenCalled();
    }
  });

  it('gates DOCX heading rosters and removes heading and body identities before extraction', async () => {
    const ctx = await setup(kind);
    const file: FileRecord = { id: `heading-docx-${kind}`, courseId: 'c-stat110', name: 'Fictional syllabus.docx', kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100, key: 'files/fictional-docx', version: 1, uploadedBy: 'u-okafor', uploadedAt: at, scan: null };
    await ctx.repo.putFile(file);
    for (const [heading, lines, retained] of [
      ['Name | Email', ['Casey Sample | casey@example.edu', 'Week 1 | Evidence'], 'Week 1 | Evidence'],
      ['Casey Sample | casey@example.edu', ['Course objectives', 'Discuss evidence.'], 'Discuss evidence.'],
      ['Casey Sample | casey@example.edu', ['Avery Example | avery@example.edu', 'Course objectives'], 'Course objectives'],
    ] as const) {
      const documents = { extract: vi.fn(async () => ({ sections: [{ page: null, heading, level: 1, text: lines.join('\n'), lines: [...lines] }], ocr: false })) } as unknown as ServiceContext['documents'];
      const run = vi.fn(fixtureAi.run);
      const runCtx = { ...ctx, documents, ai: { run } as ServiceContext['ai'] };
      const input = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, fileId: file.id, consent: { syllabusOnly: true as const, rememberProfile: false } };
      const sessions = await ctx.repo.listDesignSessions('c-stat110');
      await expect(service.createDesignSession(runCtx, input)).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
      expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(sessions);
      expect(run).not.toHaveBeenCalled();
      const session = await service.createDesignSession(runCtx, { ...input, consent: { ...input.consent, confirmedNoStudentRoster: true } });
      expect(JSON.stringify(session.source.sections.map(section => ({ heading: section.heading, lines: section.lines, text: section.text })))).not.toContain('Casey Sample');
      expect(JSON.stringify(session.source.sections)).not.toContain('casey@example.edu');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('Casey Sample');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('casey@example.edu');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('Avery Example');
      expect(session.source.sections.map(section => section.text).join('\n')).toContain(retained);
      await service.advanceDesignSession(runCtx, { sessionId: session.id });
      const extractInputs = run.mock.calls.filter(([task]) => task === 'syllabus-extract').map(([, aiInput]) => JSON.stringify(aiInput));
      expect(extractInputs).toHaveLength(1);
      expect(extractInputs[0]).not.toContain('Casey Sample');
      expect(extractInputs[0]).not.toContain('casey@example.edu');
    }
    const rosterHeading = { extract: vi.fn(async () => ({ sections: [{ page: null, heading: 'Student roster:', level: 1, text: 'Casey Sample\nAvery Example', lines: ['Casey Sample', 'Avery Example'] }], ocr: false })) } as unknown as ServiceContext['documents'];
    await expect(service.createDesignSession({ ...ctx, documents: rosterHeading }, { courseId: 'c-stat110', sourceKind: 'syllabus', fileId: file.id, consent: { syllabusOnly: true, rememberProfile: false } })).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
    const ordinaryHeading = { extract: vi.fn(async () => ({ sections: [{ page: null, heading: 'Course objectives', level: 1, text: 'Discuss evidence.', lines: ['Discuss evidence.'] }], ocr: false })) } as unknown as ServiceContext['documents'];
    const ordinary = await service.createDesignSession({ ...ctx, documents: ordinaryHeading }, { courseId: 'c-stat110', sourceKind: 'syllabus', fileId: file.id, consent: { syllabusOnly: true, rememberProfile: false } });
    expect(ordinary.source.sections[0].heading).toBe('Course objectives');
    expect(sourceText(ordinary.source.sections, 60_000)).toContain('[§ Course objectives]');
  });

  it('gates appended student identities in faculty lines and headings, then removes them before extraction', async () => {
    const ctx = await setup(kind);
    const identity = 'Instructor: Dr. Pat Example | Student: Casey Sample | casey@example.edu';
    const file: FileRecord = { id: `faculty-heading-${kind}`, courseId: 'c-stat110', name: 'Fictional syllabus.docx', kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100, key: 'files/faculty-heading', version: 1, uploadedBy: 'u-okafor', uploadedAt: at, scan: null };
    await ctx.repo.putFile(file);
    const documents = { extract: vi.fn(async () => ({ sections: [{ page: null, heading: identity, level: 1, text: 'Course objectives\nDiscuss evidence.', lines: ['Course objectives', 'Discuss evidence.'] }], ocr: false })) } as unknown as ServiceContext['documents'];
    for (const source of [
      { text: `Course notes\n${identity}\nDiscuss evidence.` },
      { text: 'Course notes\nFaculty: Dr. Pat Example | Student: Casey Sample\nDiscuss evidence.' },
      { fileId: file.id },
    ]) {
      const run = vi.fn(fixtureAi.run);
      const background = { startGeneration: vi.fn(async () => {}) };
      const runCtx = { ...ctx, documents, ai: { run } as ServiceContext['ai'], background };
      const saveSession = vi.spyOn(ctx.repo, 'putDesignSession');
      const saveJob = vi.spyOn(ctx.repo, 'putGenerationJob');
      const baseline = await ctx.repo.listDesignSessions('c-stat110');
      const input = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, ...source, consent: { syllabusOnly: true as const, rememberProfile: false } };
      await expect(service.createDesignSession(runCtx, input)).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
      expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(baseline);
      expect(saveSession).not.toHaveBeenCalled();
      expect(saveJob).not.toHaveBeenCalled();
      expect(background.startGeneration).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      saveSession.mockRestore(); saveJob.mockRestore();

      const session = await service.createDesignSession({ ...ctx, documents, ai: { run } as ServiceContext['ai'] }, { ...input, consent: { ...input.consent, confirmedNoStudentRoster: true } });
      const fields = JSON.stringify(session.source.sections);
      expect(fields).not.toContain('Casey Sample');
      expect(fields).not.toContain('casey@example.edu');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('Casey Sample');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('casey@example.edu');
      await service.advanceDesignSession({ ...ctx, ai: { run } as ServiceContext['ai'] }, { sessionId: session.id });
      const extractInputs = run.mock.calls.filter(([task]) => task === 'syllabus-extract').map(([, aiInput]) => JSON.stringify(aiInput));
      expect(extractInputs).toHaveLength(1);
      expect(extractInputs[0]).not.toContain('Casey Sample');
      expect(extractInputs[0]).not.toContain('casey@example.edu');
    }
  });

  it('gates identity cells appended to an assessment header, then removes them before extraction', async () => {
    const ctx = await setup(kind);
    const run = vi.fn(fixtureAi.run);
    const background = { startGeneration: vi.fn(async () => {}) };
    const runCtx = { ...ctx, ai: { run } as ServiceContext['ai'], background };
    const saveSession = vi.spyOn(ctx.repo, 'putDesignSession');
    const saveJob = vi.spyOn(ctx.repo, 'putGenerationJob');
    const baseline = await ctx.repo.listDesignSessions('c-stat110');
    const input = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, text: 'Assignment | Points | Casey Sample | casey@example.edu\nHomework Assignment | 10', consent: { syllabusOnly: true as const, rememberProfile: false } };
    await expect(service.createDesignSession(runCtx, input)).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
    expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(baseline);
    expect(saveSession).not.toHaveBeenCalled();
    expect(saveJob).not.toHaveBeenCalled();
    expect(background.startGeneration).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    saveSession.mockRestore(); saveJob.mockRestore();

    const session = await service.createDesignSession({ ...ctx, ai: { run } as ServiceContext['ai'] }, { ...input, consent: { ...input.consent, confirmedNoStudentRoster: true } });
    expect(JSON.stringify(session.source.sections)).not.toContain('Casey Sample');
    expect(JSON.stringify(session.source.sections)).not.toContain('casey@example.edu');
    expect(sourceText(session.source.sections, 60_000)).not.toContain('Casey Sample');
    expect(session.source.sections[0].text).toContain('Homework Assignment | 10');
    await service.advanceDesignSession({ ...ctx, ai: { run } as ServiceContext['ai'] }, { sessionId: session.id });
    const extractInputs = run.mock.calls.filter(([task]) => task === 'syllabus-extract').map(([, aiInput]) => JSON.stringify(aiInput));
    expect(extractInputs).toHaveLength(1);
    expect(extractInputs[0]).not.toContain('Casey Sample');
    expect(extractInputs[0]).not.toContain('casey@example.edu');
  });

  it('gates comma-appended learner identities in faculty paste and headings', async () => {
    const ctx = await setup(kind);
    const identity = 'Instructor: Dr. Pat Example, Learner: Casey Sample, casey@example.edu';
    const file: FileRecord = { id: `comma-faculty-${kind}`, courseId: 'c-stat110', name: 'Fictional syllabus.docx', kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100, key: 'files/comma-faculty', version: 1, uploadedBy: 'u-okafor', uploadedAt: at, scan: null };
    await ctx.repo.putFile(file);
    const documents = { extract: vi.fn(async () => ({ sections: [{ page: null, heading: identity, level: 1, text: 'Course objectives\nDiscuss evidence.', lines: ['Course objectives', 'Discuss evidence.'] }], ocr: false })) } as unknown as ServiceContext['documents'];
    for (const source of [{ text: `${identity}\nCourse objectives\nDiscuss evidence.` }, { fileId: file.id }]) {
      const run = vi.fn(fixtureAi.run);
      const background = { startGeneration: vi.fn(async () => {}) };
      const runCtx = { ...ctx, documents, ai: { run } as ServiceContext['ai'], background };
      const saveSession = vi.spyOn(ctx.repo, 'putDesignSession');
      const saveJob = vi.spyOn(ctx.repo, 'putGenerationJob');
      const baseline = await ctx.repo.listDesignSessions('c-stat110');
      const input = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, ...source, consent: { syllabusOnly: true as const, rememberProfile: false } };
      await expect(service.createDesignSession(runCtx, input)).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
      expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(baseline);
      expect(saveSession).not.toHaveBeenCalled();
      expect(saveJob).not.toHaveBeenCalled();
      expect(background.startGeneration).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      saveSession.mockRestore(); saveJob.mockRestore();

      const confirmedCtx = { ...ctx, documents, ai: { run } as ServiceContext['ai'] };
      const session = await service.createDesignSession(confirmedCtx, { ...input, consent: { ...input.consent, confirmedNoStudentRoster: true } });
      const sourceFields = JSON.stringify(session.source.sections);
      expect(sourceFields).not.toContain('Casey Sample');
      expect(sourceFields).not.toContain('casey@example.edu');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('Casey Sample');
      expect(sourceText(session.source.sections, 60_000)).not.toContain('casey@example.edu');
      expect(sourceFields).toContain('Discuss evidence.');
      await service.advanceDesignSession(confirmedCtx, { sessionId: session.id });
      const extractInputs = run.mock.calls.filter(([task]) => task === 'syllabus-extract').map(([, aiInput]) => JSON.stringify(aiInput));
      expect(extractInputs).toHaveLength(1);
      expect(extractInputs[0]).not.toContain('Casey Sample');
      expect(extractInputs[0]).not.toContain('casey@example.edu');
    }
  });

  it('gates identity inside assessment title cells with email or numeric ID', async () => {
    const ctx = await setup(kind);
    for (const [text, identity] of [
      ['Assignment | Points\nHomework Assignment — Casey Sample (casey@example.edu) | 10\nHomework Assignment | 10', 'casey@example.edu'],
      ['Homework Assignment — Casey Sample | 1234567\nPractice Assignment | 7654321', '1234567'],
    ] as const) {
      const run = vi.fn(fixtureAi.run);
      const background = { startGeneration: vi.fn(async () => {}) };
      const runCtx = { ...ctx, ai: { run } as ServiceContext['ai'], background };
      const saveSession = vi.spyOn(ctx.repo, 'putDesignSession');
      const saveJob = vi.spyOn(ctx.repo, 'putGenerationJob');
      const baseline = await ctx.repo.listDesignSessions('c-stat110');
      const input = { courseId: 'c-stat110', sourceKind: 'syllabus' as const, text, consent: { syllabusOnly: true as const, rememberProfile: false } };
      await expect(service.createDesignSession(runCtx, input)).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
      expect(await ctx.repo.listDesignSessions('c-stat110')).toEqual(baseline);
      expect(saveSession).not.toHaveBeenCalled();
      expect(saveJob).not.toHaveBeenCalled();
      expect(background.startGeneration).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      saveSession.mockRestore(); saveJob.mockRestore();

      const confirmedCtx = { ...ctx, ai: { run } as ServiceContext['ai'] };
      const session = await service.createDesignSession(confirmedCtx, { ...input, consent: { ...input.consent, confirmedNoStudentRoster: true } });
      const sourceFields = JSON.stringify(session.source.sections);
      expect(sourceFields).not.toContain('Casey Sample');
      expect(sourceFields).not.toContain(identity);
      expect(sourceText(session.source.sections, 60_000)).not.toContain('Casey Sample');
      expect(sourceText(session.source.sections, 60_000)).not.toContain(identity);
      expect(sourceFields).toContain(identity === '1234567' ? 'Practice Assignment | 7654321' : 'Homework Assignment | 10');
      await service.advanceDesignSession(confirmedCtx, { sessionId: session.id });
      const extractInputs = run.mock.calls.filter(([task]) => task === 'syllabus-extract').map(([, aiInput]) => JSON.stringify(aiInput));
      expect(extractInputs).toHaveLength(1);
      expect(extractInputs[0]).not.toContain('Casey Sample');
      expect(extractInputs[0]).not.toContain(identity);
    }
  });

  it('pauses ambiguous identity rows and explicit roster labels while accepting grading tables', async () => {
    const ctx = await setup(kind);
    const consent = { syllabusOnly: true as const, rememberProfile: false };
    const input = (text: string) => ({ courseId: 'c-stat110', sourceKind: 'syllabus' as const, text, consent });
    for (const text of [
      'Practice Assignment | Casey Sample | casey@example.edu',
      'Practice Assignment | Casey Sample | 1234567',
      'casey sample | casey@example.edu',
      'Casey | Sample | casey@example.edu',
      'Casey | Sample | 1234567',
      'Instructor: Dr. Pat Example, Enrollee: Casey Sample',
      'Instructor: Dr. Pat Example, Learner: casey@example.edu',
      'Instructor: Dr. Pat Example Casey Sample casey@example.edu',
      'Student roster\nCasey Sample\nAvery Example',
      'CLASS ROSTER:\nCasey Sample',
      'Course roster.\nCasey Sample',
      'Enrollment list!\nCasey Sample',
    ]) {
      await expect(service.createDesignSession(ctx, input(text))).rejects.toMatchObject({ code: 'invalid', details: { reason: 'possible-roster' } });
    }
    for (const text of [
      'Practice Assignment | 1234567',
      'Assignment | Points\nHomework Assignment | 10\nLab Exercise | 20',
      'Instructor: Dr. Pat Example\nOffice: Science Hall 1024',
    ]) {
      await expect(service.createDesignSession(ctx, input(text))).resolves.toMatchObject({ stage: 'start' });
    }
    await expect(service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent })).resolves.toMatchObject({ stage: 'start' });
  });

  it('does not pause assessment rows, faculty contact, or the sample', async () => {
    const ctx = await setup(kind);
    const text = ['Course notes', 'Practice Assignment | 1234567', 'Essay | 20', 'Final Exam | 200', 'Participation | 10', 'Instructor: Dr. Pat Example', 'Office: Science Hall 1024'].join('\n');
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false } });
    expect(session.source.sections[0].text).toContain('Practice Assignment | 1234567');
    await expect(service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } })).resolves.toMatchObject({ stage: 'start' });
  });

  it('hides staff-only source bytes, metadata, and derived formats until explicit sharing', async () => {
    const ctx = await setup(kind);
    const objects = new Map<string, Uint8Array>();
    const bucket = { put: async (key: string, body: ReadableStream) => { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); }, get: async (key: string) => { const bytes = objects.get(key); return bytes ? { body: bytes, size: bytes.length } : null; } };
    const upload = findFileRoute('POST', '/courses/c-stat110/files/upload')!.handle;
    const form = new FormData(); form.set('file', new File(['PRIVATE-SYLLABUS-CONTENT-PROBE'], 'Draft syllabus.pdf', { type: 'application/pdf' }));
    const response = await upload(new Request('https://example.test/api/v1/courses/c-stat110/files/upload?visibility=staff', { method: 'POST', body: form }), ctx, bucket as never, { courseId: 'c-stat110' });
    expect(response.status).toBe(201);
    const file = await response.json() as { id: string; visibility: string; version: number; key: string };
    expect(file.visibility).toBe('staff');
    objects.set('format-key', new TextEncoder().encode('DERIVED-PRIVATE-PROBE'));
    await ctx.repo.putFormat({ fileId: file.id, version: file.version, format: 'reading', state: 'ready', outputKey: 'format-key', generatedAt: at, error: null });
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    expect((await service.listFiles(student, { courseId: 'c-stat110', limit: 200 })).items.some(item => item.id === file.id)).toBe(false);
    await expect(service.getFile(student, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.getFormats(student, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.requestFormat(student, { fileId: file.id, format: 'reading' })).rejects.toMatchObject({ code: 'not-found' });
    const content = findFileRoute('GET', `/files/${file.id}/content`)!.handle;
    await expect(content(new Request(`https://example.test/api/v1/files/${file.id}/content`), student, bucket as never, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(content(new Request(`https://example.test/api/v1/files/${file.id}/content?format=reading`), student, bucket as never, { fileId: file.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(service.setFileVisibility({ ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] }, { fileId: file.id, visibility: 'course' })).rejects.toMatchObject({ code: 'forbidden' });
    await service.setFileVisibility(ctx, { fileId: file.id, visibility: 'course' });
    expect((await service.listFiles(student, { courseId: 'c-stat110', limit: 200 })).items.some(item => item.id === file.id)).toBe(true);
    expect(await (await content(new Request(`https://example.test/api/v1/files/${file.id}/content`), student, bucket as never, { fileId: file.id })).text()).toContain('PRIVATE-SYLLABUS-CONTENT-PROBE');
  });

  it('keeps applied outcomes hidden from learners until a person keeps each draft', async () => {
    const ctx = await setup(kind);
    const readSession = await read(ctx);
    const token = { ...ctx, token: { id: 'token-probe', name: 'Fictional assistant' } as ServiceContext['token'], agent: { name: 'Fictional assistant' } };
    const confirmed = await service.confirmOutcomes(token, { sessionId: readSession.id, outcomes: [{ code: 'O1', text: 'Compare fictional survey methods in a new way.', originalText: '', source: 'instructor' }] });
    expect(confirmed.confirmedOutcomes?.[0].submittedBy).toEqual({ kind: 'agent', name: 'Fictional assistant' });
    await service.advanceDesignSession(ctx, { sessionId: readSession.id });
    const selected = (await ctx.repo.getDesignSession(readSession.id))!;
    await service.selectApproach(ctx, { sessionId: selected.id, optionIds: [selected.options![0].id], overlays: ['bookends'], rationale: 'Repeated practice fits these learners.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: selected.id });
    await service.applyProvisionPlan(token, { sessionId: selected.id, hash: plan.hash });
    const applied = (await ctx.repo.getDesignSession(selected.id))!;
    const draft = (await ctx.repo.listOutcomes(selected.courseId)).find(item => applied.created.outcomeIds.includes(item.id))!;
    expect(draft.aiState).toBe('draft');
    expect(draft.provenance).toMatchObject({ task: 'outcome-suggest', model: 'Assistant (Fictional assistant)' });
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).not.toContain(draft.text);
    expect((await service.listOutcomes(student, { courseId: selected.courseId })).some(item => item.id === draft.id)).toBe(false);
    await expect(service.keepDesignOutcome(token, { sessionId: selected.id, outcomeId: draft.id, expectedText: draft.text })).rejects.toMatchObject({ code: 'forbidden' });
    const before = await ctx.repo.listOutcomes(selected.courseId);
    await service.saveOutcomes(token, { courseId: selected.courseId, outcomes: before.map(row => ({ id: row.id, text: row.id === draft.id ? 'Revised fictional design outcome' : row.text })) });
    await expect(service.keepDesignOutcome(ctx, { sessionId: selected.id, outcomeId: draft.id, expectedText: draft.text })).rejects.toMatchObject({ code: 'conflict', message: 'This draft changed since you opened it. Review the new wording, then keep it.' });
    expect((await service.listOutcomes(student, { courseId: selected.courseId })).some(item => item.id === draft.id)).toBe(false);
    const revised = (await ctx.repo.listOutcomes(selected.courseId)).find(row => row.id === draft.id)!;
    const kept = await service.keepDesignOutcome(ctx, { sessionId: selected.id, outcomeId: draft.id, expectedText: revised.text });
    expect(kept.aiState).toBeUndefined();
    expect(kept.provenance).toMatchObject({ keptBy: ctx.user!.name, keptAt: at });
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).toContain(revised.text);
    const undone = await service.undoProvisionPlan(ctx, { sessionId: selected.id });
    expect(undone.kept).toContainEqual({ kind: 'outcome', id: draft.id, title: revised.text });
    expect((await service.getCourseOutline(student, { courseId: selected.courseId })).course.outcomes).toContain(revised.text);
  });

  it('claims one options job under concurrent confirmations and fails superseded work before AI', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const confirmed = session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text }));
    const results = await Promise.allSettled([service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: confirmed }), service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: confirmed })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const active = (await ctx.repo.getDesignSession(session.id))!.provisioning!.jobId!;
    const stale = { ...(await ctx.repo.getGenerationJob(active))!, id: `gj-stale-${kind}` };
    await ctx.repo.putGenerationJob(stale);
    const ai = vi.fn(fixtureAi.run);
    const result = await advanceExtractJob({ ...ctx, ai: { run: ai } as ServiceContext['ai'] }, stale);
    expect(result).toMatchObject({ state: 'failed', error: expect.stringContaining('superseded') });
    expect(ai).not.toHaveBeenCalled();
    expect((await service.advanceDesignSession(ctx, { sessionId: session.id })).options).not.toBeNull();
  });

  it('makes session reads inert and requires the AI operation to advance a job', async () => {
    const ctx = await setup(kind);
    const calls = vi.fn(fixtureAi.run);
    const runCtx = { ...ctx, ai: { run: calls } as ServiceContext['ai'] };
    const started = await service.createDesignSession(runCtx, { courseId: 'c-stat110', sourceKind: 'syllabus', sample: true, consent: { syllabusOnly: true, rememberProfile: false } });
    const before = await ctx.repo.getDesignSession(started.id);
    const readCtx = { ...runCtx, token: { id: 'read-only' } as ServiceContext['token'] };
    expect((await service.getDesignSession(readCtx, { sessionId: started.id })).provisioning?.done).toBe(0);
    expect(await ctx.repo.getDesignSession(started.id)).toEqual(before);
    expect(calls).not.toHaveBeenCalled();
    expect(ROUTES.getDesignSession.scope).toBe('content:read');
    expect(ROUTES.advanceDesignSession.scope).toBe('ai:run');
    expect((await service.advanceDesignSession(runCtx, { sessionId: started.id })).provisioning?.done).toBe(1);
  });

  it('removes two-row rosters and standalone name/ID lines before any model input', async () => {
    const ctx = await setup(kind);
    const text = ['Week 1 | Evidence and claims', 'Student Name | Student ID', 'Avery Example | 1234567', 'Casey Sample | 2345678', 'Week 2 | Compare sources', 'Jordan Placeholder | kj@student.example.edu'].join('\n');
    const source = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const cleaned = source.source.sections.map(section => section.text).join('\n');
    expect(cleaned).toContain('Week 1 | Evidence');
    for (const name of ['Avery Example', 'Casey Sample', 'Jordan Placeholder']) expect(cleaned).not.toContain(name);
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = JSON.stringify(input); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: source.id });
    expect(prompt).not.toContain('Avery Example');
    expect(prompt).not.toContain('Jordan Placeholder');
    expect((await ctx.repo.getDesignSession(source.id))!.extraction!.problems.some(problem => problem.message.includes('removed a table'))).toBe(true);
    const oneRow = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: 'Student Name | Student ID\nFictional Student | 3456789\nWeek 1 | Evidence', consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    expect(oneRow.source.sections.map(section => section.text).join('\n')).not.toContain('Fictional Student');
  });

  it('keeps assessment and staff contact lines while excluding only recognizable student rows', async () => {
    const ctx = await setup(kind);
    const surviving = ['Final Exam | 200', 'Research Paper | 150', 'Midterm Exam 100', 'Course Total | 1000', 'Lab Report, 120', 'Pat Example, pexample@university.example.edu', 'Instructor: Dr. Pat Example', 'Office: Science Hall 1024', 'Weekly Quizzes | 10 @ 10 points'];
    const removed = ['Avery Example | 1234567', 'Casey Sample | 2345678', 'Jordan Placeholder | kj@student.example.edu', 'Jordan Sample 20231234', 'Riley Test, Student ID 7654321'];
    const text = [...surviving, 'Student Name | Student ID', ...removed.slice(0, 2), 'Week 1 | Evidence', ...removed.slice(2)].join('\n');
    const source = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = source.source.sections.map(section => section.text).join('\n');
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = JSON.stringify(input); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: source.id });
    for (const line of surviving) { expect(saved).toContain(line); expect(prompt).toContain(line); }
    for (const line of removed) { expect(saved).not.toContain(line); expect(prompt).not.toContain(line); }
    expect(source.source.sections.map(section => section.text).join('\n')).not.toContain('Student Name | Student ID');
    expect((await ctx.repo.getDesignSession(source.id))!.extraction!.problems.some(problem => problem.message.includes('removed a table'))).toBe(true);
    const variants = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: ['Name | ID | Email', 'Taylor Example | A0012345 | te@example.edu', 'Student | Email', 'Morgan Example | me@student.example.edu', '', 'Office: Science Hall 1024', 'Lee Example A0012345', 'Pat Example, pexample@university.example.edu'].join('\n'), consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const variantText = variants.source.sections.map(section => section.text).join('\n');
    for (const name of ['Taylor Example', 'Morgan Example', 'Lee Example']) expect(variantText).not.toContain(name);
    expect(variantText).toContain('Pat Example, pexample@university.example.edu');
  });

  it('removes initials, hyphens, apostrophes, and accented roster names before extraction', async () => {
    const ctx = await setup(kind);
    const removed = ['Alex Q. Example | 1234567', 'Jean-Luc D’Exemple | 2345678', "Jean-Luc D'Exemple | 2345678", 'Riley Test | 7654321', 'Émile Référence | A123456', 'Final Exam | 1234567'];
    const surviving = ['Final Exam | 200', 'Research Paper | 150', 'Midterm Exam 100', 'Course Total | 1000', 'Lab Report, 120', 'Pat Example, pexample@university.example.edu', 'Instructor: Dr. Pat Example', 'Office: Science Hall 1024', 'Weekly Quizzes | 10 @ 10 points'];
    const text = ['Student Name | Student ID', ...removed, '', ...surviving].join('\n');
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = (await ctx.repo.getDesignSession(session.id))!.source.sections.map(section => section.text).join('\n');
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = JSON.stringify(input); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
    for (const line of removed) { expect(saved).not.toContain(line); expect(prompt).not.toContain(line); }
    for (const line of surviving) { expect(saved).toContain(line); expect(prompt).toContain(line); }
  });

  it('removes roster blocks and standalone identities without swallowing adjacent course content', async () => {
    const ctx = await setup(kind);
    const removed = [
      'Student Name | Student ID', 'Avery Example | ABC', 'Casey Sample | XYZ',
      'Student Name | ID | Email', 'Riley Test | 1234', 'Avery Example | 5678 | ae@university.example.edu',
      'Name | ID | Points', 'Avery Example | 1234567 | 10',
      'Student ID | Student Name', '1234567 | Avery Example', '2345678 | Casey Sample',
      'Name,Student ID', 'Riley Test, 7654321', 'Jordan Placeholder, 8765432',
      'Name\tEmail', 'Taylor Example\ttaylor@student.example.edu',
      'Avery Morgan Example | 1234567', 'Q. Example | 3456789',
      'A. B. Example, Student ID A12', 'Avery-Sample Example, Student ID X12',
      "Avery O'Example, Student ID X13", 'Avery O’Example, Student ID X14',
      'Élodie Example, Student ID X15', 'Avery Example, avery@student.example.edu',
    ];
    const surviving = [
      'Week 1 | Evidence', 'Week 2 | Practice', 'Participation | 10', 'Essay | 20',
      'Assignment | Points', 'Practice Assignment | 1234567', 'Research Project | 2345678',
      'Final Exam | 200', 'Research Paper | 150', 'Midterm Exam 100', 'Course Total | 1000',
      'Lab Report, 120', 'Pat Example, pexample@university.example.edu',
      'Instructor: Dr. Pat Example', 'Office: Science Hall 1024',
      'Weekly Quizzes | 10 @ 10 points', 'Reading Response | 100', 'Studio Practice | 120',
      'Week | Topic | Reading', 'Week 3 | Fictional topic | Fictional reading',
    ];
    const text = [
      ...removed.slice(0, 3), ...surviving.slice(0, 2), '',
      ...removed.slice(3, 6), '', ...surviving.slice(2, 4), '',
      ...removed.slice(6, 8), ...surviving.slice(4, 7), '',
      ...removed.slice(8, 11), '', ...removed.slice(11, 14), '',
      ...removed.slice(14, 16), '', ...removed.slice(16), '',
      'Name,Student ID', '"Avery, Morgan Example",3456789', '', ...surviving.slice(7),
    ].join('\n');
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = session.source.sections.map(section => section.text).join('\n');
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = JSON.stringify(input); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
    for (const line of removed) { expect(saved).not.toContain(line); expect(prompt).not.toContain(line); }
    expect(saved).not.toContain('"Avery, Morgan Example",3456789');
    expect(prompt).not.toContain('"Avery, Morgan Example",3456789');
    for (const line of surviving) { expect(saved).toContain(line); expect(prompt).toContain(line); }
  });

  it('recognizes split person columns and username headers with ragged rows', async () => {
    const ctx = await setup(kind);
    const text = ['First Name | Last Name | Student Number', 'Avery | Example | ABC', '| | A12', 'Week | Topic', 'Week 1 | Evidence', 'Learner,User Name', 'Casey Sample,casey7', '', 'Participation,10'].join('\n');
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = session.source.sections.map(section => section.text).join('\n');
    for (const removed of ['First Name | Last Name | Student Number', 'Avery | Example | ABC', '| | A12', 'Learner,User Name', 'Casey Sample,casey7']) expect(saved).not.toContain(removed);
    for (const kept of ['Week | Topic', 'Week 1 | Evidence', 'Participation,10']) expect(saved).toContain(kept);
  });

  it('restarts roster column layouts and preserves an adjacent grading table', async () => {
    for (const delimiter of [' | ', ',', '\t']) {
      const join = (...parts: string[]) => parts.join(delimiter);
      const removed = [join('Name', 'ID'), join('Avery Example', 'ABC'), join('Full Name', 'Points', 'ID'), join('Casey Sample', '10', 'XYZ')];
      const grading = [join('Assignment Name', 'Points'), join(delimiter === ' | ' ? 'Practice Assignment' : 'Essay', delimiter === ' | ' ? '1234567' : '20'), join('Week', 'Topic'), join('Week 1', 'Evidence')];
      const ctx = await setup(kind);
      const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: [...removed, ...grading].join('\n'), consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
      const saved = session.source.sections.map(section => section.text).join('\n');
      let prompt = '';
      const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = (input as { sections: { text: string }[] }).sections.map(section => section.text).join('\n'); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
      await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
      for (const line of removed) { expect(saved).not.toContain(line); expect(prompt).not.toContain(line); }
      for (const line of grading) { expect(saved).toContain(line); expect(prompt).toContain(line); }
    }
  });

  it('keeps an uppercase non-roster header after a roster block', async () => {
    const ctx = await setup(kind);
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: ['NAME | ID', 'Avery Example | ABC', 'ASSIGNMENT NAME | POINTS', 'Practice Assignment | 1234567'].join('\n'), consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = session.source.sections.map(section => section.text).join('\n');
    expect(saved).not.toContain('Avery Example');
    expect(saved).toContain('ASSIGNMENT NAME | POINTS');
    expect(saved).toContain('Practice Assignment | 1234567');
  });

  it('redacts no-digit roster rows and keeps only explicit table boundaries', async () => {
    const cases = [
      { text: ['Name | ID', 'Avery Example | abc', 'AVERY EXAMPLE | ABC', 'Assignment Name | POINTS', 'Essay | 20'], removed: ['Name | ID', 'Avery Example | abc', 'AVERY EXAMPLE | ABC'], kept: ['Assignment Name | POINTS', 'Essay | 20'] },
      { text: ['Name,ID', 'Avery Example,abc', 'AVERY EXAMPLE,ABC', 'Assignment Name,POINTS', 'Essay,20'], removed: ['Name,ID', 'Avery Example,abc', 'AVERY EXAMPLE,ABC'], kept: ['Assignment Name,POINTS', 'Essay,20'] },
      { text: ['Name\tID', 'Avery Example\tabc', 'AVERY EXAMPLE\tABC', 'Assignment Name\tPOINTS', 'Essay\t20'], removed: ['Name\tID', 'Avery Example\tabc', 'AVERY EXAMPLE\tABC'], kept: ['Assignment Name\tPOINTS', 'Essay\t20'] },
      { text: ['First Name | Last Name | Email', 'Casey | Sample | cs@student.example.edu', 'Week 1 | Evidence', 'Week 2 | Practice'], removed: ['First Name | Last Name | Email', 'Casey | Sample | cs@student.example.edu'], kept: ['Week 1 | Evidence', 'Week 2 | Practice'] },
      { text: ['First Name,Last Name,Email', 'Casey,Sample,cs@student.example.edu', 'Week 1,Evidence'], removed: ['First Name,Last Name,Email', 'Casey,Sample,cs@student.example.edu'], kept: ['Week 1,Evidence'] },
      { text: ['First Name\tLast Name\tEmail', 'Casey\tSample\tcs@student.example.edu', 'Week 1\tEvidence'], removed: ['First Name\tLast Name\tEmail', 'Casey\tSample\tcs@student.example.edu'], kept: ['Week 1\tEvidence'] },
      { text: ['Student Name | Email', 'Avery Example | avery@example.edu', 'Week 1 | Evidence'], removed: ['Student Name | Email', 'Avery Example | avery@example.edu'], kept: ['Week 1 | Evidence'] },
      { text: ['Name | Email', 'Avery Example | avery@example.edu', 'Week 1 | Evidence'], removed: ['Name | Email', 'Avery Example | avery@example.edu'], kept: ['Week 1 | Evidence'] },
      { text: ['Name,Email', 'Avery Example,avery@example.edu', 'Week 1,Evidence'], removed: ['Name,Email', 'Avery Example,avery@example.edu'], kept: ['Week 1,Evidence'] },
      { text: ['Name\tEmail', 'Avery Example\tavery@example.edu', 'Week 1\tEvidence'], removed: ['Name\tEmail', 'Avery Example\tavery@example.edu'], kept: ['Week 1\tEvidence'] },
      { text: ['Name | ID', 'Avery Example | ABC', 'First Name | Last Name | Email', 'Casey | Sample | cs@student.example.edu', 'Assignment Name | POINTS', 'Essay | 20'], removed: ['Name | ID', 'Avery Example | ABC', 'First Name | Last Name | Email', 'Casey | Sample | cs@student.example.edu'], kept: ['Assignment Name | POINTS', 'Essay | 20'] },
      { text: ['Name | ID', 'Avery Example | score', 'Score | avery@example.edu', 'Score | 1234567', 'Week 1 | Evidence'], removed: ['Name | ID', 'Avery Example | score', 'Score | avery@example.edu', 'Score | 1234567'], kept: ['Week 1 | Evidence'] },
      { text: ['Name | ID', 'Avery Week | 1234', 'Casey Sample | 2345', 'Week 1 | Evidence'], removed: ['Name | ID', 'Avery Week | 1234', 'Casey Sample | 2345'], kept: ['Week 1 | Evidence'] },
      { text: ['Name,ID', 'Avery Topic,abc', 'Casey Sample,xyz', 'Week 1,Evidence'], removed: ['Name,ID', 'Avery Topic,abc', 'Casey Sample,xyz'], kept: ['Week 1,Evidence'] },
      { text: ['Name\tID', 'Avery Score\tXYZ', 'Casey Sample\tABC', 'Week 1\tEvidence'], removed: ['Name\tID', 'Avery Score\tXYZ', 'Casey Sample\tABC'], kept: ['Week 1\tEvidence'] },
    ];
    for (const [index, probe] of cases.entries()) {
      const ctx = await setup(kind);
      const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text: probe.text.join('\n'), consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
      const saved = session.source.sections.flatMap(section => section.lines).join('\n');
      let prompt = '';
      const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = (input as { sections: { text: string }[] }).sections.map(section => section.text).join('\n'); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
      await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
      for (const line of probe.removed) { expect(saved.split('\n'), `saved case ${index}`).not.toContain(line); expect(prompt.split('\n'), `extract case ${index}`).not.toContain(line); }
      for (const line of probe.kept) { expect(saved.split('\n'), `saved case ${index}`).toContain(line); expect(prompt.split('\n'), `extract case ${index}`).toContain(line); }
    }
  });

  it('removes unseparated assessment rows after rosters but keeps separated and standalone rows', async () => {
    const ctx = await setup(kind);
    const text = ['Name | ID', 'Avery Example | ABC', 'Participation | 10', 'Essay | 20', 'Final Exam | 200', '', 'Participation | 10', 'Essay | 20', 'Final Exam | 200', 'Reading Response | 100', 'Studio Practice | 120', 'Practice Assignment | 1234567'].join('\n');
    const session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', text, consent: { syllabusOnly: true, rememberProfile: false, confirmedNoStudentRoster: true } });
    const saved = session.source.sections.flatMap(section => section.lines);
    let prompt = '';
    const ai = { run: async (task: never, input: never) => { if (task === 'syllabus-extract') prompt = (input as { sections: { text: string }[] }).sections.map(section => section.text).join('\n'); return fixtureAi.run(task, input); } } as ServiceContext['ai'];
    await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
    expect(saved).toEqual(['', 'Participation | 10', 'Essay | 20', 'Final Exam | 200', 'Reading Response | 100', 'Studio Practice | 120', 'Practice Assignment | 1234567']);
    expect(prompt.split('\n')).toEqual(saved);
  });

  it('preserves kept outcomes for token and agent saves while drafting their edits', async () => {
    for (const actorKind of ['token', 'agent'] as const) {
      const ctx = await setup(kind), courseId = 'c-stat110';
      const original = await ctx.repo.listOutcomes(courseId);
      const actor = actorKind === 'token' ? { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] } : { ...ctx, agent: { name: 'Fictional assistant' } };
      const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
      const visible = await service.listOutcomes(student, { courseId });
      const mirror = (await service.getCourseOutline(student, { courseId })).course.outcomes;
      const input = original.map(({ id, text }) => ({ id, text }));
      for (const changed of [[], input.slice(1), [...input].reverse()]) {
        await service.saveOutcomes(actor, { courseId, outcomes: changed });
        expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
        expect((await service.getCourseOutline(student, { courseId })).course.outcomes).toEqual(mirror);
      }
      for (const changed of [[], original.slice(1).map(row => row.text), [...original].reverse().map(row => row.text)]) {
        await service.updateCourse(actor, { courseId, outcomes: changed });
        expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
        expect((await service.getCourseOutline(student, { courseId })).course.outcomes).toEqual(mirror);
      }
      await service.updateCourse(actor, { courseId, outcomes: original.map((row, i) => i ? row.text : 'Edited through fictional course update') });
      expect((await ctx.repo.listOutcomes(courseId)).some(row => row.text === 'Edited through fictional course update' && row.aiState === 'draft')).toBe(true);
      expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
      const edited = await service.saveOutcomes(actor, { courseId, outcomes: input.map((row, i) => i ? row : { ...row, text: 'Changed by fictional assistant' }) });
      const draft = edited.find(row => row.text === 'Changed by fictional assistant')!;
      expect(draft.aiState).toBe('draft');
      expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
      expect((await service.getCourseOutline(student, { courseId })).course.outcomes).toEqual(mirror);
      await service.keepOutcome(ctx, { courseId, outcomeId: draft.id, expectedText: draft.text });
      expect((await service.listOutcomes(student, { courseId })).map(row => row.text)).toContain(draft.text);
    }
  });

  it('leaves kept row codes and positions unchanged when removing interleaved drafts', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const original = await ctx.repo.listOutcomes(courseId);
    const rows = [original[0], { id: `o-interleaved-${kind}`, courseId, code: 'O2', text: 'Fictional interleaved draft', position: 1, aiState: 'draft' as const }, ...original.slice(1).map(row => ({ ...row, position: row.position + 1, code: `O${row.position + 2}` }))];
    await ctx.repo.replaceOutcomes(courseId, rows);
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    const visible = await service.listOutcomes(student, { courseId });
    const token = { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] };
    await service.saveOutcomes(token, { courseId, outcomes: [] });
    expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
    expect((await ctx.repo.listOutcomes(courseId)).some(row => row.aiState === 'draft')).toBe(false);
  });

  it('does not overwrite a person’s concurrent outcome edit during an assistant save', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const original = await ctx.repo.listOutcomes(courseId);
    const replacement = ctx.repo.replaceOutcomesIfUnchanged.bind(ctx.repo);
    ctx.repo.replaceOutcomesIfUnchanged = async (id, expected, rows) => {
      ctx.repo.replaceOutcomesIfUnchanged = replacement;
      await service.saveOutcomes(ctx, { courseId, outcomes: original.map((item, index) => ({ id: item.id, text: index ? item.text : 'Person’s fictional revision' })) });
      return replacement(id, expected, rows);
    };
    const token = { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] };
    try {
      await expect(service.saveOutcomes(token, { courseId, outcomes: [...original.map(({ id, text }) => ({ id, text })), { text: 'Fictional draft addition' }] })).rejects.toMatchObject({ code: 'conflict' });
      expect((await ctx.repo.listOutcomes(courseId))[0].text).toBe('Person’s fictional revision');
      expect((await ctx.repo.listOutcomes(courseId)).some(item => item.text === 'Fictional draft addition')).toBe(false);
    } finally { ctx.repo.replaceOutcomesIfUnchanged = replacement; }
  });

  it('conflicts one of two concurrent token outcome saves without losing the winner', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const token = { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] };
    const original = await ctx.repo.listOutcomes(courseId);
    const list = ctx.repo.listOutcomes.bind(ctx.repo);
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    ctx.repo.listOutcomes = async id => {
      const snapshot = await list(id);
      if (id === courseId && ++reads <= 2) { if (reads === 2) release(); await gate; }
      return snapshot;
    };
    try {
      const results = await Promise.allSettled(['First fictional draft', 'Second fictional draft'].map(text => service.saveOutcomes(token, { courseId, outcomes: [...original.map(({ id, text }) => ({ id, text })), { text }] })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('conflict');
      const rows = await list(courseId);
      expect(rows.filter(row => row.aiState === 'draft')).toHaveLength(1);
      expect(rows.at(-1)?.text).toBe((results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.saveOutcomes>>>).value.at(-1)?.text);
    } finally { ctx.repo.listOutcomes = list; }
  });

  it('conflicts a stale course update before changing outcomes or details', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const original = await ctx.repo.listOutcomes(courseId);
    const list = ctx.repo.listOutcomes.bind(ctx.repo);
    let resume!: () => void, entered!: () => void, pausedOnce = false;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    ctx.repo.listOutcomes = async id => {
      if (id === courseId && !pausedOnce) { pausedOnce = true; entered(); await gate; }
      return list(id);
    };
    try {
      const pending = service.updateCourse(ctx, { courseId, title: 'Fictional title A', outcomes: original.map((row, index) => index ? row.text : 'Fictional outcome A') });
      await paused;
      await service.updateCourse(ctx, { courseId, title: 'Fictional title B', outcomes: original.map((row, index) => index ? row.text : 'Fictional outcome B') });
      resume();
      await expect(pending).rejects.toMatchObject({ code: 'conflict' });
      expect((await ctx.repo.getCourse(courseId))?.title).toBe('Fictional title B');
      expect((await ctx.repo.listOutcomes(courseId))[0].text).toBe('Fictional outcome B');
      expect((await ctx.repo.getCourse(courseId))?.outcomes[0]).toBe('Fictional outcome B');
    } finally { ctx.repo.listOutcomes = list; resume(); }
  });

  it('leaves details unchanged if outcomes change after the update reads them', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const original = await ctx.repo.listOutcomes(courseId);
    const before = (await ctx.repo.getCourse(courseId))!;
    const write = ctx.repo.updateCourseAndOutcomesIfUnchanged.bind(ctx.repo);
    ctx.repo.updateCourseAndOutcomesIfUnchanged = async (course, expected, old, rows) => {
      ctx.repo.updateCourseAndOutcomesIfUnchanged = write;
      await service.saveOutcomes(ctx, { courseId, outcomes: original.map((row, index) => ({ id: row.id, text: index ? row.text : 'Fictional concurrent outcome' })) });
      return write(course, expected, old, rows);
    };
    try {
      await expect(service.updateCourse(ctx, { courseId, title: 'Stale fictional title', outcomes: original.map(row => row.text) })).rejects.toMatchObject({ code: 'conflict' });
      expect((await ctx.repo.getCourse(courseId))?.title).toBe(before.title);
      expect((await ctx.repo.listOutcomes(courseId))[0].text).toBe('Fictional concurrent outcome');
    } finally { ctx.repo.updateCourseAndOutcomesIfUnchanged = write; }
  });

  it('keeps token and agent outcome additions as drafts until a person keeps one', async () => {
    const ctx = await setup(kind);
    const courseId = 'c-stat110';
    const original = await ctx.repo.listOutcomes(courseId);
    const old = original.map(({ id, text }) => ({ id, text }));
    const token = { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] };
    const agent = { ...ctx, agent: { name: 'Fictional assistant' } };
    const tokenRows = await service.saveOutcomes(token, { courseId, outcomes: [...old, { text: 'Explain fictional evidence.' }] });
    const tokenDraft = tokenRows.at(-1)!;
    expect(tokenDraft.aiState).toBe('draft');
    const agentRows = await service.saveOutcomes(agent, { courseId, outcomes: [...tokenRows.map(({ id, text }) => ({ id, text })), { text: 'Compare fictional methods.' }] });
    const agentDraft = agentRows.at(-1)!;
    expect(agentDraft.aiState).toBe('draft');
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    for (const draft of [tokenDraft, agentDraft]) {
      expect((await ctx.repo.listOutcomes(courseId)).find(row => row.id === draft.id)?.aiState).toBe('draft');
      expect((await service.getCourseOutline(student, { courseId })).course.outcomes).not.toContain(draft.text);
      expect((await service.listOutcomes(student, { courseId })).some(row => row.id === draft.id)).toBe(false);
    }
    await expect(service.keepOutcome(token, { courseId, outcomeId: tokenDraft.id, expectedText: tokenDraft.text })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.keepOutcome(agent, { courseId, outcomeId: tokenDraft.id, expectedText: tokenDraft.text })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await service.keepOutcome(ctx, { courseId, outcomeId: tokenDraft.id, expectedText: tokenDraft.text })).aiState).toBeUndefined();
    await expect(service.keepOutcome(ctx, { courseId, outcomeId: tokenDraft.id, expectedText: tokenDraft.text })).rejects.toMatchObject({ code: 'conflict' });
    expect((await service.getCourseOutline(student, { courseId })).course.outcomes).toContain(tokenDraft.text);
    expect((await service.listOutcomes(student, { courseId })).some(row => row.id === tokenDraft.id)).toBe(true);
    await expect(service.keepOutcome(ctx, { courseId: 'c-comm120', outcomeId: agentDraft.id, expectedText: agentDraft.text })).rejects.toMatchObject({ code: expect.stringMatching(/not-found|forbidden/) });
    const personRows = await service.saveOutcomes(ctx, { courseId, outcomes: [...agentRows.map(({ id, text }) => ({ id, text })), { text: 'Describe fictional examples.' }] });
    const personOutcome = personRows.at(-1)!;
    expect(personOutcome.aiState).toBeUndefined();
    expect((await service.getCourseOutline(student, { courseId })).course.outcomes).toContain(personOutcome.text);
    expect((await service.listOutcomes(student, { courseId })).some(row => row.id === personOutcome.id)).toBe(true);
    expect(ROUTES.keepOutcome).toMatchObject({ method: 'POST', path: '/courses/:courseId/outcomes/:outcomeId/keep', scope: 'courses:write' });
  });

  it('retains agent outcome provenance through Keep and clears it on a person edit', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const actor = { ...ctx, token: { id: 'token-fictional', name: 'Fictional course assistant' } as ServiceContext['token'] };
    const original = await ctx.repo.listOutcomes(courseId);
    const added = await service.saveOutcomes(actor, { courseId, outcomes: [...original.map(({ id, text }) => ({ id, text })), { text: 'Compare fictional strategies.' }] });
    const draft = added.at(-1)!;
    expect(draft).toMatchObject({ aiState: 'draft', provenance: { task: 'agent', model: 'Assistant via API token (Fictional course assistant)' } });
    const stale = await ctx.repo.listOutcomes(courseId);
    const kept = await service.keepOutcome(ctx, { courseId, outcomeId: draft.id, expectedText: draft.text });
    expect(kept.provenance).toMatchObject({ model: draft.provenance!.model, keptBy: ctx.user!.name, keptAt: at });
    expect((await service.listOutcomes({ ...ctx, user: await ctx.repo.getUser('u-priya') }, { courseId })).find(row => row.id === draft.id)).not.toHaveProperty('provenance');
    expect(await ctx.repo.replaceOutcomesIfUnchanged(courseId, stale, stale)).toBe(false);
    const current = await ctx.repo.listOutcomes(courseId);
    const edited = await service.saveOutcomes(ctx, { courseId, outcomes: current.map(row => ({ id: row.id, text: row.id === draft.id ? 'Evaluate fictional strategies.' : row.text })) });
    expect(edited.find(row => row.id === draft.id)?.provenance).toBeUndefined();
    const changed = await service.updateCourse(actor, { courseId, outcomes: [...edited.map(row => row.text), 'Explain fictional methods.'] });
    expect(changed.outcomes).not.toContain('Explain fictional methods.');
    expect((await ctx.repo.listOutcomes(courseId)).find(row => row.text === 'Explain fictional methods.')).toMatchObject({ aiState: 'draft', provenance: { model: 'Assistant via API token (Fictional course assistant)' } });
  });

  it('keeps only the displayed version of an ordinary outcome draft', async () => {
    const ctx = await setup(kind), courseId = 'c-stat110';
    const token = { ...ctx, token: { id: 'token-probe' } as ServiceContext['token'] };
    const student = { ...ctx, user: await ctx.repo.getUser('u-priya') };
    const original = await ctx.repo.listOutcomes(courseId);
    const first = await service.saveOutcomes(token, { courseId, outcomes: [...original.map(({ id, text }) => ({ id, text })), { text: 'Fictional draft A' }] });
    const draft = first.at(-1)!;
    await service.saveOutcomes(token, { courseId, outcomes: first.map(row => ({ id: row.id, text: row.id === draft.id ? 'Fictional draft B' : row.text })) });
    const visible = await service.listOutcomes(student, { courseId });
    await expect(service.keepOutcome(ctx, { courseId, outcomeId: draft.id, expectedText: 'Fictional draft A' })).rejects.toMatchObject({ code: 'conflict', message: 'This draft changed since you opened it. Review the new wording, then keep it.' });
    expect(await service.listOutcomes(student, { courseId })).toEqual(visible);
    expect((await service.keepOutcome(ctx, { courseId, outcomeId: draft.id, expectedText: 'Fictional draft B' })).text).toBe('Fictional draft B');
    expect((await service.listOutcomes(student, { courseId })).map(row => row.text)).toContain('Fictional draft B');
  });

  it('imports token outcomes as drafts without a learner-visible initial course mirror', async () => {
    const ctx = await setup(kind);
    const admin = { ...ctx, user: await ctx.repo.getUser('u-admin'), token: { id: 'token-probe', scopes: ['courses:write'] } as ServiceContext['token'] };
    const imported = await service.importCourse(admin, { course: { code: 'ART 110', title: 'Fictional art basics', term: 'Fall 2026', outcomes: ['Compare fictional art methods.'] }, modules: [] });
    expect(imported.course.outcomes).toEqual([]);
    expect((await ctx.repo.listOutcomes(imported.course.id))[0]).toMatchObject({ aiState: 'draft', provenance: { task: 'agent', model: expect.stringContaining('token-probe') } });
    expect((await ctx.repo.getCourse(imported.course.id))!.outcomes).toEqual([]);
  });

  it('rejects unparseable profile answers and nonpositive meetings without persisting', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const original = await ctx.repo.getDesignSession(session.id);
    for (const correction of ['many', '0 credits']) {
      await expect(service.contestDesignField(ctx, { sessionId: session.id, field: 'credits', correction })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('6 credits') });
      expect(await ctx.repo.getDesignSession(session.id)).toEqual(original);
    }
    for (const correction of ['Tue/Thu, -15 minutes', '-1.5 hours', 'Tue/Thu, −15 minutes', 'Tue/Thu, –15 minutes', 'Tue/Thu, 0.5 minutes', '.5 minutes', '−.5 hours', '-.5 hours', '–.5 hours']) {
      await expect(service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('Tue/Thu') });
      expect(await ctx.repo.getDesignSession(session.id)).toEqual(original);
    }
    const contested = await service.contestDesignField(ctx, { sessionId: session.id, field: 'credits', correction: '6 credits' });
    const before = await ctx.repo.getDesignSession(session.id);
    for (const answer of ['many', '0 credits']) {
      await expect(service.answerDesignQuestions(ctx, { sessionId: session.id, answers: [{ questionId: 'question-contest-credits', value: answer, skipped: false }], teachingNote: '' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('6 credits') });
      expect(await ctx.repo.getDesignSession(session.id)).toEqual(before);
    }
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: 'Tue/Thu, 75 min' });
    const beforeMeeting = await ctx.repo.getDesignSession(session.id);
    for (const answer of ['Tue/Thu, -15 minutes', '-1.5 hours', 'Tue/Thu, −15 minutes', 'Tue/Thu, –15 minutes', 'Tue/Thu, 0.5 minutes', '.5 minutes', '−.5 hours', '-.5 hours', '–.5 hours']) {
      await expect(service.answerDesignQuestions(ctx, { sessionId: session.id, answers: [{ questionId: 'question-contest-meeting', value: answer, skipped: false }], teachingNote: '' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('Tue/Thu') });
      expect(await ctx.repo.getDesignSession(session.id)).toEqual(beforeMeeting);
    }
    await service.answerDesignQuestions(ctx, { sessionId: session.id, answers: [{ questionId: 'question-contest-meeting', value: 'Tue/Thu, 1.5 hours', skipped: false }], teachingNote: '' });
    expect((await ctx.repo.getDesignSession(session.id))?.questions.find(question => question.id === 'question-contest-meeting')?.answer?.value).toBe('Tue/Thu, 1.5 hours');
    expect((await ctx.repo.getDesignSession(session.id))?.effectiveProfile?.meeting.value?.minutes).toBe(90);
    expect(contested.questions.some(question => question.id === 'question-contest-credits')).toBe(true);
  });

  it('logs only allowlisted fields for an upstream HTTP error containing syllabus text', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: session.extraction!.outcomes.map((item, i) => ({ code: `O${i + 1}`, text: item.text, originalText: item.text })) });
    const marker = 'PRIVATE-SYLLABUS-CONTENT-PROBE Dr. Fictional';
    const ai = palmyraClient({ apiKey: 'local', url: 'https://example.test', fetchImpl: async () => new Response(marker, { status: 400 }) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await service.advanceDesignSession({ ...ctx, ai }, { sessionId: session.id });
      expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
      expect(log).toHaveBeenCalledWith('AI task failed', { task: 'structure-options', status: 400, category: 'ai-failed', sessionId: session.id, jobId: expect.any(String) });
    } finally { log.mockRestore(); }
  });

  it('does not log upstream 400 bodies for announcement or builder AI tasks', async () => {
    const ctx = await setup(kind);
    const marker = 'PRIVATE-FICTIONAL-UPSTREAM-BODY-PROBE';
    const ai = palmyraClient({ apiKey: 'local', url: 'https://example.test', fetchImpl: async () => new Response(marker, { status: 400 }) });
    const failed = { ...ctx, ai };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(service.draftAnnouncement(failed, { courseId: 'c-stat110', prompt: 'Fictional update' })).rejects.toMatchObject({ code: 'ai-failed' });
      await expect(service.createBuilderSession(failed, { courseId: 'c-stat110', prompt: 'Fictional course', sources: [] })).rejects.toMatchObject({ code: 'ai-failed' });
      const session = await service.createBuilderSession(ctx, { courseId: 'c-stat110', prompt: 'Fictional course', sources: [] });
      await expect(service.generateOutline(failed, { sessionId: session.id })).rejects.toMatchObject({ code: 'ai-failed' });
      await service.generateOutline(ctx, { sessionId: session.id });
      await expect(service.generateDrafts(failed, { sessionId: session.id })).rejects.toMatchObject({ code: 'ai-failed' });
      expect(JSON.stringify([log.mock.calls, warn.mock.calls, info.mock.calls])).not.toContain(marker);
      expect(log.mock.calls.map(call => (call[1] as { task?: string }).task)).toEqual(expect.arrayContaining(['announcement', 'brief', 'outline', 'lesson-draft']));
    } finally { log.mockRestore(); warn.mockRestore(); info.mockRestore(); }
  });

  it('does not save stale options after a failed job is retried during completion', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes: session.extraction!.outcomes.map((item, index) => ({ code: `O${index + 1}`, text: item.text, originalText: item.text })) });
    const originalJobId = (await ctx.repo.getDesignSession(session.id))!.provisioning!.jobId;
    const save = ctx.repo.saveDesignOptions.bind(ctx.repo);
    let entered!: () => void, release!: () => void;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    ctx.repo.saveDesignOptions = async (id, jobId, value) => { entered(); await gate; return save(id, jobId, value); };
    try {
      const advancing = service.advanceDesignSession(ctx, { sessionId: session.id });
      await paused;
      expect(await ctx.repo.stopDesignJob(session.id, originalJobId, 'Fictional retry probe')).toBe(true);
      await service.retryDesignOptions(ctx, { sessionId: session.id });
      const replacement = (await ctx.repo.getDesignSession(session.id))!.provisioning!.jobId;
      expect(replacement).not.toBe(originalJobId);
      release(); await advancing;
      expect((await ctx.repo.getDesignSession(session.id))!.provisioning!.jobId).toBe(replacement);
      expect((await ctx.repo.getDesignSession(session.id))!.options).toBeNull();
      expect((await ctx.repo.getGenerationJob(originalJobId))!.state).toBe('failed');
    } finally { release(); ctx.repo.saveDesignOptions = save; }
  });

  it('keeps an upstream block regeneration error body out of logs', async () => {
    const ctx = await setup(kind);
    const marker = 'FICTIONAL-UPSTREAM-BODY-PROBE';
    const ai = palmyraClient({ apiKey: 'local', url: 'https://example.test', fetchImpl: async () => new Response(marker, { status: 400 }) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(service.regenerateBlock({ ...ctx, ai }, { blockId: 'b-s1-1', instruction: 'Draft a fictional example.' })).rejects.toMatchObject({ code: 'ai-failed' });
      expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
      expect(log).toHaveBeenCalledWith('content AI failed', { task: 'block-regenerate', category: 'ai-failed', status: 400, blockId: 'b-s1-1' });
    } finally { log.mockRestore(); }
  });

  it('uses accepted typed corrections for budget, options, and plan while preserving extraction', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'credits', correction: '6 credits' });
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'termWeeks', correction: '16 weeks' });
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: 'Tue/Thu, 1 hour 15 minutes' });
    expect((await ctx.repo.getDesignSession(session.id))!.effectiveProfile?.meeting.value).toEqual({ days: ['Tuesday', 'Thursday'], minutes: 75 });
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: '75 min' });
    expect((await ctx.repo.getDesignSession(session.id))!.effectiveProfile?.meeting.value?.minutes).toBe(75);
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: '1.5 hours' });
    expect((await ctx.repo.getDesignSession(session.id))!.effectiveProfile?.meeting.value?.minutes).toBe(90);
    await service.contestDesignField(ctx, { sessionId: session.id, field: 'meeting', correction: 'Monday Wednesday 75 minutes' });
    const changed = await service.contestDesignField(ctx, { sessionId: session.id, field: 'modality', correction: 'hybrid' });
    expect(changed.extraction!.profile.credits.value).toBe(3);
    expect(changed.effectiveProfile).toMatchObject({ credits: { value: 6 }, termWeeks: { value: 16 }, meeting: { value: { days: ['Monday', 'Wednesday'], minutes: 75 } }, modality: { value: 'hybrid' }, weeklyHoursBudget: 18 });
    expect(changed.read!.workload.weeklyBudgetHours).toBe(18);
    let input: unknown;
    const ai = { run: async (task: never, value: never) => { if (task === 'structure-options') input = value; return fixtureAi.run(task, value); } } as ServiceContext['ai'];
    await options({ ...ctx, ai }, changed);
    expect(input).toMatchObject({ profile: { credits: { value: 6 }, termWeeks: { value: 16 }, modality: { value: 'hybrid' } }, weeks: 16 });
  });

  it('rejects unparseable typed corrections without changing the read', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const before = await ctx.repo.getDesignSession(session.id);
    for (const [field, correction] of [['credits', 'many'], ['termWeeks', 'several'], ['meeting', 'whenever'], ['modality', 'maybe']] as const) {
      await expect(service.contestDesignField(ctx, { sessionId: session.id, field, correction })).rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/such as/) });
      expect(await ctx.repo.getDesignSession(session.id)).toEqual(before);
    }
  });

  it('preserves every project week and reading and avoids a break-week deadline', async () => {
    const ctx = await setup(kind);
    const session = await read(ctx);
    const weekQuestion = session.questions.find(item => item.weekIds?.includes(8))!;
    expect(weekQuestion).toBeDefined();
    await service.answerDesignQuestions(ctx, { sessionId: session.id, answers: [{ questionId: weekQuestion.id, optionId: 'break', skipped: false }], teachingNote: '' });
    const shown = await options(ctx, (await ctx.repo.getDesignSession(session.id))!);
    const project = shown.options!.find(option => option.id === 'project')!;
    expect(project).toBeDefined();
    await service.selectApproach(ctx, { sessionId: session.id, optionIds: ['project'], overlays: ['bookends'], rationale: 'Projects fit this syllabus and its milestones.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: session.id });
    const projectWeeks = new Set(project.modules.flatMap(module => module.weeks));
    const covered = new Set(plan.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.weeks ?? (lesson.week === null ? [] : [lesson.week]))));
    expect([...projectWeeks].filter(week => !covered.has(week))).toEqual([]);
    for (const row of shown.extraction!.schedule.filter(row => row.reading && projectWeeks.has(row.week))) {
      expect(plan.readings.some(reading => reading.week === row.week && reading.title === row.reading)).toBe(true);
    }
    for (const row of shown.extraction!.schedule.filter(row => row.topic && projectWeeks.has(row.week) && !row.empty)) {
      expect(plan.modules.some(module => module.lessons.some(lesson => (lesson.weeks ?? []).some(week => coveredWeeks(row).includes(week)) && lesson.title.includes(row.topic.trim())))).toBe(true);
    }
    const start = Date.parse(shown.effectiveProfile?.termStart.value ?? shown.extraction!.profile.termStart.value!);
    for (const due of plan.modules.flatMap(module => module.assignments ?? []).flatMap(item => item.dueAt ? [item.dueAt] : [])) {
      expect(Math.floor((Date.parse(due) - start) / 604800000) + 1).not.toBe(8);
    }
  });

  it('excludes every week covered by a grouped break from project deadlines', async () => {
    const ctx = await setup(kind);
    const readSession = await read(ctx);
    const shown = await options(ctx, readSession);
    const project = shown.options!.find(option => option.id === 'project')!;
    const module = project.modules.find(item => item.weeks.some(week => week >= 7 && week <= 10))!;
    module.weeks = [7, 8, 9, 10];
    expect(module.weeks).toEqual([7, 8, 9, 10]);
    shown.extraction!.schedule.push({ week: 8, dates: 'Weeks 8-9', topic: 'Fall break', reading: '', due: '', span: null, empty: false });
    const start = Date.parse(shown.effectiveProfile?.termStart.value ?? shown.extraction!.profile.termStart.value!);
    const week9 = new Date(start + 8 * 604800000).toISOString().slice(0, 10);
    shown.extraction!.assessments.push({ id: 'grouped-break-assessment', title: 'Fictional project milestone', weightPercent: 10, dueAt: week9, format: 'project', span: null });
    await ctx.repo.putDesignSession(shown);
    await service.selectApproach(ctx, { sessionId: shown.id, optionIds: ['project'], overlays: ['bookends'], rationale: 'Projects fit this fictional course.' });
    const plan = await service.previewProvisionPlan(ctx, { sessionId: shown.id });
    expect(plan.modules.flatMap(item => item.assignments ?? []).some(item => item.title === 'Fictional project milestone')).toBe(true);
    const dueWeeks = plan.modules.flatMap(item => item.assignments ?? []).flatMap(item => item.dueAt ? [Math.floor((Date.parse(item.dueAt) - start) / 604800000) + 1] : []);
    expect(dueWeeks.some(week => week === 8 || week === 9)).toBe(false);
  });
});
