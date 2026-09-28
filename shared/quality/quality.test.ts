import { describe, expect, it } from 'vitest';
import type { AiFinding, Block, BlockContent, Course, CourseTemplate, Lesson, Module, Rubric } from '../domain';
import { AUTOMATIC_CHECKS } from './checks';
import { canAttest, evaluateReadiness, itemsForLesson, itemStatus } from './evaluate';
import { readingLevel } from './reading';
import { BUILT_IN_RUBRICS, OSCQR_RUBRIC, TESSERA_RUBRIC } from './rubrics';
import type { CourseSnapshot } from './snapshot';

const NOW = '2026-09-27T12:00:00.000Z';
let n = 0;
function block(lessonId: string, content: BlockContent, extra: Partial<Block> = {}): Block {
  return { id: `b${++n}`, lessonId, position: n, origin: 'human', aiState: null, provenance: null, previous: null, updatedAt: NOW, ...content, ...extra } as Block;
}
function lesson(id: string, moduleId: string, title: string, extra: Partial<Lesson> = {}): Lesson {
  return { id, moduleId, courseId: 'c1', title, minutes: 20, position: 0, status: 'draft', publishedAt: null, ...extra };
}
const course: Course = { id: 'c1', code: 'OPS 101', title: 'Safe Operations', term: 'Fall', description: '', welcome: '', outcomes: [], instructorIds: ['u-i'], status: 'active' };

const PROSE = 'Read each step before you begin the task. Ask a lead when a step is unclear. Wear gloves near the press. '.repeat(10);

/** A course that meets every automatic item. */
function goodSnapshot(): CourseSnapshot {
  const modules: Module[] = [
    { id: 'm1', courseId: 'c1', title: 'Start here', position: 0, objective: 'Find your way around the course.' },
    { id: 'm2', courseId: 'c1', title: 'Safety basics', position: 1, objective: 'Apply the lockout procedure.' },
  ];
  const lessons = [lesson('l1', 'm1', 'How this course works'), lesson('l2', 'm2', 'Lockout steps')];
  const check = block('l2', { type: 'check', question: 'What comes first?', options: [{ id: 'a', text: 'Isolate' }, { id: 'b', text: 'Test' }], correctOptionId: 'a', feedbackCorrect: '', feedbackIncorrect: '' });
  return {
    course,
    modules,
    lessons,
    blocks: {
      l1: [block('l1', { type: 'text', text: 'This course has two modules. Start with this lesson, then work through each module in order. Email me at lee@example.edu with questions.' })],
      l2: [
        block('l2', { type: 'text', text: PROSE }),
        check,
        block('l2', { type: 'video', src: 'https://youtube.com/watch?v=x', provider: 'youtube', title: 'Demo', captionsFileId: null, transcript: 'Transcript text', minutes: 5 }),
        block('l2', { type: 'link', href: 'https://example.edu/lockout', text: 'Lockout procedure (PDF)', description: '' }),
        block('l2', { type: 'text', text: 'AI written and kept.' }, { origin: 'ai', aiState: 'kept' }),
      ],
    },
    assignments: [],
    outcomes: [{ id: 'o1', courseId: 'c1', code: 'O1', text: 'Apply the lockout procedure to a machine', position: 0 }],
    outcomeLinks: [{ outcomeId: 'o1', targetKind: 'block', targetId: check.id }],
    access: { score: 92, minimum: 80 },
    template: null,
    instructors: [{ id: 'u-i', name: 'Lee', email: 'lee@example.edu' }],
  };
}

describe('built-in rubrics', () => {
  it('have unique item ids, valid automatic checks, and OSCQR has 50 standards with attribution', () => {
    for (const rubric of BUILT_IN_RUBRICS) {
      const items = rubric.standards.flatMap((s) => s.items);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const i of items) {
        if (i.kind === 'automatic') expect(Object.keys(AUTOMATIC_CHECKS)).toContain(i.check);
        else expect(i.check).toBeNull();
      }
    }
    expect(OSCQR_RUBRIC.standards.flatMap((s) => s.items)).toHaveLength(50);
    expect(OSCQR_RUBRIC.standards).toHaveLength(6);
    expect(OSCQR_RUBRIC.attribution).toContain('Creative Commons Attribution 4.0');
    expect(OSCQR_RUBRIC.standards[0].items[0].text).toBe('Course includes Welcome and Getting Started content.');
    expect(TESSERA_RUBRIC.standards).toHaveLength(8);
  });

  it('never include Quality Matters text', () => {
    expect(JSON.stringify(BUILT_IN_RUBRICS)).not.toMatch(/Quality Matters|\bQM\b/);
  });
});

