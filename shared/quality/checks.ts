// Automatic readiness checks (D-029, #25). Each reads a CourseSnapshot and returns a
// status with evidence in plain sentences and fix links to the exact block or setting.
//
// Checks are conservative: "met" needs positive evidence. When there's nothing to judge
// (no media, no links), the item is "not-applicable" rather than silently met.
import type { AutomaticCheck, Block, FixLink, Lesson } from '../domain';
import { templateDeviations } from '../templates/model';
import { READING_GRADE_LIMIT, readingLevel } from './reading';
import { allBlocks, blockText, proseText, type CourseSnapshot } from './snapshot';

export interface CheckOutcome {
  status: 'met' | 'not-met' | 'not-applicable';
  evidence: string[];
  fixes: FixLink[];
}

const met = (...evidence: string[]): CheckOutcome => ({ status: 'met', evidence, fixes: [] });
const notApplicable = (...evidence: string[]): CheckOutcome => ({ status: 'not-applicable', evidence, fixes: [] });
const notMet = (evidence: string[], fixes: FixLink[]): CheckOutcome => ({ status: 'not-met', evidence, fixes });

const blockFix = (label: string, lesson: Lesson, block: Block): FixLink => ({ label, target: { kind: 'block', lessonId: lesson.id, blockId: block.id } });
const MAX_LISTED = 5;
/** Lists at most five names, then "and N more". */
function listed(names: string[]): string {
  const shown = names.slice(0, MAX_LISTED).map((n) => `"${n}"`);
  const more = names.length - shown.length;
  return shown.join(', ') + (more > 0 ? `, and ${more} more` : '');
}

const START_HERE = /\b(start here|getting started|get started|course overview|how this course works|welcome|orientation|navigat)/i;
const CONTACT = /[^\s@]+@[^\s@]+\.[^\s@]+|\boffice hours\b|\bcontact (me|your instructor|the instructor)\b|\bhow to reach\b/i;
const GENERIC_LINK_TEXT = /^(click here|here|link|this link|read more|more|learn more|this|website|page|url|https?:\/\/\S+)$/i;
const ASSESSMENT_BLOCKS = new Set<Block['type']>(['check', 'scenario']);

