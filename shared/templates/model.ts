// Course templates (D-024, #24): which template applies, what a course is missing, and
// the exact change set applying it would make. Pure functions shared by the service, the
// app (preview), and the readiness check "template-followed".
//
// Rules:
// - A program's template applies to its courses; otherwise the institution's; else none.
// - Structure is matched by template key, never by title, so renaming is always allowed.
// - Applying a template only adds: missing modules, lessons, and required blocks. It never
//   deletes, renames, or reorders existing content (principle #11, D-003: preview first).
// - A required block that exists but is empty is a deviation, not something to re-add.
import { stableHash } from '../hash';
import type {
  Block, BlockContent, Course, CourseTemplate, FixLink, Id, Institution, Lesson, Module, Program, TemplateChangeSet, TemplateModule,
} from '../domain';
import { blockText } from '../quality/snapshot';

/** The template that applies to a course, by id. */
export function effectiveTemplateId(course: Pick<Course, 'programId'>, program: Pick<Program, 'templateId'> | null, institution: Pick<Institution, 'templateId'>): Id | null {
  if (course.programId && program?.templateId) return program.templateId;
  return institution.templateId ?? null;
}

/** Problems with a template's own structure; empty when it's valid. */
export function validateTemplate(template: Pick<CourseTemplate, 'modules' | 'accessFloor'>): string[] {
  const problems: string[] = [];
  const moduleKeys = new Set<string>();
  const lessonKeys = new Set<string>();
  for (const m of template.modules) {
    if (moduleKeys.has(m.key)) problems.push(`Two modules use the key "${m.key}".`);
    moduleKeys.add(m.key);
    for (const l of m.lessons) {
      if (lessonKeys.has(l.key)) problems.push(`Two lessons use the key "${l.key}".`);
      lessonKeys.add(l.key);
      const blockKeys = new Set<string>();
      for (const b of l.blocks) {
        if (blockKeys.has(b.key)) problems.push(`Two blocks in "${l.title}" use the key "${b.key}".`);
        blockKeys.add(b.key);
      }
    }
  }
  if (template.accessFloor !== null && (template.accessFloor < 0 || template.accessFloor > 100)) problems.push('The accessibility floor must be between 0 and 100.');
  return problems;
}

/** The course structure the template functions read. */
export interface CourseStructure {
  course: Pick<Course, 'id'>;
  modules: Module[];
  lessons: Lesson[];
  blocks: Record<Id, Block[]>;
}

export interface Deviation {
  kind: 'missing-module' | 'missing-lesson' | 'missing-block' | 'empty-block';
  key: string;
  message: string;
  fix: FixLink;
}

const isEmptyContent = (block: Block) => blockText(block).trim() === '' && block.type !== 'image' && block.type !== 'file' && block.type !== 'video';