describe('automatic checks', () => {
  it('pass a well-built course', () => {
    const s = goodSnapshot();
    for (const [name, check] of Object.entries(AUTOMATIC_CHECKS)) {
      const out = check(s);
      expect([name, out.status]).not.toEqual([name, 'not-met']);
    }
    expect(AUTOMATIC_CHECKS['template-followed'](s).status).toBe('not-applicable');
    expect(AUTOMATIC_CHECKS['assessments-aligned'](s).status).toBe('met');
  });

  it('point fixes at the exact block', () => {
    const s = goodSnapshot();
    const draft = block('l2', { type: 'text', text: 'Draft' }, { origin: 'ai', aiState: 'draft' });
    const image = block('l2', { type: 'image', src: 'x.png', alt: '', decorative: false, caption: '' });
    const vague = block('l2', { type: 'link', href: 'https://example.edu', text: 'click here', description: '' });
    s.blocks.l2.push(draft, image, vague);
    expect(AUTOMATIC_CHECKS['ai-drafts-kept'](s).fixes[0].target).toEqual({ kind: 'block', lessonId: 'l2', blockId: draft.id });
    expect(AUTOMATIC_CHECKS['media-alternatives'](s).fixes[0].target).toEqual({ kind: 'block', lessonId: 'l2', blockId: image.id });
    expect(AUTOMATIC_CHECKS['descriptive-links'](s).fixes[0].target).toEqual({ kind: 'block', lessonId: 'l2', blockId: vague.id });
  });

  it('are conservative when there is nothing to judge or data is missing', () => {
    const s = goodSnapshot();
    s.access.score = null;
    expect(AUTOMATIC_CHECKS['access-score'](s).status).toBe('not-met');
    s.outcomes = [];
    expect(AUTOMATIC_CHECKS['outcomes-present'](s).status).toBe('not-met');
    expect(AUTOMATIC_CHECKS['outcomes-assessed'](s).status).toBe('not-met');
    s.blocks.l2 = [];
    expect(AUTOMATIC_CHECKS['assessments-aligned'](s).status).toBe('not-applicable');
    expect(AUTOMATIC_CHECKS['media-alternatives'](s).status).toBe('not-applicable');
    expect(AUTOMATIC_CHECKS['reading-level'](s).status).toBe('not-applicable');
  });

  it('flag missing module objectives, untagged assessments, short estimates, and missing contact', () => {
    const s = goodSnapshot();
    s.modules[1].objective = '';
    s.outcomeLinks = [];
    s.lessons[1].minutes = 3;
    s.blocks.l1 = [block('l1', { type: 'text', text: 'This course has two modules. Start with this lesson, then work through each module in order.' })];
    expect(AUTOMATIC_CHECKS['module-objectives'](s).fixes[0].target).toEqual({ kind: 'module', moduleId: 'm2' });
    expect(AUTOMATIC_CHECKS['assessments-aligned'](s).status).toBe('not-met');
    expect(AUTOMATIC_CHECKS['time-estimates'](s).status).toBe('not-met');
    expect(AUTOMATIC_CHECKS['instructor-contact'](s).status).toBe('not-met');
  });

  it('require real content in the start-here lesson', () => {
    const s = goodSnapshot();
    s.blocks.l1 = [block('l1', { type: 'text', text: 'Welcome!' })];
    const out = AUTOMATIC_CHECKS['navigation-instructions'](s);
    expect(out.status).toBe('not-met');
    expect(out.fixes[0].target).toEqual({ kind: 'lesson', lessonId: 'l1' });
  });

  it('report template deviations', () => {
    const s = goodSnapshot();
    s.template = {
      id: 't1', name: 'Meridian standard', description: '', owner: { kind: 'institution' }, accessFloor: null, updatedBy: 'u-admin', updatedAt: NOW,
      tutorDefaults: { lesson: 'hints', assignment: 'hints' },
      modules: [{ key: 'start', title: 'Start here', placement: 'start', objective: '', lessons: [{ key: 'overview', title: 'Course overview', minutes: 10, blocks: [{ key: 'contact', label: 'Instructor contact', content: { type: 'text', text: 'Contact' } }] }] }],
    } satisfies CourseTemplate;
    s.modules[0].templateKey = 'start';
    expect(AUTOMATIC_CHECKS['template-followed'](s).evidence).toEqual(['The required lesson "Course overview" is missing.']);
  });

  it('measure reading level on prose only', () => {
    expect(readingLevel('Too short.').grade).toBeNull();
    expect(readingLevel(PROSE).grade!).toBeLessThan(8);
    const dense = 'Institutional operationalization of multidimensional accountability frameworks necessitates comprehensive interdepartmental coordination mechanisms. '.repeat(12);
    expect(readingLevel(dense).grade!).toBeGreaterThan(12);
  });
});

