import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import type { CourseTemplate, TemplateModule } from '../domain';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

let sequence = 0;
async function context(repo: MemoryRepo, id = 'u-admin'): Promise<ServiceContext> {
  return { repo, ai: fixtureAi, user: await repo.getUser(id), now: () => SEED_NOW, newId: prefix => `${prefix}-template-${++sequence}` };
}
const modules: TemplateModule[] = [
  { key: 'start', title: 'Start here', placement: 'start', objective: 'Find course essentials.', lessons: [
    { key: 'overview', title: 'Course overview', minutes: 10, blocks: [{ key: 'welcome', label: 'Welcome', content: { type: 'text', text: 'Welcome to the course.' } }] },
    { key: 'help', title: 'Get help', minutes: 5, blocks: [{ key: 'contact', label: 'Contact', content: { type: 'callout', tone: 'info', title: 'Contact', text: 'Visit office hours.' } }] },
  ] },
  { key: 'wrap', title: 'Wrap up', placement: 'end', objective: '', lessons: [] },
];
const input = () => ({ name: 'Meridian standard', description: 'Required structure', owner: { kind: 'institution' as const }, modules: structuredClone(modules), tutorDefaults: { lesson: 'hints' as const, assignment: 'hints' as const }, accessFloor: 85 });

async function setup(repo: MemoryRepo) {
  const admin = await context(repo);
  const template = await dispatch(service, admin, 'createTemplate', input());
  const program = await dispatch(service, admin, 'createProgram', { name: 'Public policy', description: '', templateId: template.id, brand: { accent: 'blue', logo: null } });
  return { admin, template, program };
}