export const AUTOMATIC_CHECKS: Record<AutomaticCheck, (s: CourseSnapshot) => CheckOutcome> = {
  'outcomes-present'(s) {
    const fix: FixLink = { label: 'Add course outcomes', target: { kind: 'course', courseId: s.course.id, field: 'outcomes' } };
    if (s.outcomes.length === 0) return notMet(['The course has no learning outcomes.'], [fix]);
    const thin = s.outcomes.filter((o) => o.text.trim().split(/\s+/).length < 4);
    if (thin.length) return notMet([`${thin.length === 1 ? 'An outcome is' : 'Some outcomes are'} too short to describe what learners will do: ${listed(thin.map((o) => o.text))}.`], [fix]);
    return met(`The course lists ${s.outcomes.length} ${s.outcomes.length === 1 ? 'outcome' : 'outcomes'}.`);
  },

  'module-objectives'(s) {
    if (s.modules.length === 0) return notMet(['The course has no modules yet.'], []);
    const missing = s.modules.filter((m) => !m.objective?.trim());
    if (missing.length) {
      return notMet(
        [`${missing.length} of ${s.modules.length} modules have no objective: ${listed(missing.map((m) => m.title))}.`],
        missing.slice(0, MAX_LISTED).map((m) => ({ label: `Add an objective to "${m.title}"`, target: { kind: 'module', moduleId: m.id } })),
      );
    }
    return met(`All ${s.modules.length} modules state an objective.`);
  },

  'assessments-aligned'(s) {
    const linked = (kind: 'block' | 'assignment', id: string) => s.outcomeLinks.some((l) => l.targetKind === kind && l.targetId === id);
    const blocks = allBlocks(s).filter(({ block }) => ASSESSMENT_BLOCKS.has(block.type));
    const total = blocks.length + s.assignments.length;
    if (total === 0) return notApplicable('The course has no checks, scenarios, or assignments yet.');
    const untaggedBlocks = blocks.filter(({ block }) => !linked('block', block.id));
    const untaggedAssignments = s.assignments.filter((a) => !linked('assignment', a.id));
    const untagged = untaggedBlocks.length + untaggedAssignments.length;
    if (untagged === 0) return met(`All ${total} checks, scenarios, and assignments are tagged with outcomes.`);
    const names = [
      ...untaggedAssignments.map((a) => a.title),
      ...untaggedBlocks.map(({ lesson, block }) => `${block.type === 'check' ? 'Check' : 'Scenario'} in ${lesson.title}`),
    ];
    const fixes: FixLink[] = [
      ...untaggedAssignments.map((a): FixLink => ({ label: `Tag "${a.title}" with outcomes`, target: { kind: 'assignment', assignmentId: a.id } })),
      ...untaggedBlocks.map(({ lesson, block }) => blockFix(`Tag the ${block.type} in "${lesson.title}"`, lesson, block)),
    ].slice(0, MAX_LISTED);
    return notMet([`${untagged} of ${total} aren't tagged with an outcome: ${listed(names)}.`], fixes);
  },

  'outcomes-assessed'(s) {
    if (s.outcomes.length === 0) return notMet(['The course has no outcomes to assess.'], [{ label: 'Add course outcomes', target: { kind: 'course', courseId: s.course.id, field: 'outcomes' } }]);
    const assessmentIds = new Set(allBlocks(s).filter(({ block }) => ASSESSMENT_BLOCKS.has(block.type)).map(({ block }) => block.id));
    const assignmentIds = new Set(s.assignments.map((assignment) => assignment.id));
    const assessed = new Set(s.outcomeLinks.filter((link) => link.targetKind === 'block' ? assessmentIds.has(link.targetId) : link.targetKind === 'assignment' && assignmentIds.has(link.targetId)).map((link) => link.outcomeId));
    const unassessed = s.outcomes.filter((o) => !assessed.has(o.id));
    if (unassessed.length === 0) return met(`Every outcome is assessed by at least one check, scenario, or assignment.`);
    return notMet([`${unassessed.length} of ${s.outcomes.length} outcomes aren't assessed anywhere: ${listed(unassessed.map((o) => `${o.code} ${o.text}`))}.`], [{ label: 'Review outcomes', target: { kind: 'course', courseId: s.course.id, field: 'outcomes' } }]);
  },

  'access-score'(s) {
    const fix: FixLink = { label: 'Open the accessibility report', target: { kind: 'access', courseId: s.course.id } };
    if (s.access.score === null) return notMet(["The course hasn't been checked for accessibility yet."], [fix]);
    if (s.access.score >= s.access.minimum) return met(`The accessibility score is ${s.access.score}; the minimum is ${s.access.minimum}.`);
    return notMet([`The accessibility score is ${s.access.score}; the minimum is ${s.access.minimum}.`], [fix]);
  },

  'reading-level'(s) {
    const estimates = s.lessons.map((lesson) => ({ lesson, ...readingLevel((s.blocks[lesson.id] ?? []).map(proseText).filter(Boolean).join('\n\n')) }));
    const measured = estimates.filter((e) => e.grade !== null);
    if (measured.length === 0) return notApplicable('No lesson has enough prose to estimate a reading level.');
    const high = measured.filter((e) => e.grade! > READING_GRADE_LIMIT);
    if (high.length === 0) return met(`All ${measured.length} measured lessons read at or below grade ${READING_GRADE_LIMIT}.`);
    return notMet(
      [`${high.length} ${high.length === 1 ? 'lesson reads' : 'lessons read'} above grade ${READING_GRADE_LIMIT}: ${listed(high.map((e) => `${e.lesson.title} (grade ${e.grade})`))}.`],
      high.slice(0, MAX_LISTED).map((e) => ({ label: `Simplify "${e.lesson.title}"`, target: { kind: 'lesson', lessonId: e.lesson.id } })),
    );
  },

  'navigation-instructions'(s) {
    const first = [...s.modules].sort((a, b) => a.position - b.position)[0];
    const candidates = s.lessons.filter((l) => (first && l.moduleId === first.id) || l.templateKey === 'start-here');
    const found = candidates.find((l) => START_HERE.test(l.title) && (s.blocks[l.id] ?? []).some((b) => blockText(b).trim().split(/\s+/).length >= 15));
    if (found) return met(`"${found.title}" explains how the course works.`);
    const titled = candidates.find((l) => START_HERE.test(l.title));
    if (titled) return notMet([`"${titled.title}" has almost no content yet.`], [{ label: `Write "${titled.title}"`, target: { kind: 'lesson', lessonId: titled.id } }]);
    return notMet(['The first module has no "Start here" or overview lesson.'], [{ label: 'Review the template changes', target: { kind: 'template', courseId: s.course.id } }]);
  },

  'instructor-contact'(s) {
    if (s.instructors.length === 0) return notMet(['The course has no instructor assigned.'], []);
    const hit = allBlocks(s).find(({ block }) => CONTACT.test(blockText(block))) ?? (CONTACT.test(s.course.welcome) ? 'welcome' : null);
    if (hit === 'welcome') return met('The course welcome says how to contact the instructor.');
    if (hit) return met(`"${hit.lesson.title}" says how to contact the instructor.`);
    return notMet(['No lesson or welcome says how to contact the instructor (an email address or office hours).'], [{ label: 'Add contact details to the welcome', target: { kind: 'course', courseId: s.course.id, field: 'welcome' } }]);
  },

  'template-followed'(s) {
    if (!s.template) return notApplicable('No template applies to this course.');
    const deviations = templateDeviations(s.template, s);
    if (deviations.length === 0) return met(`The course has everything "${s.template.name}" requires.`);
    return notMet(deviations.slice(0, MAX_LISTED * 2).map((d) => d.message), dedupe(deviations.map((d) => d.fix)).slice(0, MAX_LISTED));
  },

  'time-estimates'(s) {
    if (s.lessons.length === 0) return notMet(['The course has no lessons yet.'], []);
    const short = s.lessons.filter((lesson) => {
      const media = (s.blocks[lesson.id] ?? []).reduce((sum, b) => sum + (b.type === 'video' ? b.minutes : 0), 0);
      return media > lesson.minutes;
    });
    if (short.length === 0) return met(`All ${s.lessons.length} lessons have a time estimate that covers their video.`);
    return notMet(
      [`${short.length} ${short.length === 1 ? "lesson's estimate is" : "lessons' estimates are"} shorter than their video: ${listed(short.map((l) => l.title))}.`],
      short.slice(0, MAX_LISTED).map((l) => ({ label: `Update the time for "${l.title}"`, target: { kind: 'lesson', lessonId: l.id } })),
    );
  },

  'ai-drafts-kept'(s) {
    const drafts = allBlocks(s).filter(({ block }) => block.origin === 'ai' && block.aiState !== 'kept');
    const ai = allBlocks(s).filter(({ block }) => block.origin === 'ai').length;
    if (drafts.length === 0) return ai ? met(`All ${ai} AI-drafted blocks have been kept by a person.`) : met('The course has no AI-drafted blocks.');
    return notMet([`${drafts.length} AI ${drafts.length === 1 ? 'draft is' : 'drafts are'} waiting for review.`], drafts.slice(0, MAX_LISTED).map(({ lesson, block }) => blockFix(`Review the draft in "${lesson.title}"`, lesson, block)));
  },

  'media-alternatives'(s) {
    const media = allBlocks(s).filter(({ block }) => block.type === 'video' || (block.type === 'image' && !block.decorative));
    if (media.length === 0) return notApplicable('The course has no video or informative images.');
    const missing = media.filter(({ block }) => (block.type === 'video' ? !block.captionsFileId && !block.transcript.trim() : block.type === 'image' && !block.alt.trim()));
    if (missing.length === 0) return met(`All ${media.length} videos and images have captions, transcripts, or alt text.`);
    return notMet(
      [`${missing.length} of ${media.length} are missing a text alternative: ${listed(missing.map(({ lesson, block }) => `${block.type === 'video' ? 'video' : 'image'} in ${lesson.title}`))}.`],
      missing.slice(0, MAX_LISTED).map(({ lesson, block }) => blockFix(block.type === 'video' ? `Add captions or a transcript in "${lesson.title}"` : `Add alt text in "${lesson.title}"`, lesson, block)),
    );
  },

  'descriptive-links'(s) {
    const links = allBlocks(s).filter(({ block }) => block.type === 'link');
    if (links.length === 0) return notApplicable('The course has no links.');
    const vague = links.filter(({ block }) => block.type === 'link' && (GENERIC_LINK_TEXT.test(block.text.trim()) || block.text.trim().length < 4));
    if (vague.length === 0) return met(`All ${links.length} links say where they go.`);
    return notMet(
      [`${vague.length} ${vague.length === 1 ? "link doesn't" : "links don't"} say where they go: ${listed(vague.map(({ block }) => (block.type === 'link' ? block.text : '')))}.`],
      vague.slice(0, MAX_LISTED).map(({ lesson, block }) => blockFix(`Rewrite the link text in "${lesson.title}"`, lesson, block)),
    );
  },
};

function dedupe(fixes: FixLink[]): FixLink[] {
  const seen = new Set<string>();
  return fixes.filter((f) => {
    const key = JSON.stringify(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