describe('evaluateReadiness', () => {
  it('excludes unkept AI content from contact and assessment checks while counting drafts', () => {
    const s = goodSnapshot();
    s.course = { ...s.course, welcome: '' };
    s.blocks.l1 = [block('l1', { type: 'text', text: 'Start here and work through each section in order before the course ends.' }, { origin: 'ai', aiState: 'draft' })];
    const contact = block('l2', { type: 'text', text: 'Office hours are on Monday.' }, { origin: 'ai', aiState: 'draft' });
    s.blocks.l2.push(contact);
    const statuses = () => new Map(evaluateReadiness(TESSERA_RUBRIC, s, [], null, NOW).standards.flatMap(st => st.items).map(item => [item.number, item.status]));
    expect(statuses().get('1.2')).toBe('not-met');
    expect(statuses().get('6.1')).toBe('not-met');
    contact.aiState = 'kept';
    expect(statuses().get('1.2')).toBe('met');
    expect(statuses().get('6.1')).toBe('not-met');
    const check = s.blocks.l2.find(b => b.type === 'check')!;
    check.origin = 'ai'; check.aiState = 'draft';
    expect(statuses().get('3.2')).toBe('not-met');
  });
  it('does not count outcome links to assessments removed with a lesson', () => {
    const s = goodSnapshot();
    expect(AUTOMATIC_CHECKS['outcomes-assessed'](s).status).toBe('met');
    s.lessons = s.lessons.filter(lesson => lesson.id !== 'l2');
    delete s.blocks.l2;
    expect(AUTOMATIC_CHECKS['outcomes-assessed'](s).status).toBe('not-met');
  });
  const finding = (verdict: AiFinding['verdict'], state: AiFinding['state']): AiFinding => ({
    verdict, state, evidence: 'The welcome names the instructor.', suggestion: '', reviewedBy: state === 'draft' ? null : 'u-i', reviewedAt: state === 'draft' ? null : NOW,
    provenance: { model: 'fixture', task: 'readiness-item', generatedAt: NOW, sources: [], summary: 'Judged item 1.3' },
  });

  it('never lets an AI finding pass an item until a person accepts it (D-003)', () => {
    const item = TESSERA_RUBRIC.standards[0].items[2];
    expect(item.kind).toBe('ai');
    expect(itemStatus(item, null, undefined)).toBe('needs-review');
    expect(itemStatus(item, null, { itemId: item.id, finding: finding('likely-met', 'draft'), attestation: null })).toBe('needs-review');
    expect(itemStatus(item, null, { itemId: item.id, finding: finding('likely-met', 'accepted'), attestation: null })).toBe('met');
    expect(itemStatus(item, null, { itemId: item.id, finding: finding('likely-not-met', 'accepted'), attestation: null })).toBe('not-met');
    expect(itemStatus(item, null, { itemId: item.id, finding: finding('unclear', 'accepted'), attestation: null })).toBe('needs-review');
    expect(itemStatus(item, null, { itemId: item.id, finding: finding('likely-met', 'dismissed'), attestation: null })).toBe('needs-review');
  });

  it('lets reviewers attest AI and attestation items, but only mark automatic items not applicable', () => {
    const auto = TESSERA_RUBRIC.standards[0].items[0];
    const att = { status: 'attested' as const, by: 'u-i', byName: 'Lee', note: '', at: NOW };
    expect(canAttest(auto, 'attested')).toBe(false);
    expect(canAttest(auto, 'not-applicable')).toBe(true);
    expect(itemStatus(auto, { status: 'not-met', evidence: [], fixes: [] }, { itemId: auto.id, finding: null, attestation: att })).toBe('not-met');
    expect(itemStatus(auto, { status: 'not-met', evidence: [], fixes: [] }, { itemId: auto.id, finding: null, attestation: { ...att, status: 'not-applicable' } })).toBe('not-applicable');
    const manual = TESSERA_RUBRIC.standards[3].items[0];
    expect(itemStatus(manual, null, undefined)).toBe('needs-review');
    expect(itemStatus(manual, null, { itemId: manual.id, finding: null, attestation: att })).toBe('attested');
  });

  it('scores met and attested over applicable items and applies the policy minimum', () => {
    const s = goodSnapshot();
    const result = evaluateReadiness(TESSERA_RUBRIC, s, [], null, NOW);
    const all = result.standards.flatMap((x) => x.items);
    expect(result.applicable).toBe(all.filter((i) => i.status !== 'not-applicable').length);
    expect(result.met).toBe(all.filter((i) => i.status === 'met' || i.status === 'attested').length);
    expect(result.percent).toBe(Math.floor((result.met / result.applicable) * 100));
    expect(result.needsReview).toBe(all.filter((i) => i.kind !== 'automatic').length);
    expect(result.blocksPublishing).toBe(false);
    expect(evaluateReadiness(TESSERA_RUBRIC, s, [], { rubricId: TESSERA_RUBRIC.id, minimumPercent: 100 }, NOW).blocksPublishing).toBe(true);
    // A minimum for another rubric doesn't apply.
    expect(evaluateReadiness(TESSERA_RUBRIC, s, [], { rubricId: OSCQR_RUBRIC.id, minimumPercent: 100 }, NOW).blocksPublishing).toBe(false);
  });

  it('marks standards met, partly met, not met, or not applicable', () => {
    const rubric: Rubric = {
      id: 'r', name: 'R', source: 'custom', version: '1', attribution: null, builtIn: false, updatedAt: NOW,
      standards: [
        { id: 's1', number: '1', title: 'A', description: '', items: [{ id: 'i1', number: '1', text: 'Outcomes', kind: 'automatic', check: 'outcomes-present', criteria: '' }] },
        { id: 's2', number: '2', title: 'B', description: '', items: [{ id: 'i2', number: '2', text: 'Links', kind: 'automatic', check: 'descriptive-links', criteria: '' }] },
        { id: 's3', number: '3', title: 'C', description: '', items: [{ id: 'i3', number: '3', text: 'Outcomes', kind: 'automatic', check: 'outcomes-present', criteria: '' }, { id: 'i4', number: '4', text: 'Review', kind: 'attestation', check: null, criteria: '' }] },
      ],
    };
    const s = goodSnapshot();
    s.blocks.l2 = s.blocks.l2.filter((b) => b.type !== 'link');
    const r = evaluateReadiness(rubric, s, [], null, NOW);
    expect(r.standards.map((x) => x.status)).toEqual(['met', 'not-applicable', 'partly-met']);
    s.outcomes = [];
    expect(evaluateReadiness(rubric, s, [], null, NOW).standards[0].status).toBe('not-met');
  });

  it('shows attestation notes as evidence and hides dismissed findings', () => {
    const s = goodSnapshot();
    const item = TESSERA_RUBRIC.standards[0].items[2];
    const r = evaluateReadiness(TESSERA_RUBRIC, s, [{ itemId: item.id, finding: finding('likely-met', 'dismissed'), attestation: { status: 'attested', by: 'u-i', byName: 'Lee', note: 'Checked the welcome video.', at: NOW } }], null, NOW);
    const out = r.standards[0].items[2];
    expect(out.status).toBe('attested');
    expect(out.evidence).toEqual(['Attested by Lee: Checked the welcome video.']);
  });

  it('lists the items with fixes in one lesson', () => {
    const s = goodSnapshot();
    s.blocks.l2.push(block('l2', { type: 'text', text: 'Draft' }, { origin: 'ai', aiState: 'draft' }));
    const r = evaluateReadiness(TESSERA_RUBRIC, s, [], null, NOW);
    expect(itemsForLesson(r, 'l2').map((i) => i.number)).toEqual(['6.1']);
    expect(itemsForLesson(r, 'l1')).toEqual([]);
  });
});