/** How the course differs from its template. Missing items can be added by applying the template; empty blocks need a person. */
export function templateDeviations(template: CourseTemplate, structure: CourseStructure): Deviation[] {
  const deviations: Deviation[] = [];
  const courseId = structure.course.id;
  const toTemplate = (label: string): FixLink => ({ label, target: { kind: 'template', courseId } });
  for (const m of template.modules) {
    const mod = structure.modules.find((x) => x.templateKey === m.key);
    if (!mod) {
      deviations.push({ kind: 'missing-module', key: m.key, message: `The required module "${m.title}" is missing.`, fix: toTemplate('Review the template changes') });
    }
    for (const l of m.lessons) {
      const lesson = structure.lessons.find((x) => x.templateKey === l.key);
      if (!lesson) {
        if (mod) deviations.push({ kind: 'missing-lesson', key: l.key, message: `The required lesson "${l.title}" is missing.`, fix: toTemplate('Review the template changes') });
        continue;
      }
      const blocks = structure.blocks[lesson.id] ?? [];
      for (const b of l.blocks) {
        const block = blocks.find((x) => x.templateKey === b.key);
        if (!block) {
          deviations.push({ kind: 'missing-block', key: `${l.key}/${b.key}`, message: `"${lesson.title}" is missing the required block "${b.label}".`, fix: toTemplate('Review the template changes') });
        } else if (isEmptyContent(block)) {
          deviations.push({ kind: 'empty-block', key: `${l.key}/${b.key}`, message: `The required block "${b.label}" in "${lesson.title}" is empty.`, fix: { label: `Fill in "${b.label}"`, target: { kind: 'block', lessonId: lesson.id, blockId: block.id } } });
        }
      }
    }
  }
  return deviations;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What applying the template would add. `hash` covers the template version and every add, so a stale preview can't be applied. */
export function templateChangeSet(template: CourseTemplate, structure: CourseStructure): TemplateChangeSet {
  const addModules: TemplateChangeSet['addModules'] = [];
  const addLessons: TemplateChangeSet['addLessons'] = [];
  const addBlocks: TemplateChangeSet['addBlocks'] = [];
  for (const m of template.modules) {
    const mod = structure.modules.find((x) => x.templateKey === m.key);
    if (!mod) addModules.push({ key: m.key, title: m.title, placement: m.placement });
    const moduleTitle = mod?.title ?? m.title;
    for (const l of m.lessons) {
      const lesson = structure.lessons.find((x) => x.templateKey === l.key);
      if (!lesson) {
        addLessons.push({ key: l.key, moduleTitle, title: l.title });
        for (const b of l.blocks) addBlocks.push({ key: `${l.key}/${b.key}`, lessonTitle: l.title, label: b.label });
        continue;
      }
      const blocks = structure.blocks[lesson.id] ?? [];
      for (const b of l.blocks) {
        if (!blocks.some((x) => x.templateKey === b.key)) addBlocks.push({ key: `${l.key}/${b.key}`, lessonTitle: lesson.title, label: b.label });
      }
    }
  }
  const parts: string[] = [];
  if (addModules.length) parts.push(plural(addModules.length, 'module'));
  if (addLessons.length) parts.push(plural(addLessons.length, 'lesson'));
  if (addBlocks.length) parts.push(plural(addBlocks.length, 'block'));
  const summary = parts.length
    ? `Adds ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}. Renames nothing. Removes nothing.`
    : 'The course already has everything this template requires. Nothing changes.';
  const hash = stableHash({ t: template.id, v: template.updatedAt, addModules, addLessons, addBlocks });
  return { courseId: structure.course.id, templateId: template.id, templateName: template.name, addModules, addLessons, addBlocks, summary, hash };
}

/** Concrete records to write when a change set is applied. */
export interface TemplatePlan {
  createModules: Module[];
  /** Existing modules moved down to make room for modules placed at the start. */
  moveModules: Module[];
  createLessons: Lesson[];
  createBlocks: Block[];
}

/**
 * The records that apply the template. New modules go at the start or the end; new
 * lessons and blocks are appended to their module or lesson. Blocks are human-authored
 * starter content (origin "human"): templates are written by people, not AI.
 */
export function templatePlan(template: CourseTemplate, structure: CourseStructure, newId: (prefix: string) => Id, now: string): TemplatePlan {
  const courseId = structure.course.id;
  const createModules: Module[] = [];
  const createLessons: Lesson[] = [];
  const createBlocks: Block[] = [];
  const existing = [...structure.modules].sort((a, b) => a.position - b.position);
  const starts = template.modules.filter((m) => m.placement === 'start' && !existing.some((x) => x.templateKey === m.key));
  const ends = template.modules.filter((m) => m.placement === 'end' && !existing.some((x) => x.templateKey === m.key));
  const moveModules = starts.length ? existing.map((m, i) => ({ ...m, position: starts.length + i })) : [];
  const lastPosition = existing.length ? Math.max(...existing.map((m) => m.position)) : -1;

  const moduleFor = new Map<string, Module>();
  starts.forEach((m, i) => moduleFor.set(m.key, newModule(m, i)));
  ends.forEach((m, i) => moduleFor.set(m.key, newModule(m, (starts.length ? starts.length + existing.length : lastPosition + 1) + i)));
  function newModule(m: TemplateModule, position: number): Module {
    const mod: Module = { id: newId('m'), courseId, title: m.title, position, objective: m.objective || null, templateKey: m.key };
    createModules.push(mod);
    return mod;
  }

  for (const m of template.modules) {
    const mod = moduleFor.get(m.key) ?? existing.find((x) => x.templateKey === m.key)!;
    let nextLessonPosition = Math.max(-1, ...structure.lessons.filter((l) => l.moduleId === mod.id).map((l) => l.position)) + 1;
    for (const l of m.lessons) {
      let lesson = structure.lessons.find((x) => x.templateKey === l.key);
      let blocks = lesson ? structure.blocks[lesson.id] ?? [] : [];
      if (!lesson) {
        lesson = { id: newId('l'), moduleId: mod.id, courseId, title: l.title, minutes: l.minutes, position: nextLessonPosition++, status: 'draft', publishedAt: null, templateKey: l.key };
        createLessons.push(lesson);
        blocks = [];
      }
      let nextBlockPosition = Math.max(-1, ...blocks.map((b) => b.position)) + 1;
      for (const b of l.blocks) {
        if (blocks.some((x) => x.templateKey === b.key)) continue;
        createBlocks.push(starterBlock(b.content, { id: newId('b'), lessonId: lesson.id, position: nextBlockPosition++, templateKey: b.key, updatedAt: now }));
      }
    }
  }
  return { createModules, moveModules, createLessons, createBlocks };
}

function starterBlock(content: BlockContent, meta: { id: Id; lessonId: Id; position: number; templateKey: string; updatedAt: string }): Block {
  return { ...structuredClone(content), ...meta, origin: 'human', aiState: null, provenance: null, previous: null } as Block;
}
