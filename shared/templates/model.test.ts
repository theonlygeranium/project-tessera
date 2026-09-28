import { describe, expect, it } from 'vitest';
import type { Block, CourseTemplate, Lesson, Module } from '../domain';
import { effectiveTemplateId, templateChangeSet, templateDeviations, templatePlan, validateTemplate, type CourseStructure } from './model';

const NOW = '2026-09-27T12:00:00.000Z';
const template: CourseTemplate = {
  id: 't1', name: 'Meridian standard', description: '', owner: { kind: 'institution' }, accessFloor: 80, updatedBy: 'u-admin', updatedAt: NOW,
  tutorDefaults: { lesson: 'hints', assignment: 'hints' },
  modules: [
    {
      key: 'start', title: 'Start here', placement: 'start', objective: 'Find your way around.',
      lessons: [
        { key: 'overview', title: 'Course overview', minutes: 10, blocks: [{ key: 'how', label: 'How the course works', content: { type: 'text', text: 'Each week…' } }] },
        { key: 'help', title: 'How to get help', minutes: 5, blocks: [{ key: 'contact', label: 'Instructor contact', content: { type: 'callout', tone: 'info', title: 'Contact', text: 'Email and office hours' } }] },
      ],
    },
    { key: 'wrap', title: 'Wrap-up', placement: 'end', objective: '', lessons: [{ key: 'survey', title: 'Course survey', minutes: 5, blocks: [] }] },
  ],
};

function structure(): CourseStructure {
  const modules: Module[] = [{ id: 'm1', courseId: 'c1', title: 'Week 1', position: 0 }, { id: 'm2', courseId: 'c1', title: 'Week 2', position: 1 }];
  const lessons: Lesson[] = [{ id: 'l1', moduleId: 'm1', courseId: 'c1', title: 'Intro', minutes: 20, position: 0, status: 'draft', publishedAt: null }];
  return { course: { id: 'c1' }, modules, lessons, blocks: { l1: [] } };
}

let seq = 0;
const newId = (p: string) => `${p}-new${++seq}`;

describe('templates', () => {
  it('pick the program template, else the institution template', () => {
    expect(effectiveTemplateId({ programId: 'p1' }, { templateId: 't-prog' }, { templateId: 't-inst' })).toBe('t-prog');
    expect(effectiveTemplateId({ programId: 'p1' }, { templateId: null }, { templateId: 't-inst' })).toBe('t-inst');
    expect(effectiveTemplateId({ programId: null }, null, {})).toBeNull();
  });

  it('validate unique keys', () => {
    expect(validateTemplate(template)).toEqual([]);
    const bad = structuredClone(template);
    bad.modules[1].key = 'start';
    bad.modules[0].lessons[1].key = 'overview';
    expect(validateTemplate(bad)).toEqual(['Two lessons use the key "overview".', 'Two modules use the key "start".']);
  });

  it('preview only additions, with a summary and a hash that changes when the course changes', () => {
    const s = structure();
    const cs = templateChangeSet(template, s);
    expect(cs.addModules.map((m) => m.key)).toEqual(['start', 'wrap']);
    expect(cs.addLessons.map((l) => l.key)).toEqual(['overview', 'help', 'survey']);
    expect(cs.addBlocks.map((b) => b.key)).toEqual(['overview/how', 'help/contact']);
    expect(cs.summary).toBe('Adds 2 modules, 3 lessons and 2 blocks. Renames nothing. Removes nothing.');
    expect(templateChangeSet(template, structure()).hash).toBe(cs.hash);
    s.modules[0].templateKey = 'start';
    expect(templateChangeSet(template, s).hash).not.toBe(cs.hash);
    expect(templateChangeSet({ ...template, updatedAt: '2026-09-28T00:00:00.000Z' }, structure()).hash).not.toBe(cs.hash);
  });

  it('plan records that add the skeleton without touching existing content', () => {
    const s = structure();
    const plan = templatePlan(template, s, newId, NOW);
    expect(plan.createModules.map((m) => [m.title, m.position, m.templateKey])).toEqual([['Start here', 0, 'start'], ['Wrap-up', 3, 'wrap']]);
    expect(plan.moveModules.map((m) => [m.id, m.position])).toEqual([['m1', 1], ['m2', 2]]);
    expect(plan.createLessons.map((l) => [l.title, l.position, l.status, l.templateKey])).toEqual([['Course overview', 0, 'draft', 'overview'], ['How to get help', 1, 'draft', 'help'], ['Course survey', 0, 'draft', 'survey']]);
    expect(plan.createBlocks).toHaveLength(2);
    for (const b of plan.createBlocks) expect([b.origin, b.aiState, b.provenance]).toEqual(['human', null, null]);
    // Titles and existing ids are untouched.
    expect(s.modules.map((m) => m.title)).toEqual(['Week 1', 'Week 2']);
  });

  it('after applying, nothing is missing; emptying a required block is a deviation with a block fix', () => {
    const s = structure();
    const plan = templatePlan(template, s, newId, NOW);
    const applied: CourseStructure = {
      course: s.course,
      modules: [...plan.moveModules, ...plan.createModules],
      lessons: [...s.lessons, ...plan.createLessons],
      blocks: { ...s.blocks },
    };
    for (const b of plan.createBlocks) (applied.blocks[b.lessonId] ??= []).push(b);
    expect(templateDeviations(template, applied)).toEqual([]);
    expect(templateChangeSet(template, applied).summary).toBe('The course already has everything this template requires. Nothing changes.');

    const contact = plan.createBlocks.find((b) => b.templateKey === 'contact') as Extract<Block, { type: 'callout' }>;
    contact.title = '';
    contact.text = '';
    const deviations = templateDeviations(template, applied);
    expect(deviations.map((d) => d.kind)).toEqual(['empty-block']);
    expect(deviations[0].fix.target).toEqual({ kind: 'block', lessonId: contact.lessonId, blockId: contact.id });

    // Deleting a required lesson shows up (journey 12).
    applied.lessons = applied.lessons.filter((l) => l.templateKey !== 'help');
    expect(templateDeviations(template, applied).map((d) => d.message)).toEqual(['The required lesson "How to get help" is missing.']);
  });

  it('match by key, so renaming a required lesson is allowed', () => {
    const s = structure();
    const plan = templatePlan(template, s, newId, NOW);
    const lessons = [...s.lessons, ...plan.createLessons].map((l) => (l.templateKey === 'overview' ? { ...l, title: 'Welcome to OPS 101' } : l));
    const blocks: Record<string, Block[]> = {};
    for (const b of plan.createBlocks) (blocks[b.lessonId] ??= []).push(b);
    expect(templateDeviations(template, { course: s.course, modules: [...plan.moveModules, ...plan.createModules], lessons, blocks })).toEqual([]);
  });
});
