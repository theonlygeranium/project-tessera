// Programs, course templates, and previewed, additive template application (D-024).
import type { Course, CourseTemplate, Id, Program } from '../domain';
import { ACCENTS } from '../policy';
import { effectiveTemplateId, templateChangeSet, templatePlan, validateTemplate, type CourseStructure } from '../templates/model';
import { allowedModes } from '../tutor/policy';
import type { Service, ServiceContext } from './context';
import { courses } from './courses';
import { canReachCourse, canTeach, course, fail, required, user } from './helpers';
import { validateBlockContent } from './validate';

async function validTemplateId(ctx: ServiceContext, id: Id | null): Promise<Id | null> {
  if (id && !(await ctx.repo.getTemplate(id))) fail('invalid', 'Template not found.');
  return id;
}

function validBrand(brand: Program['brand']): Program['brand'] {
  if (brand.logo !== null) fail('invalid', "Logos aren't supported yet.");
  if (brand.accent !== null && !ACCENTS.some(option => option.id === brand.accent)) fail('invalid', 'Choose an available accent.');
  return brand;
}

async function validTemplate(ctx: ServiceContext, template: CourseTemplate): Promise<CourseTemplate> {
  const problem = validateTemplate(template)[0];
  if (problem) fail('invalid', problem);
  if (template.owner.kind === 'program' && !(await ctx.repo.getProgram(template.owner.programId))) fail('invalid', 'Program not found.');
  const minimum = (await ctx.repo.getInstitution()).accessPolicy.minimumScore;
  if (template.accessFloor !== null && template.accessFloor < minimum) fail('invalid', `The accessibility floor must be at least the institution minimum of ${minimum}.`);
  for (const module of template.modules) for (const lesson of module.lessons) for (const block of lesson.blocks) validateBlockContent(block.content);
  return template;
}

export async function courseStructure(ctx: ServiceContext, c: Course): Promise<CourseStructure> {
  const [modules, lessons] = await Promise.all([ctx.repo.listModules(c.id), ctx.repo.listLessons({ courseId: c.id })]);
  const blocks = Object.fromEntries(await Promise.all(lessons.map(async lesson => [lesson.id, await ctx.repo.listBlocks(lesson.id)] as const)));
  return { course: { id: c.id }, modules, lessons, blocks };
}

export async function effectiveTemplate(ctx: ServiceContext, c: Course): Promise<CourseTemplate | null> {
  const institution = await ctx.repo.getInstitution();
  const program = c.programId ? await ctx.repo.getProgram(c.programId) : null;
  const id = effectiveTemplateId(c, program, institution);
  return id ? ctx.repo.getTemplate(id) : null;
}

async function chosenTemplate(ctx: ServiceContext, c: Course, explicit?: Id): Promise<CourseTemplate> {
  const template = explicit ? await ctx.repo.getTemplate(explicit) : await effectiveTemplate(ctx, c);
  if (!template) return fail('not-found', explicit ? 'Template not found.' : 'No template applies to this course.');
  return template;
}

/** Write only the records in the shared plan, then fill unset tutor settings within policy. */
export async function applyTemplatePlan(ctx: ServiceContext, c: Course, template: CourseTemplate, structure: CourseStructure): Promise<void> {
  const plan = templatePlan(template, structure, ctx.newId, ctx.now());
  for (const module of plan.moveModules) await ctx.repo.putModule(module);
  for (const module of plan.createModules) await ctx.repo.putModule(module);
  for (const lesson of plan.createLessons) await ctx.repo.putLesson(lesson);
  for (const block of plan.createBlocks) await ctx.repo.putBlock(block);
  const institution = await ctx.repo.getInstitution();
  const allLessons = [...structure.lessons, ...plan.createLessons];
  const assignments = await ctx.repo.listAssignments({ courseId: c.id });
  for (const [kind, activities] of [['lesson', allLessons], ['assignment', assignments]] as const) {
    const mode = template.tutorDefaults[kind];
    if (!allowedModes(kind, institution.policy).includes(mode)) continue;
    for (const activity of activities) {
      if (await ctx.repo.getTutorSetting(kind, activity.id)) continue;
      await ctx.repo.putTutorSetting({ activityKind: kind, activityId: activity.id, mode, maxHints: 3, allowedSourceIds: [], setBy: user(ctx).id, setAt: ctx.now() });
    }
  }
}

