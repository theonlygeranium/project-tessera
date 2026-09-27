import type { ActivityKind, Block, StudentBlock, TutorMessage, TutorSession } from '../domain';
import type { Service, ServiceContext } from './context';
import type { StoredTutorSession } from '../repo';
import { allowedModes, decide, effectiveMode, leaksAnswer, visibilityText } from '../tutor/policy';
import { canReachCourse, canTeach, content, fail, user } from './helpers';
import { canReadFile } from './files';

type Source = { id: string; name: string; text: string };
const visible = (block: Block) => block.origin !== 'ai' || block.aiState === 'kept';

async function activity(ctx: ServiceContext, kind: ActivityKind, id: string) {
  if (kind === 'lesson') {
    const lesson = await ctx.repo.getLesson(id) ?? fail('not-found', 'Lesson not found.');
    return { courseId: lesson.courseId, title: lesson.title, published: lesson.status === 'published' };
  }
  if (kind === 'assignment') {
    const assignment = await ctx.repo.getAssignment(id) ?? fail('not-found', 'Assignment not found.');
    return { courseId: assignment.courseId, title: assignment.title, published: assignment.status === 'published' };
  }
  return fail('invalid', 'Activity kind is invalid.');
}

// The check projection is the same public shape as getStudentLesson: no key or feedback.
async function sources(ctx: ServiceContext, kind: ActivityKind, id: string, title: string): Promise<Source[]> {
  if (kind === 'assignment') {
    const assignment = await ctx.repo.getAssignment(id) ?? fail('not-found', 'Assignment not found.');
    return assignment.instructions.flatMap((block, index) => block.type === 'callout' || block.type === 'heading' || block.type === 'text'
      ? [{ id: block.id, name: `${title} · block ${index + 1}`, text: block.type === 'callout' ? `${block.title}\n${block.text}` : block.text }]
      : []);
  }
  const lesson = await ctx.repo.getLesson(id) ?? fail('not-found', 'Lesson not found.');
  if (lesson.status !== 'published') return [];
  const blocks = (await ctx.repo.listBlocks(id)).filter(visible).map((block, index) => {
    const c = content(block);
    const publicBlock: StudentBlock = c.type === 'check'
      ? { id:block.id, position:block.position, origin:block.origin, provenance:block.provenance, type:'check', question:c.question, options:c.options }
      : { id:block.id, position:block.position, origin:block.origin, provenance:block.provenance, ...c } as StudentBlock;
    const { id: _id, position: _position, origin: _origin, provenance: _provenance, ...safe } = publicBlock;
    return { id:block.id, name:`${title} · block ${index + 1}`, text:JSON.stringify(safe) };
  });
  const files: Source[] = [];
  for (const file of await ctx.repo.listFiles(lesson.courseId)) {
    try { await canReadFile(ctx,file); files.push({ id:file.id, name:file.name, text:file.name }); }
    catch { /* Other students' uploads are not course sources for this learner. */ }
  }
  return [...blocks,...files];
}

async function publicSession(ctx: ServiceContext, stored: StoredTutorSession): Promise<TutorSession> {
  const setting = await ctx.repo.getTutorSetting(stored.activityKind, stored.activityId);
  const setter = setting ? await ctx.repo.getUser(setting.setBy) : null;
  return { id:stored.id, studentId:stored.studentId, activityKind:stored.activityKind, activityId:stored.activityId,
    mode:stored.mode, hintsUsed:stored.hintsUsed, maxHints:stored.maxHints,
    visibility:visibilityText(stored.mode, setter?.name ?? null, stored.maxHints), messages:stored.messages };
}

