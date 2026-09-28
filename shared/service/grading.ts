import type { Assignment, Grade, GradebookRow, RubricCriterion, Submission } from '../domain';
import type { BlockInput } from '../api';
import type { Service, ServiceContext } from './context';
import { aiEnabled, canReachCourse, canTeach, fail, moduleFor, required, user } from './helpers';
import { validateBlockContent } from './validate';

const validPoints = (n: number) => Number.isFinite(n) && n >= 0 ? n : fail('invalid', 'Points must be nonnegative.');
const due = (value: string | null) => value === null || !Number.isNaN(Date.parse(value)) ? value : fail('invalid', 'Due date is invalid.');
const type = (value: Assignment['submissionType']) => ['text','file','link'].includes(value) ? value : fail('invalid', 'Submission type is invalid.');
async function assignment(ctx: ServiceContext, id: string, teaching = false) {
  const a = await ctx.repo.getAssignment(id) ?? fail('not-found', 'Assignment not found.');
  if (teaching) await canTeach(ctx, a.courseId);
  else { await canReachCourse(ctx, a.courseId); if (user(ctx).role === 'student' && a.status !== 'published') fail('not-found', 'Assignment not found.'); }
  return a;
}
async function submission(ctx: ServiceContext, id: string) {
  const s = await ctx.repo.getSubmission(id) ?? fail('not-found', 'Submission not found.');
  const a = await assignment(ctx, s.assignmentId, true);
  return { s, a };
}
function rubric(value: RubricCriterion[]) {
  if (!Array.isArray(value)) fail('invalid', 'Rubric is invalid.');
  const ids = new Set<string>();
  return value.map(c => {
    required(c.id, 'Criterion id'); required(c.title, 'Criterion title');
    if (ids.has(c.id) || !Array.isArray(c.levels) || !c.levels.length) fail('invalid', 'Rubric criteria need unique ids and levels.');
    ids.add(c.id);
    const levels = new Set<string>();
    for (const l of c.levels) { required(l.id, 'Level id'); required(l.title, 'Level title'); validPoints(l.points); if (levels.has(l.id)) fail('invalid', 'Rubric level ids must be unique.'); levels.add(l.id); }
    return c;
  });
}
function checkedCriteria(a: Assignment, values: Grade['criteria']) {
  if (!Array.isArray(values) || values.length !== a.rubric.length) fail('invalid', 'Select one level for every criterion.');
  const seen = new Set<string>();
  for (const item of values) {
    const c = a.rubric.find(x => x.id === item.criterionId);
    const level = c?.levels.find(x => x.id === item.levelId);
    if (!level || seen.has(item.criterionId) || item.points !== level.points || typeof item.comment !== 'string') fail('invalid', 'Rubric result is invalid.');
    seen.add(item.criterionId);
  }
}
function instructionBlocks(ctx: ServiceContext, id: string, blocks: BlockInput[]) {
  if (!Array.isArray(blocks)) fail('invalid', 'Instructions are invalid.');
  return blocks.map((raw, position) => {
    const value = validateBlockContent(raw);
    if (!['text','heading','callout'].includes(value.type)) fail('invalid', 'Instructions support text, headings, and callouts.');
    return { ...value, id: raw.id || ctx.newId('b'), lessonId: id, position, origin: 'human' as const, aiState: null, provenance: null, previous: null, updatedAt: ctx.now() };
  }) as Assignment['instructions'];
}
function current(items: Submission[]) { return items[0] ?? null; }
function studentView(s: Submission | null): Submission | null { return s ? s.grade?.releasedAt ? s : { ...s, grade: null } : null; }
async function book(ctx: ServiceContext, courseId: string) {
  // Instructors of the course and administrators (the route is STAFF).
  if (user(ctx).role === 'administrator') await canReachCourse(ctx, courseId); else await canTeach(ctx, courseId);
  const assignments = (await ctx.repo.listAssignments({ courseId })).filter(a => a.status === 'published');
  const students = await Promise.all((await ctx.repo.listEnrollments({ courseId })).map(e => ctx.repo.getUser(e.userId)));
  const submissions = await ctx.repo.listSubmissions({});
  const rows: GradebookRow[] = students.filter((x): x is NonNullable<typeof x> => !!x && x.role === 'student').sort((a,b) => a.name.localeCompare(b.name)).map(student => {
    let total = 0, possible = 0;
    const cells = assignments.map(a => {
      const s = current(submissions.filter(x => x.assignmentId === a.id && x.studentId === student.id));
      const released = !!s?.grade?.releasedAt;
      // Every published assignment counts toward what's possible; only released grades count as earned.
      possible += a.points;
      if (released) total += s!.grade!.score;
      return { assignmentId: a.id, score: released ? s!.grade!.score : null, state: s?.state ?? 'missing', released };
    });
    return { student: { id: student.id, name: student.name, email: student.email }, cells, total, possible };
  });
  return { assignments: assignments.map(({ id,title,points,dueAt }) => ({ id,title,points,dueAt })), rows };
}
const csv = (v: unknown) => `"${String(v ?? '').replaceAll('"','""')}"`;
export const grading: Pick<Service, 'listAssignments'|'createAssignment'|'getAssignment'|'updateAssignment'|'deleteAssignment'|'publishAssignment'|'listSubmissions'|'submit'|'getMySubmission'|'gradeSubmission'|'draftFeedback'|'releaseGrades'|'getGradebook'|'exportGradebook'> = {
  createAssignment: async (ctx, input) => {
    const m = await moduleFor(ctx, input.moduleId); await canTeach(ctx, m.courseId);
    const siblings = await ctx.repo.listAssignments({ moduleId: m.id });
    const a: Assignment = { id: ctx.newId('asg'), moduleId:m.id,courseId:m.courseId,title:required(input.title,'Title'),position:siblings.length,status:'draft',publishedAt:null,dueAt:due(input.dueAt ?? null),points:validPoints(input.points),submissionType:type(input.submissionType),rubric:[],instructions:[] };
    await ctx.repo.putAssignment(a); return a;
  },
  listAssignments: async (ctx, { courseId }) => {
    await canReachCourse(ctx, courseId);
    const all = await ctx.repo.listAssignments({ courseId });
    return user(ctx).role === 'student' ? all.filter(a => a.status === 'published') : all;
  },
  getAssignment: async (ctx, { assignmentId }) => assignment(ctx, assignmentId),
  updateAssignment: async (ctx, input) => {
    const a = await assignment(ctx, input.assignmentId, true);
    if (input.title !== undefined) a.title = required(input.title,'Title');
    if (input.dueAt !== undefined) a.dueAt = due(input.dueAt);
    if (input.points !== undefined) a.points = validPoints(input.points);
    if (input.submissionType !== undefined) a.submissionType = type(input.submissionType);
    if (input.rubric !== undefined) a.rubric = rubric(input.rubric);
    if (input.instructions !== undefined) a.instructions = instructionBlocks(ctx, a.id, input.instructions);
    if (input.position !== undefined) {
      if (!Number.isInteger(input.position)) fail('invalid', 'Position is invalid.');
      const siblings = await ctx.repo.listAssignments({ moduleId: a.moduleId });
      const rest = siblings.filter(x => x.id !== a.id); const position = Math.max(0, Math.min(rest.length, Math.trunc(input.position)));
      rest.splice(position,0,a); for (const [i,s] of rest.entries()) await ctx.repo.putAssignment({ ...s, position:i }); a.position = position;
    }
    await ctx.repo.putAssignment(a); return a;
  },
  deleteAssignment: async (ctx, { assignmentId }) => { const a = await assignment(ctx, assignmentId, true); await ctx.repo.deleteAssignment(a.id); for (const [position, sibling] of (await ctx.repo.listAssignments({moduleId:a.moduleId})).entries()) await ctx.repo.putAssignment({...sibling,position}); return { ok:true }; },
  publishAssignment: async (ctx, { assignmentId }) => { const a = await assignment(ctx, assignmentId, true); a.status='published'; a.publishedAt=ctx.now(); await ctx.repo.putAssignment(a); return a; },
  listSubmissions: async (ctx, { assignmentId, limit, cursor }) => {
    await assignment(ctx, assignmentId, true);
    const all = await ctx.repo.listSubmissions({ assignmentId });
    const latest = all.filter((s,i) => all.findIndex(x => x.studentId === s.studentId) === i);
    const start = cursor ? Math.max(0, latest.findIndex(x => x.id === cursor) + 1) : 0;
    const size = Math.max(1,Math.min(100,limit ?? 20)); const slice = latest.slice(start,start+size);
    const items = await Promise.all(slice.map(async s => { const u = await ctx.repo.getUser(s.studentId); return { ...s, student: { id:s.studentId,name:u?.name ?? 'Student',email:u?.email ?? '' } }; }));
    return { items, nextCursor: start+size < latest.length ? slice.at(-1)!.id : null };
  },
  submit: async (ctx, input) => {
    const a = await assignment(ctx, input.assignmentId); if (user(ctx).role !== 'student') fail('forbidden','Students only.');
    if (a.status !== 'published') fail('not-found','Assignment not found.');
    if (a.dueAt && Date.parse(ctx.now()) > Date.parse(a.dueAt)) fail('conflict','The due date has passed.');
    const text = input.text?.trim() ?? '', fileId = input.fileId?.trim() || null, link = input.link?.trim() ?? '';
    if (a.submissionType === 'text' && !text) fail('invalid','Text is required.');
    if (a.submissionType === 'file' && !fileId) fail('invalid','A file is required.');
    if (a.submissionType === 'file' && fileId) {
      const f = await ctx.repo.getFile(fileId);
      if (!f || f.courseId !== a.courseId || f.uploadedBy !== user(ctx).id) fail('invalid','Upload your file to this course, then submit it.');
    }
    if (a.submissionType === 'link' && !/^https?:\/\/[^\s]+$/i.test(link)) fail('invalid','Enter an http or https link.');
    const previous = current(await ctx.repo.listSubmissions({ assignmentId:a.id,studentId:user(ctx).id }));
    if (previous && (previous.attempt >= 2 || previous.state !== 'submitted')) fail('conflict','This submission cannot be replaced.');
    const s: Submission = { id:ctx.newId('sub'),assignmentId:a.id,studentId:user(ctx).id,attempt:(previous?.attempt ?? 0)+1,state:'submitted',text:a.submissionType==='text'?text:'',fileId:a.submissionType==='file'?fileId:null,link:a.submissionType==='link'?link:'',submittedAt:ctx.now(),grade:null };
    await ctx.repo.putSubmission(s); return s;
  },
  getMySubmission: async (ctx, { assignmentId }) => { await assignment(ctx, assignmentId); return studentView(current(await ctx.repo.listSubmissions({ assignmentId,studentId:user(ctx).id }))!); },
  gradeSubmission: async (ctx, input) => {
    const { s,a } = await submission(ctx,input.submissionId);
    if (current(await ctx.repo.listSubmissions({ assignmentId:a.id,studentId:s.studentId }))?.id !== s.id) fail('conflict','Only the current submission can be graded.');
    if (s.state === 'returned') fail('conflict','Released grades cannot be changed.');
    checkedCriteria(a,input.criteria);
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > a.points) fail('invalid','Score exceeds assignment points.');
    if (input.feedbackOrigin !== 'human' && input.feedbackOrigin !== 'ai') fail('invalid','Feedback origin is invalid.');
    if (input.feedbackOrigin === 'ai' && !input.feedbackProvenance) fail('invalid','AI feedback needs its source.');
    s.state='graded'; s.grade={ score:input.score,criteria:input.criteria,feedback:input.feedback.trim(),feedbackOrigin:input.feedbackOrigin,feedbackProvenance:input.feedbackOrigin==='ai' ? input.feedbackProvenance ?? null : null,gradedBy:user(ctx).id,gradedAt:ctx.now(),releasedAt:null };
    await ctx.repo.putSubmission(s); return s;
  },
  draftFeedback: async (ctx, { submissionId,criteria }) => {
    const {s,a} = await submission(ctx,submissionId); await aiEnabled(ctx); checkedCriteria(a,criteria);
    const c = await ctx.repo.getCourse(a.courseId);
    const result = await ctx.ai.run('feedback',{ courseTitle:c?.title ?? '',assignmentTitle:a.title,rubric:a.rubric,criteria,submissionText:s.text || s.link || (s.fileId ? 'File submission' : '') });
    return { feedback:result.output.feedback,provenance:{model:result.model,task:'feedback',generatedAt:ctx.now(),sources:[],summary:`Feedback draft from rubric results for ${a.title}` } };
  },
  releaseGrades: async (ctx, { assignmentId }) => { await assignment(ctx,assignmentId,true); for (const s of await ctx.repo.listSubmissions({ assignmentId })) if (s.state === 'graded' && s.grade) { s.state='returned'; s.grade.releasedAt=ctx.now(); await ctx.repo.putSubmission(s); } return {ok:true}; },
  getGradebook: async (ctx, { courseId }) => book(ctx,courseId),
  exportGradebook: async (ctx, { courseId }) => {
    const b = await book(ctx,courseId);
    const lines = [[ 'Student','Email',...b.assignments.map(a => a.title),'Total','Possible' ].map(csv).join(',')];
    for (const row of b.rows) lines.push([row.student.name,row.student.email,...row.cells.map(c => c.score ?? ''),row.total,row.possible].map(csv).join(','));
    return {csv:lines.join('\r\n')+'\r\n'};
  },
};