export const templates: Pick<Service, 'listPrograms' | 'createProgram' | 'updateProgram' | 'deleteProgram' | 'setCourseProgram' | 'listTemplates' | 'getTemplate' | 'createTemplate' | 'updateTemplate' | 'deleteTemplate' | 'setInstitutionTemplate' | 'previewTemplate' | 'applyTemplate'> = {
  listPrograms: async ctx => (await ctx.repo.listPrograms()).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  createProgram: async (ctx, input) => {
    const program: Program = { id: ctx.newId('p'), name: required(input.name, 'name'), description: input.description?.trim() ?? '', templateId: await validTemplateId(ctx, input.templateId ?? null), brand: validBrand(input.brand ?? { accent: null, logo: null }), createdAt: ctx.now() };
    await ctx.repo.putProgram(program); return program;
  },
  updateProgram: async (ctx, input) => {
    const program = await ctx.repo.getProgram(input.programId) ?? fail('not-found', 'Program not found.');
    const updated: Program = { ...program, name: input.name === undefined ? program.name : required(input.name, 'name'), description: input.description === undefined ? program.description : input.description.trim(), templateId: input.templateId === undefined ? program.templateId : await validTemplateId(ctx, input.templateId), brand: input.brand === undefined ? program.brand : validBrand(input.brand) };
    await ctx.repo.putProgram(updated); return updated;
  },
  deleteProgram: async (ctx, { programId }) => {
    if (!(await ctx.repo.getProgram(programId))) fail('not-found', 'Program not found.');
    if ((await ctx.repo.listCourses()).some(c => c.programId === programId)) fail('conflict', 'Move this program’s courses before deleting it.');
    await ctx.repo.deleteProgram(programId); return { ok: true };
  },
  setCourseProgram: async (ctx, { courseId, programId }) => {
    const c = await course(ctx, courseId);
    if (programId && !(await ctx.repo.getProgram(programId))) fail('invalid', 'Program not found.');
    const updated = { ...c, programId }; await ctx.repo.putCourse(updated); return updated;
  },
  listTemplates: async ctx => ctx.repo.listTemplates(),
  getTemplate: async (ctx, { templateId }) => await ctx.repo.getTemplate(templateId) ?? fail('not-found', 'Template not found.'),
  createTemplate: async (ctx, input) => {
    const template: CourseTemplate = { id: ctx.newId('t'), name: required(input.name, 'name'), description: input.description?.trim() ?? '', owner: input.owner, modules: input.modules, tutorDefaults: input.tutorDefaults, accessFloor: input.accessFloor, updatedAt: ctx.now(), updatedBy: user(ctx).id };
    await validTemplate(ctx, template); await ctx.repo.putTemplate(template); return template;
  },
  updateTemplate: async (ctx, input) => {
    const previous = await ctx.repo.getTemplate(input.templateId) ?? fail('not-found', 'Template not found.');
    const now = ctx.now();
    const updatedAt = now > previous.updatedAt ? now : new Date(new Date(previous.updatedAt).getTime() + 1).toISOString();
    const updated: CourseTemplate = { ...previous, ...(input.name === undefined ? {} : { name: required(input.name, 'name') }), ...(input.description === undefined ? {} : { description: input.description.trim() }), ...(input.owner === undefined ? {} : { owner: input.owner }), ...(input.modules === undefined ? {} : { modules: input.modules }), ...(input.tutorDefaults === undefined ? {} : { tutorDefaults: input.tutorDefaults }), ...(input.accessFloor === undefined ? {} : { accessFloor: input.accessFloor }), updatedAt, updatedBy: user(ctx).id };
    await validTemplate(ctx, updated); await ctx.repo.putTemplate(updated); return updated;
  },
  deleteTemplate: async (ctx, { templateId }) => {
    if (!(await ctx.repo.getTemplate(templateId))) fail('not-found', 'Template not found.');
    if ((await ctx.repo.getInstitution()).templateId === templateId || (await ctx.repo.listPrograms()).some(p => p.templateId === templateId)) fail('conflict', 'Remove this template from the institution and programs before deleting it.');
    await ctx.repo.deleteTemplate(templateId); return { ok: true };
  },
  setInstitutionTemplate: async (ctx, { templateId }) => {
    await validTemplateId(ctx, templateId);
    const institution = { ...await ctx.repo.getInstitution(), templateId };
    await ctx.repo.putInstitution(institution); return institution;
  },
  previewTemplate: async (ctx, { courseId, templateId }) => {
    const c = await canReachCourse(ctx, courseId);
    const template = await chosenTemplate(ctx, c, templateId);
    return templateChangeSet(template, await courseStructure(ctx, c));
  },
  applyTemplate: async (ctx, { courseId, templateId, hash }) => {
    const c = user(ctx).role === 'administrator' ? await course(ctx, courseId) : await canTeach(ctx, courseId);
    const template = await chosenTemplate(ctx, c, templateId);
    const structure = await courseStructure(ctx, c);
    if (templateChangeSet(template, structure).hash !== hash) fail('conflict', 'The course or template changed since the preview. Review the changes again.');
    await applyTemplatePlan(ctx, c, template, structure);
    return courses.getCourseOutline(ctx, { courseId });
  },
};