export const tutor: Pick<Service, 'getTutorSetting' | 'setTutorSetting' | 'startTutorSession' | 'sendTutorMessage' | 'getTutorSummaries'> = {
  getTutorSetting: async (ctx, { activityKind, activityId }) => {
    const a = await activity(ctx, activityKind, activityId);
    await canReachCourse(ctx, a.courseId);
    return ctx.repo.getTutorSetting(activityKind, activityId);
  },
  setTutorSetting: async (ctx, input) => {
    const a = await activity(ctx, input.activityKind, input.activityId);
    await canTeach(ctx, a.courseId);
    const policy = (await ctx.repo.getInstitution()).policy;
    if (!allowedModes(input.activityKind, policy).includes(input.mode)) fail('invalid', 'That tutor mode is not available for this activity.');
    if (!Number.isInteger(input.maxHints) || input.maxHints < 0 || input.maxHints > 10) fail('invalid', 'Hints allowed must be 0–10.');
    const valid = new Set((await sources(ctx, input.activityKind, input.activityId, a.title)).map(s => s.id));
    if (!Array.isArray(input.allowedSourceIds) || input.allowedSourceIds.some(id => !valid.has(id)) || new Set(input.allowedSourceIds).size !== input.allowedSourceIds.length) fail('invalid', 'Select sources from this activity.');
    const setting = { ...input, allowedSourceIds:[...input.allowedSourceIds], setBy:user(ctx).id, setAt:ctx.now() };
    await ctx.repo.putTutorSetting(setting);
    return setting;
  },
  startTutorSession: async (ctx, { activityKind, activityId }) => {
    const student = user(ctx);
    if (student.role !== 'student') fail('forbidden', 'Students only.');
    const a = await activity(ctx, activityKind, activityId);
    await canReachCourse(ctx, a.courseId);
    if (!a.published) fail('not-found', 'Activity not found.');
    const previous = (await ctx.repo.listTutorSessions({ studentId:student.id, activityKind, activityId }))[0];
    const setting = await ctx.repo.getTutorSetting(activityKind, activityId);
    const policy = (await ctx.repo.getInstitution()).policy;
    if (previous) {
      previous.mode = effectiveMode(activityKind, policy, setting);
      previous.maxHints = setting?.maxHints ?? 2;
      await ctx.repo.putTutorSession(previous);
      return publicSession(ctx, previous);
    }
    const stored: StoredTutorSession = { id:ctx.newId('tut'), studentId:student.id, activityKind, activityId, courseId:a.courseId,
      mode:effectiveMode(activityKind, policy, setting), maxHints:setting?.maxHints ?? 2, hintsUsed:0, answerRequests:0,
      messages:[], startedAt:ctx.now(), updatedAt:ctx.now() };
    await ctx.repo.putTutorSession(stored);
    return publicSession(ctx, stored);
  },
  sendTutorMessage: async (ctx, { sessionId, text, intent }) => {
    const stored = await ctx.repo.getTutorSession(sessionId) ?? fail('not-found', 'Tutor session not found.');
    if (stored.studentId !== user(ctx).id || user(ctx).role !== 'student') fail('forbidden', 'This is not your tutor session.');
    await canReachCourse(ctx, stored.courseId);
    const a = await activity(ctx, stored.activityKind, stored.activityId);
    if (!a.published || a.courseId !== stored.courseId) fail('not-found', 'Activity not found.');
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) fail('invalid', 'Enter a message of 1–2,000 characters.');
    if (!['hint','explain','answer','chat'].includes(intent)) fail('invalid', 'Choose a tutor action.');
    if (stored.messages.length + 2 > 60) fail('conflict', 'This session has reached its message limit.');
    const setting = await ctx.repo.getTutorSetting(stored.activityKind, stored.activityId);
    stored.mode = effectiveMode(stored.activityKind, (await ctx.repo.getInstitution()).policy, setting);
    stored.maxHints = setting?.maxHints ?? 2;
    const decision = decide({ mode:stored.mode, activityKind:stored.activityKind, intent, hintsUsed:stored.hintsUsed, maxHints:stored.maxHints });
    const allSources = await sources(ctx, stored.activityKind, stored.activityId, a.title);
    const allowed = setting ? new Set(setting.allowedSourceIds) : null;
    const available = allSources.filter(source => !allowed || allowed.has(source.id));
    let replyText = decision.note ?? '';
    let cites: TutorMessage['cites'] = [];
    if (decision.kind !== 'refusal') {
      const course = await ctx.repo.getCourse(a.courseId) ?? fail('not-found', 'Course not found.');
      const profile = user(ctx).profile;
      const result = await ctx.ai.run('tutor', { kind:decision.kind, mode:stored.mode, courseTitle:course.title, activityTitle:a.title,
        sources:available, history:stored.messages.slice(-8).map(m => ({ role:m.role, text:m.text })), question:text.trim(),
        hintNumber:decision.hintNumber, maxHints:stored.maxHints, readingLevel:profile?.readingLevel ?? 'standard', language:profile?.language ?? 'en' });
      const sourceById = new Map(available.map(source => [source.id, source]));
      const body = result.output.text.trim();
      if (!body) fail('ai-failed', 'The tutor returned an empty reply.');
      replyText = [decision.note, body].filter(Boolean).join('\n\n');
      cites = [...new Set(result.output.citeIds)].map(id => sourceById.get(id)).filter((s): s is Source => !!s).map(({ id,name }) => ({ id,name }));
      if (decision.kind !== 'answer' && stored.activityKind === 'lesson') {
        const keys = (await ctx.repo.listBlocks(stored.activityId)).filter(b => b.type === 'check').flatMap(b => {
          if (b.type !== 'check') return [];
          const index = b.options.findIndex(o => o.id === b.correctOptionId);
          return index < 0 ? [] : [{ correctText:b.options[index].text, correctLabel:String.fromCharCode(97 + index) }];
        });
        if (leaksAnswer(replyText, keys)) { replyText = [decision.note, 'Here is a hint: compare the ideas in the lesson with each choice. What detail helps you decide?'].filter(Boolean).join('\n\n'); cites = []; }
      }
    }
    const at = ctx.now();
    const studentMessage: TutorMessage = { id:ctx.newId('tm'), role:'student', text:text.trim(), kind:null, hintNumber:null, cites:[], at };
    const reply: TutorMessage = { id:ctx.newId('tm'), role:'tutor', text:replyText, kind:decision.kind, hintNumber:decision.hintNumber, cites, at };
    stored.messages.push(studentMessage, reply);
    if (decision.kind === 'hint') stored.hintsUsed += 1;
    if (intent === 'answer') stored.answerRequests += 1;
    stored.updatedAt = at;
    await ctx.repo.putTutorSession(stored);
    return { session:await publicSession(ctx, stored), reply };
  },
  getTutorSummaries: async (ctx, { courseId }) => {
    const course = await canTeach(ctx, courseId);
    const groups = new Map<string, StoredTutorSession[]>();
    for (const session of await ctx.repo.listTutorSessions({ courseId })) groups.set(session.studentId, [...(groups.get(session.studentId) ?? []), session]);
    const result = [];
    for (const [studentId, sessions] of groups) {
      const student = await ctx.repo.getUser(studentId);
      if (!student || student.role !== 'student') continue;
      const questions = sessions.flatMap(s => s.messages.filter(m => m.role === 'student').map(m => ({ at:m.at, text:m.text })))
        .sort((a,b) => b.at.localeCompare(a.at)).slice(0,40).map(q => q.text);
      const ai = await ctx.ai.run('tutor-summary', { courseTitle:course.title, questions });
      // A summary that reproduces a message verbatim is withheld rather than exposing a transcript.
      const summary = questions.some(q => q.length >= 12 && ai.output.summary.includes(q))
        ? 'This student asked for help with course activities. Review hint use and answer requests for context.' : ai.output.summary;
      result.push({ studentId, studentName:student.name, sessions:sessions.length,
        hintsUsed:sessions.reduce((n,s) => n+s.hintsUsed,0), answerRequests:sessions.reduce((n,s) => n+s.answerRequests,0), summary,
        provenance:{ model:ai.model, task:'tutor-summary' as const, generatedAt:ctx.now(), sources:[], summary:"Topics and possible misconceptions from this student's questions" } });
    }
    return result.sort((a,b) => a.studentName.localeCompare(b.studentName));
  },
};