describe('programs and templates service', () => {
  it('creates, sorts, edits, assigns, and deletes programs while enforcing references and brand', async () => {
    const repo = new MemoryRepo(seedData()); const { admin, template, program } = await setup(repo);
    await dispatch(service, admin, 'createProgram', { name: 'Arts' });
    expect((await dispatch(service, admin, 'listPrograms', undefined)).map(p => p.name)).toEqual(['Arts', 'Public policy']);
    await expect(dispatch(service, admin, 'createProgram', { name: 'Bad', templateId: 'missing' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(dispatch(service, admin, 'createProgram', { name: 'Bad', brand: { accent: 'blue', logo: { fileId: 'f', alt: 'Logo' } } })).rejects.toMatchObject({ code: 'invalid', message: "Logos aren't supported yet." });
    await expect(dispatch(service, admin, 'createProgram', { name: 'Bad', brand: { accent: 'purple' as 'blue', logo: null } })).rejects.toMatchObject({ code: 'invalid' });
    expect((await dispatch(service, admin, 'updateProgram', { programId: program.id, name: 'Policy', templateId: null })).templateId).toBeNull();
    await expect(dispatch(service, admin, 'updateProgram', { programId: program.id, templateId: 'missing' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(dispatch(service, admin, 'setCourseProgram', { courseId: 'c-stat110', programId: 'missing' })).rejects.toMatchObject({ code: 'invalid' });
    expect((await dispatch(service, admin, 'setCourseProgram', { courseId: 'c-stat110', programId: program.id })).programId).toBe(program.id);
    await expect(dispatch(service, admin, 'deleteProgram', { programId: program.id })).rejects.toMatchObject({ code: 'conflict' });
    await dispatch(service, admin, 'setCourseProgram', { courseId: 'c-stat110', programId: null });
    expect(await dispatch(service, admin, 'deleteProgram', { programId: program.id })).toEqual({ ok: true });
    expect((await dispatch(service, admin, 'getTemplate', { templateId: template.id })).id).toBe(template.id);
  });

  it('validates templates, tracks updates, and protects active references', async () => {
    const repo = new MemoryRepo(seedData()); const { admin, template, program } = await setup(repo);
    const badKeys = input(); badKeys.modules[1].key = 'start';
    await expect(dispatch(service, admin, 'createTemplate', badKeys)).rejects.toMatchObject({ code: 'invalid', message: 'Two modules use the key "start".' });
    await expect(dispatch(service, admin, 'createTemplate', { ...input(), owner: { kind: 'program', programId: 'missing' } })).rejects.toMatchObject({ code: 'invalid' });
    await expect(dispatch(service, admin, 'createTemplate', { ...input(), modules: [{ ...modules[0], lessons: [{ ...modules[0].lessons[0], blocks: [{ key: 'bad', label: 'Bad', content: { type: 'text', text: '' } }] }] }] })).rejects.toMatchObject({ code: 'invalid' });
    const inst = await repo.getInstitution(); inst.accessPolicy.minimumScore = 75; await repo.putInstitution(inst);
    await expect(dispatch(service, admin, 'updateTemplate', { templateId: template.id, accessFloor: 70 })).rejects.toMatchObject({ code: 'invalid' });
    const updated = await dispatch(service, admin, 'updateTemplate', { templateId: template.id, name: 'Updated' });
    expect(updated).toMatchObject({ description: 'Required structure', updatedBy: 'u-admin' });
    expect(updated.updatedAt > template.updatedAt).toBe(true);
    expect((await dispatch(service, admin, 'listTemplates', undefined)).map(t => t.name)).toContain('Updated');
    await expect(dispatch(service, admin, 'deleteTemplate', { templateId: template.id })).rejects.toMatchObject({ code: 'conflict' });
    await dispatch(service, admin, 'updateProgram', { programId: program.id, templateId: null });
    await dispatch(service, admin, 'setInstitutionTemplate', { templateId: template.id });
    await expect(dispatch(service, admin, 'deleteTemplate', { templateId: template.id })).rejects.toMatchObject({ code: 'conflict' });
    await expect(dispatch(service, admin, 'setInstitutionTemplate', { templateId: 'missing' })).rejects.toMatchObject({ code: 'invalid' });
    await dispatch(service, admin, 'setInstitutionTemplate', { templateId: null });
    expect(await dispatch(service, admin, 'deleteTemplate', { templateId: template.id })).toEqual({ ok: true });
  });

  it('previews only missing items, rejects a stale hash, writes the plan and preserves existing content', async () => {
    const repo = new MemoryRepo(seedData()); const { admin, template } = await setup(repo);
    await dispatch(service, admin, 'setInstitutionTemplate', { templateId: template.id });
    const c = (await repo.getCourse('c-stat110'))!;
    const existing = (await repo.listModules(c.id))[0]; await repo.putModule({ ...existing, templateKey: 'start' });
    const lesson = { ...(await repo.listLessons({ courseId: c.id }))[0], templateKey: 'overview' }; await repo.putLesson(lesson);
    const beforeModules = await repo.listModules(c.id), beforeLessons = await repo.listLessons({ courseId: c.id });
    const beforeBlocks = await Promise.all(beforeLessons.map(l => repo.listBlocks(l.id)));
    const preview = await dispatch(service, admin, 'previewTemplate', { courseId: c.id });
    expect(preview.addModules.map(m => m.key)).toEqual(['wrap']);
    expect(preview.addLessons.map(l => l.key)).toEqual(['help']);
    expect(preview.addBlocks.map(b => b.key)).toEqual(['overview/welcome', 'help/contact']);
    await repo.putLesson({ ...lesson, templateKey: null });
    await expect(dispatch(service, admin, 'applyTemplate', { courseId: c.id, hash: preview.hash })).rejects.toMatchObject({ code: 'conflict' });
    await repo.putLesson(lesson);
    const outline = await dispatch(service, admin, 'applyTemplate', { courseId: c.id, hash: preview.hash });
    expect(outline.modules.flatMap(m => m.lessons).some(l => l.templateKey === 'help')).toBe(true);
    const afterModules = await repo.listModules(c.id), afterLessons = await repo.listLessons({ courseId: c.id });
    for (const m of beforeModules) {
      const after = afterModules.find(x => x.id === m.id)!;
      expect({ ...after, position: m.position }).toEqual(m);
    }
    for (const l of beforeLessons) expect(afterLessons.find(x => x.id === l.id)).toEqual(l);
    for (let i = 0; i < beforeLessons.length; i++) {
      const after = await repo.listBlocks(beforeLessons[i].id);
      for (const b of beforeBlocks[i]) expect(after.find(x => x.id === b.id)).toEqual(b);
    }
    expect((await dispatch(service, admin, 'previewTemplate', { courseId: c.id })).addLessons).toHaveLength(0);
    expect((await repo.listModules(c.id)).filter(m => m.templateKey === 'wrap')).toHaveLength(1);
  });

  it('sets tutor defaults only where unset and allowed, with instructor course authorization', async () => {
    const repo = new MemoryRepo(seedData()); const { admin, template } = await setup(repo);
    await dispatch(service, admin, 'setInstitutionTemplate', { templateId: template.id });
    const teacher = await context(repo, 'u-okafor'), outsider = await context(repo, 'u-chen');
    await expect(dispatch(service, outsider, 'previewTemplate', { courseId: 'c-stat110' })).rejects.toMatchObject({ code: 'forbidden' });
    const preview = await dispatch(service, teacher, 'previewTemplate', { courseId: 'c-stat110' });
    await expect(dispatch(service, outsider, 'applyTemplate', { courseId: 'c-stat110', hash: preview.hash })).rejects.toMatchObject({ code: 'forbidden' });
    const existingLesson = (await repo.listLessons({ courseId: 'c-stat110' }))[0];
    await repo.putTutorSetting({ activityKind: 'lesson', activityId: existingLesson.id, mode: 'off', maxHints: 1, allowedSourceIds: [], setBy: 'u-okafor', setAt: SEED_NOW });
    const changed = await dispatch(service, admin, 'updateTemplate', { templateId: template.id, tutorDefaults: { lesson: 'hints', assignment: 'open' } });
    await expect(dispatch(service, teacher, 'applyTemplate', { courseId: 'c-stat110', hash: preview.hash })).rejects.toMatchObject({ code: 'conflict' });
    const current = await dispatch(service, teacher, 'previewTemplate', { courseId: 'c-stat110' });
    await dispatch(service, teacher, 'applyTemplate', { courseId: 'c-stat110', hash: current.hash });
    expect((await repo.getTutorSetting('lesson', existingLesson.id))?.mode).toBe('off');
    const newLesson = (await repo.listLessons({ courseId: 'c-stat110' })).find(l => l.templateKey === 'help')!;
    expect((await repo.getTutorSetting('lesson', newLesson.id))?.mode).toBe('hints');
    expect(await repo.getTutorSetting('assignment', 'asg-stat-1')).toBeNull();
    expect(changed.tutorDefaults.assignment).toBe('open');
    await dispatch(service, admin, 'updateTemplate', { templateId: template.id, tutorDefaults: { lesson: 'hints', assignment: 'hints' } });
    const allowedPreview = await dispatch(service, teacher, 'previewTemplate', { courseId: 'c-stat110' });
    await dispatch(service, teacher, 'applyTemplate', { courseId: 'c-stat110', hash: allowedPreview.hash });
    expect((await repo.getTutorSetting('assignment', 'asg-stat-1'))?.mode).toBe('hints');
  });

  it('gives an instructor-created course its template skeleton and only its creator as instructor', async () => {
    const repo = new MemoryRepo(seedData()); const { program } = await setup(repo); const teacher = await context(repo, 'u-okafor');
    const c = await dispatch(service, teacher, 'createCourse', { code: 'PP 101', title: 'Public Policy', term: 'Fall 2026', programId: program.id });
    expect(c).toMatchObject({ programId: program.id, instructorIds: ['u-okafor'] });
    expect((await repo.listModules(c.id)).map(m => m.templateKey)).toEqual(['start', 'wrap']);
    expect((await repo.listLessons({ courseId: c.id })).map(l => l.templateKey)).toEqual(['overview', 'help']);
    const skip = await dispatch(service, teacher, 'createCourse', { code: 'PP 102', title: 'Other', term: 'Fall 2026', programId: program.id, skipTemplate: true });
    expect(await repo.listModules(skip.id)).toHaveLength(0);
  });

  it('uses the effective template accessibility floor at publish', async () => {
    const repo = new MemoryRepo(seedData()); const { admin, template } = await setup(repo);
    const inst = await repo.getInstitution(); inst.accessPolicy = { minimumScore: 75, blockingSeverities: ['critical'] }; await repo.putInstitution(inst);
    await dispatch(service, admin, 'setInstitutionTemplate', { templateId: template.id });
    const teacher = await context(repo, 'u-okafor');
    const lesson = await dispatch(service, teacher, 'createLesson', { moduleId: 'm-stat-1', title: 'Resources' });
    await dispatch(service, teacher, 'saveBlocks', { lessonId: lesson.id, blocks: [{ type: 'text', text: 'Read the guide.' }, { type: 'link', href: 'https://example.edu/guide', text: 'click here', description: '' }, { type: 'link', href: 'https://example.edu/help', text: 'read more', description: '' }] });
    await expect(dispatch(service, teacher, 'publishLesson', { lessonId: lesson.id })).rejects.toMatchObject({ code: 'not-ready', message: expect.stringContaining('your course template requires at least 85') });
  });
});
