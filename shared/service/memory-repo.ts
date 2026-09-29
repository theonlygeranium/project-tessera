import type { Adaptation, Announcement, Assignment, Block, BuilderSession, Course, Institution, Invitation, Lesson, Module, Submission, User, ApiToken, FileRecord, AccessibleFormat, ActivityKind, TutorSetting, Program, CourseTemplate, Rubric, Outcome, OutcomeLink, AlignableKind, Requirement, CompletionEvent, TestOut, Certificate, ReportingLine, ManagerConsent, DesignSession, InstructorProfile } from '../domain';
import { normalizeDesignSession } from './design-session-shape';
import type { Repo, Enrollment, StoredAnnouncement, AnnouncementRead, StoredProgress, FileVersion, StoredScan, StoredFormat, GenerationJob, StoredTutorSession, StoredReadinessItem, TestOutAttempt } from '../repo';
import type { SeedData } from '../seed';
import { ApiError } from '../api';

declare const structuredClone: <T>(value: T) => T;
const copy = <T>(value: T): T => structuredClone(value);
/**
 * Night 3 optional fields are omitted when null, as D1 omits NULL columns, so both repos
 * return identical objects (including through `toEqual`).
 */
const OPTIONAL_NIGHT3 = ['templateId', 'readinessPolicy', 'programId', 'objective', 'templateKey', 'variantOf', 'source', 'sessionId'] as const;
function normalized<T extends object>(value: T): T {
  const out = copy(value) as Record<string, unknown>;
  for (const key of OPTIONAL_NIGHT3) if (key in out && (out[key] === null || out[key] === undefined)) delete out[key];
  return out as T;
}
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const byName = (a: { name: string }, b: { name: string }) => cmp(a.name, b.name);
const byPosition = (a: { position: number; id: string }, b: { position: number; id: string }) => a.position - b.position || cmp(a.id, b.id);
const byNewest = (a: { publishedAt: string | null; createdAt: string }, b: { publishedAt: string | null; createdAt: string }) =>
  (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);

export class MemoryRepo implements Repo {
  private data: SeedData & { readinessItems: StoredReadinessItem[] };
  constructor(seed: SeedData) { this.data = this.withNight3(seed); }
  async getInstitution(): Promise<Institution> { return copy(this.data.institution); }
  async putInstitution(value: Institution) { this.data.institution = normalized(value); }
  async getUser(id: string): Promise<User | null> { return copy(this.data.users.find(x => x.id === id) ?? null); }
  async listUsers(filter?: { role?: User['role'] }): Promise<User[]> {
    const order = { administrator: 0, instructor: 1, student: 2 };
    return copy(this.data.users.filter(x => !filter?.role || x.role === filter.role).sort((a, b) => order[a.role] - order[b.role] || byName(a, b)));
  }
  async findUserByEmail(email: string): Promise<User | null> { return copy(this.data.users.find(x => x.email.toLowerCase() === email.toLowerCase()) ?? null); }
  async putUser(value: User) { this.upsert(this.data.users, value); }
  async getCourse(id: string): Promise<Course | null> { return copy(this.data.courses.find(x => x.id === id) ?? null); }
  async listCourses(): Promise<Course[]> { return copy(this.data.courses.sort((a,b) => a.code.localeCompare(b.code))); }
  async putCourse(value: Course) { this.upsert(this.data.courses, normalized(value)); }
  async updateCourseDetails(value: Course, expected: Course) { const current = this.data.courses.find(x => x.id === value.id); if (!current || ['code', 'title', 'term', 'description', 'welcome'].some(key => current[key as keyof Course] !== expected[key as keyof Course])) return false; Object.assign(current, { code: value.code, title: value.title, term: value.term, description: value.description, welcome: value.welcome }); return true; }
  async listEnrollments(filter: { courseId?: string; userId?: string }): Promise<Enrollment[]> {
    return copy(this.data.enrollments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.userId || x.userId === filter.userId)).sort((a,b) => a.courseId.localeCompare(b.courseId) || a.userId.localeCompare(b.userId)));
  }
  async setEnrollments(courseId: string, userIds: string[]) {
    this.data.enrollments = this.data.enrollments.filter(x => x.courseId !== courseId);
    this.data.enrollments.push(...[...new Set(userIds)].map(userId => ({ courseId, userId })));
  }
  async addEnrollment(courseId: string, userId: string) {
    if (!this.data.enrollments.some(x => x.courseId === courseId && x.userId === userId)) this.data.enrollments.push({ courseId, userId });
  }
  async getModule(id: string): Promise<Module | null> { return copy(this.data.modules.find(x => x.id === id) ?? null); }
  async listModules(courseId: string): Promise<Module[]> { return copy(this.data.modules.filter(x => x.courseId === courseId).sort(byPosition)); }
  async putModule(value: Module) { this.upsert(this.data.modules, normalized(value)); }
  async deleteModule(id: string) { this.data.modules = this.data.modules.filter(x => x.id !== id); }
  async getLesson(id: string): Promise<Lesson | null> { return copy(this.data.lessons.find(x => x.id === id) ?? null); }
  async listLessons(filter: { courseId?: string; moduleId?: string }): Promise<Lesson[]> {
    const positions = new Map(this.data.modules.map(x => [x.id, x.position]));
    return copy(this.data.lessons.filter(x => !x.variantOf && (!filter.courseId || x.courseId === filter.courseId) && (!filter.moduleId || x.moduleId === filter.moduleId))
      .sort((a,b) => (positions.get(a.moduleId) ?? 0) - (positions.get(b.moduleId) ?? 0) || a.position - b.position || cmp(a.id, b.id)));
  }
  async putLesson(value: Lesson) {
    if (value.variantOf) {
      if (!this.data.lessons.some(x => x.id === value.variantOf!.lessonId)) throw new Error('Unknown master lesson');
      if (this.data.lessons.some(x => x.id !== value.id && x.variantOf?.lessonId === value.variantOf!.lessonId && x.variantOf.audience === value.variantOf!.audience)) throw new Error('Duplicate variant audience');
    }
    this.upsert(this.data.lessons, normalized(value));
  }
  async deleteLesson(id: string) {
    const ids = new Set([id]);
    let found = true;
    while (found) {
      found = false;
      for (const lesson of this.data.lessons) if (lesson.variantOf && ids.has(lesson.variantOf.lessonId) && !ids.has(lesson.id)) { ids.add(lesson.id); found = true; }
    }
    this.data.lessons = this.data.lessons.filter(x => !ids.has(x.id));
    this.data.blocks = this.data.blocks.filter(x => !ids.has(x.lessonId));
    this.data.progress = this.data.progress.filter(x => !ids.has(x.lessonId));
  }
  async getBlock(id: string): Promise<Block | null> { return copy(this.data.blocks.find(x => x.id === id) ?? null); }
  async listBlocks(lessonId: string): Promise<Block[]> { return copy(this.data.blocks.filter(x => x.lessonId === lessonId).sort(byPosition)); }
  async replaceBlocks(lessonId: string, blocks: Block[]) {
    this.data.blocks = this.data.blocks.filter(x => x.lessonId !== lessonId);
    this.data.blocks.push(...blocks.map(normalized));
  }
  async putBlock(value: Block) { this.upsert(this.data.blocks, normalized(value)); }
  async deleteBlock(id: string) { this.data.blocks = this.data.blocks.filter(x => x.id !== id); }
  async getAssignment(id: string): Promise<Assignment | null> { return copy(this.data.assignments.find(x => x.id === id) ?? null); }
  async listAssignments(filter: { courseId?: string; moduleId?: string }): Promise<Assignment[]> {
    const positions = new Map(this.data.modules.map(x => [x.id, x.position]));
    return copy(this.data.assignments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.moduleId || x.moduleId === filter.moduleId))
      .sort((a,b) => (positions.get(a.moduleId) ?? 0) - (positions.get(b.moduleId) ?? 0) || a.position - b.position || a.id.localeCompare(b.id)));
  }
  async putAssignment(value: Assignment) { this.upsert(this.data.assignments, value); }
  async deleteAssignment(id: string) { this.data.assignments = this.data.assignments.filter(x => x.id !== id); this.data.submissions = this.data.submissions.filter(x => x.assignmentId !== id); }
  async getSubmission(id: string): Promise<Submission | null> { return copy(this.data.submissions.find(x => x.id === id) ?? null); }
  async listSubmissions(filter: { assignmentId?: string; studentId?: string }): Promise<Submission[]> {
    return copy(this.data.submissions.filter(x => (!filter.assignmentId || x.assignmentId === filter.assignmentId) && (!filter.studentId || x.studentId === filter.studentId))
      .sort((a,b) => a.studentId.localeCompare(b.studentId) || b.attempt - a.attempt || b.submittedAt.localeCompare(a.submittedAt)));
  }
  async putSubmission(value: Submission) { this.upsert(this.data.submissions, value); }
  async getTutorSetting(kind: ActivityKind, id: string) { return copy(this.data.tutorSettings.find(x => x.activityKind === kind && x.activityId === id) ?? null); }
  async putTutorSetting(value: TutorSetting) {
    const i = this.data.tutorSettings.findIndex(x => x.activityKind === value.activityKind && x.activityId === value.activityId);
    if (i < 0) this.data.tutorSettings.push(copy(value)); else this.data.tutorSettings[i] = copy(value);
  }
  async getTutorSession(id: string) { return copy(this.data.tutorSessions.find(x => x.id === id) ?? null); }
  async listTutorSessions(filter: { courseId?: string; studentId?: string; activityKind?: ActivityKind; activityId?: string }) {
    return copy(this.data.tutorSessions.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.studentId || x.studentId === filter.studentId) && (!filter.activityKind || x.activityKind === filter.activityKind) && (!filter.activityId || x.activityId === filter.activityId)).sort((a,b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)));
  }
  async putTutorSession(value: StoredTutorSession) { this.upsert(this.data.tutorSessions, value); }
  async getAnnouncement(id: string): Promise<StoredAnnouncement | null> { return copy(this.data.announcements.find(x => x.id === id) ?? null); }
  async listAnnouncements(filter: { courseIds?: string[] }): Promise<StoredAnnouncement[]> {
    return copy(this.data.announcements.filter(x => !filter.courseIds || filter.courseIds.includes(x.courseId)).sort(byNewest));
  }
  async putAnnouncement(value: StoredAnnouncement) { this.upsert(this.data.announcements, value); }
  async deleteAnnouncement(id: string) {
    this.data.announcements = this.data.announcements.filter(x => x.id !== id);
    this.data.reads = this.data.reads.filter(x => x.announcementId !== id);
  }
  async listReads(filter: { userId?: string; announcementId?: string }): Promise<AnnouncementRead[]> {
    return copy(this.data.reads.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.announcementId || x.announcementId === filter.announcementId)));
  }
  async putRead(value: AnnouncementRead) {
    if (!this.data.reads.some(x => x.userId === value.userId && x.announcementId === value.announcementId)) this.data.reads.push(copy(value));
  }
  async getProgress(userId: string, lessonId: string): Promise<StoredProgress | null> { return copy(this.data.progress.find(x => x.userId === userId && x.lessonId === lessonId) ?? null); }
  async listProgress(filter: { userId?: string; lessonIds?: string[] }): Promise<StoredProgress[]> {
    return copy(this.data.progress.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.lessonIds || filter.lessonIds.includes(x.lessonId))));
  }
  async putProgress(value: StoredProgress) {
    const i = this.data.progress.findIndex(x => x.userId === value.userId && x.lessonId === value.lessonId);
    if (i < 0) this.data.progress.push(copy(value)); else this.data.progress[i] = copy(value);
  }
  async getAdaptation(id: string): Promise<Adaptation | null> { return copy(this.data.adaptations.find(x => x.id === id) ?? null); }
  async listAdaptations(studentId: string): Promise<Adaptation[]> {
    return copy(this.data.adaptations.filter(x => x.studentId === studentId).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt) || b.id.localeCompare(a.id)));
  }
  async putAdaptation(value: Adaptation): Promise<void> { this.upsert(this.data.adaptations, value); }
  async putUserWithAdaptations(value: User, adaptations: Adaptation[]): Promise<void> {
    this.upsert(this.data.users, value);
    for (const adaptation of adaptations) this.upsert(this.data.adaptations, adaptation);
  }
  async getBuilderSession(id: string): Promise<BuilderSession | null> { return copy(this.data.builderSessions.find(x => x.id === id) ?? null); }
  async listBuilderSessions(courseId: string): Promise<BuilderSession[]> { return copy(this.data.builderSessions.filter(x => x.courseId === courseId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))); }
  async putBuilderSession(value: BuilderSession) { this.upsert(this.data.builderSessions, value); }
  async getDesignSession(id: string): Promise<DesignSession | null> { const row = copy(this.data.designSessions!.find(x => x.id === id) ?? null); return row && normalizeDesignSession(row); }
  async listDesignSessions(courseId: string): Promise<DesignSession[]> { return copy(this.data.designSessions!.filter(x => x.courseId === courseId).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || cmp(a.id,b.id))).map(normalizeDesignSession); }
  async putDesignSession(value: DesignSession) { this.upsert(this.data.designSessions!, value); }
  async claimDesignOptions(value: DesignSession, job: GenerationJob, expectedStage: 'read' | 'approaches', previousJobId: string) {
    const current = this.data.designSessions!.find(x => x.id === value.id);
    const previous = this.data.generationJobs.find(x => x.id === previousJobId);
    if (!current || current.stage !== expectedStage || current.provisioning?.jobId !== previousJobId || (expectedStage === 'approaches' && (current.options || previous?.state !== 'failed')) || this.data.generationJobs.some(x => x.id === job.id)) return false;
    this.upsert(this.data.designSessions!, value); this.upsert(this.data.generationJobs, job); return true;
  }
  async saveDesignOptions(id: string, jobId: string, value: DesignSession) {
    const current = this.data.designSessions!.find(x => x.id === id);
    const job = this.data.generationJobs.find(x => x.id === jobId);
    if (current?.stage !== 'approaches' || current.provisioning?.jobId !== jobId || current.options !== null || job?.state !== 'running') return false;
    this.upsert(this.data.designSessions!, value); return true;
  }
  async failSupersededDesignJob(jobId: string, message: string) {
    const job = this.data.generationJobs.find(x => x.id === jobId);
    if (job?.state === 'running') { job.state = 'failed'; job.error = message; }
  }
  async finishDesignUndo(id: string, revision: string, value: DesignSession) { const current = this.data.designSessions!.find(x => x.id === id); if (current?.stage !== 'undoing' || current.applyRevision !== revision) return false; this.upsert(this.data.designSessions!, value); return true; }
  async revertDesignPreview(id: string) { const s = this.data.designSessions!.find(x => x.id === id); if (s?.stage !== 'preview') return false; s.stage = 'approaches'; s.selection = null; s.plan = null; return true; }
  async saveDesignPoints(id: string, values: Record<string, number>) { const s = this.data.designSessions!.find(x => x.id === id); if (s?.stage !== 'preview') return false; s.confirmedPoints = copy(values); s.plan = null; return true; }
  async saveDesignPreview(id: string, expectedPoints: Record<string, number>, plan: DesignSession['plan'], updatedAt: string) { const s = this.data.designSessions!.find(x => x.id === id); if (s?.stage !== 'preview' || JSON.stringify(s.confirmedPoints ?? {}) !== JSON.stringify(expectedPoints)) return false; s.plan = copy(plan); s.record.plan = copy(plan); s.updatedAt = updatedAt; return true; }
  async claimDesignApply(value: DesignSession) { const current = this.data.designSessions!.find(x => x.id === value.id); if (current?.stage !== 'preview' || !current.plan?.hash || current.plan.hash !== value.plan?.hash || JSON.stringify(current.confirmedPoints ?? {}) !== JSON.stringify(value.confirmedPoints ?? {})) return false; this.upsert(this.data.designSessions!, value); return true; }
  private activeDesign(id: string, revision: string) { const s = this.data.designSessions!.find(x => x.id === id); return s?.stage === 'provisioning' && s.applyRevision === revision ? s : null; }
  private undoOwns(sessionId: string, revision: string, collection: keyof DesignSession['created'], id: string) { const s = this.data.designSessions!.find(x => x.id === sessionId); return s?.stage === 'undoing' && s.applyRevision === revision && s.created[collection].includes(id); }
  async putDesignModule(id: string, revision: string, key: string, value: Module) {
    const s = this.activeDesign(id, revision); if (!s || s.courseId !== value.courseId || !this.data.courses.some(c => c.id === value.courseId) || this.data.modules.some(m => m.id === value.id)) return false;
    const position = Math.max(-1, ...this.data.modules.filter(m => m.courseId === value.courseId).map(m => m.position)) + 1;
    this.upsert(this.data.modules, normalized({ ...value, position })); s.created.moduleIds.push(value.id); s.planIds!.modules[key] = value.id; if (s.plan) { const planned = s.plan.modules.find(m => m.key === key); if (planned) planned.position = position; } return true;
  }
  async putDesignLesson(id: string, revision: string, key: string, value: Lesson) {
    const s = this.activeDesign(id, revision); if (!s || s.courseId !== value.courseId || this.data.lessons.some(l => l.id === value.id) || !this.data.modules.some(m => m.id === value.moduleId && m.courseId === value.courseId)) return false;
    const position = Math.max(-1, ...this.data.lessons.filter(l => l.moduleId === value.moduleId).map(l => l.position)) + 1;
    this.upsert(this.data.lessons, normalized({ ...value, position })); s.created.lessonIds.push(value.id); s.planIds!.lessons[key] = value.id; return true;
  }
  async putDesignAssignment(id: string, revision: string, key: string, value: Assignment, outcomeIds: string[]) {
    const s = this.activeDesign(id, revision); if (!s || s.courseId !== value.courseId || this.data.assignments.some(a => a.id === value.id) || !this.data.modules.some(m => m.id === value.moduleId && m.courseId === value.courseId) || outcomeIds.some(oid => !this.data.outcomes!.some(o => o.id === oid && o.courseId === value.courseId)) || value.instructions.some(b => b.lessonId !== value.id || this.data.blocks.some(existing => existing.id === b.id))) return false;
    this.upsert(this.data.assignments, value); s.created.assignmentIds.push(value.id); s.created.blockIds.push(...value.instructions.map(b => b.id)); s.planIds!.assignments[key] = value.id;
    for (const outcomeId of outcomeIds) { this.data.outcomeLinks!.push({ targetKind: 'assignment', targetId: value.id, outcomeId }); s.created.linkKeys.push(`assignment:${value.id}:${outcomeId}`); }
    return true;
  }
  async appendDesignOutcome(id: string, revision: string, value: Outcome) {
    const s = this.activeDesign(id, revision), c = this.data.courses.find(x => x.id === value.courseId); if (!s || !c || this.data.outcomes!.some(o => o.id === value.id) || this.data.outcomes!.filter(o => o.courseId === value.courseId).length >= 30) return false;
    const position = Math.max(-1, ...this.data.outcomes!.filter(o => o.courseId === value.courseId).map(o => o.position)) + 1;
    this.data.outcomes!.push({ ...copy(value), code: `O${position + 1}`, position }); s.created.outcomeIds.push(value.id); s.planIds!.outcomes[value.code] = value.id; return true;
  }
  async appendDesignOutcomes(id: string, revision: string, values: Outcome[]) {
    const s = this.activeDesign(id, revision), c = s && this.data.courses.find(x => x.id === s.courseId);
    if (!s || !c || new Set(values.map(v => v.id)).size !== values.length || values.some(v => v.courseId !== c.id || this.data.outcomes!.some(o => o.id === v.id)) || this.data.outcomes!.filter(o => o.courseId === c.id).length + values.length > 30) return null;
    const start = Math.max(-1, ...this.data.outcomes!.filter(o => o.courseId === c.id).map(o => o.position)) + 1;
    const inserted = values.map((v, i) => ({ ...copy(v), code: `O${start + i + 1}`, position: start + i }));
    this.data.outcomes!.push(...inserted);
    for (const [i, v] of values.entries()) { s.created.outcomeIds.push(v.id); s.planIds!.outcomes[v.code] = v.id; }
    return copy(inserted);
  }
  async resetDesignCapacityFailure(id: string, revision: string, message: string) { const s = this.activeDesign(id,revision); if (!s || s.created.outcomeIds.length || s.created.moduleIds.length || !s.provisioning) return false; s.stage = 'preview'; s.provisioning.error = message; return true; }
  async saveDesignAppliedPlan(id: string, revision: string, plan: DesignSession['plan'], codeMap: Record<string, string>, outcomeIdsByCode: Record<string, string>) { const s = this.activeDesign(id, revision); if (!s || Object.values(outcomeIdsByCode).some(oid => !s.created.outcomeIds.includes(oid))) return false; s.plan = copy(plan); s.record.plan = copy(plan); s.outcomeCodeMap = copy(codeMap); s.planIds!.outcomes = copy(outcomeIdsByCode); return true; }
  async cancelDesignApply(id: string, revision: string, nextRevision: string) {
    const s = this.data.designSessions!.find(x => x.id === id && (x.stage === 'provisioning' || x.stage === 'review') && (x.applyRevision ?? `legacy-${x.id}`) === revision); if (!s) return false;
    s.legacyApply = !s.applyRevision || s.legacyApply === true; s.applyRevision = nextRevision; s.stage = 'undoing';
    const job = this.data.generationJobs.find(j => j.id === s.provisioning?.jobId); if (job?.state === 'running') { job.state = 'failed'; job.error = 'Provisioning was undone.'; }
    return true;
  }
  async stopLegacyDesignJob(id: string, jobId: string, message: string) {
    const s = this.data.designSessions!.find(x => x.id === id), job = this.data.generationJobs.find(j => j.id === jobId);
    if (!s || s.stage !== 'provisioning' || s.applyRevision || s.provisioning?.jobId !== jobId || !job || job.state !== 'running') return false;
    s.legacyApply = true; s.provisioning.error = message; job.state = 'failed'; job.error = message; return true;
  }
  async stopDesignJob(id: string, jobId: string, message: string) {
    const s = this.data.designSessions!.find(x => x.id === id), job = this.data.generationJobs.find(j => j.id === jobId);
    if (!s || s.provisioning?.jobId !== jobId || !job || job.state !== 'running') return false;
    s.provisioning.error = message; job.state = 'failed'; job.error = message; return true;
  }
  async appendDesignDecision(id: string, decision: DesignSession['record']['decisions'][number]) {
    const s = this.data.designSessions!.find(x => x.id === id);
    if (!s) return false;
    s.record.decisions.push(copy(decision)); s.updatedAt = decision.at; return true;
  }
  async startDesignJob(id: string, revision: string, job: GenerationJob) { if (!this.activeDesign(id,revision) || this.data.generationJobs.some(j => j.id === job.id)) return false; this.upsert(this.data.generationJobs,job); return true; }
  async setDesignRunner(id: string, revision: string, jobId: string, runner: 'poll' | 'workflow') { const s = this.activeDesign(id,revision), j = this.data.generationJobs.find(x => x.id === jobId); if (!s || s.provisioning?.jobId !== jobId || !j || j.state !== 'running') return false; j.runner = runner; return true; }
  async setDesignApplyError(id: string, revision: string, message: string) { const s = this.activeDesign(id,revision); if (!s?.provisioning) return false; s.provisioning.error = message; return true; }
  async commitDesignScaffold(id: string, revision: string, expected: GenerationJob, next: GenerationJob, lesson: Lesson | null, blocks: Block[], outcomeIds: string[], nextSession: DesignSession) {
    const s = this.activeDesign(id, revision), job = this.data.generationJobs.find(j => j.id === expected.id);
    if (!s || !job || job.done !== expected.done || (job.runner ?? 'poll') !== (expected.runner ?? 'poll') || job.state !== 'running' || s.provisioning?.jobId !== job.id || outcomeIds.some(oid => !this.data.outcomes!.some(o => o.id === oid && o.courseId === s.courseId)) || blocks.some(b => !lesson || b.lessonId !== lesson.id)) return false;
    if (lesson) {
      const current = this.data.lessons.find(l => l.id === lesson.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(normalized(lesson)) || this.data.blocks.some(b => b.lessonId === lesson.id || blocks.some(newBlock => newBlock.id === b.id)) || this.data.lessons.some(l => l.variantOf?.lessonId === lesson.id)) return false;
      this.data.blocks.push(...blocks.map(normalized));
      for (const b of blocks) for (const outcomeId of (b.type === 'check' || b.type === 'scenario' ? outcomeIds : [])) this.data.outcomeLinks!.push({ targetKind: 'block', targetId: b.id, outcomeId });
      s.created.blockIds.push(...blocks.map(b => b.id)); s.createdBlocks = { ...s.createdBlocks, ...Object.fromEntries(blocks.map(b => [b.id, copy(b)])) }; s.created.linkKeys.push(...blocks.flatMap(b => b.type === 'check' || b.type === 'scenario' ? outcomeIds.map(oid => `block:${b.id}:${oid}`) : []));
    }
    s.stage = nextSession.stage; s.provisioning = copy(nextSession.provisioning); s.updatedAt = nextSession.updatedAt;
    this.upsert(this.data.generationJobs, next); return true;
  }
  async appendDesignAlternatives(id: string, revision: string, lessonId: string, blocks: Block[]) {
    const s = this.data.designSessions!.find(x => x.id === id);
    if (!s || s.applyRevision !== revision || s.stage !== 'review' || !s.created.lessonIds.includes(lessonId) || !this.data.lessons.some(l => l.id === lessonId)) return false;
    if (this.data.blocks.some(b => blocks.some(newBlock => newBlock.id === b.id) || b.lessonId === lessonId && b.type === 'document' && /^Alternative opening [AB]$/.test(b.title))) return false;
    const position = Math.max(-1, ...this.data.blocks.filter(b => b.lessonId === lessonId).map(b => b.position)) + 1;
    const inserted = blocks.map((b, i) => normalized({ ...b, position: position + i }));
    this.data.blocks.push(...inserted); s.created.blockIds.push(...blocks.map(b => b.id)); s.createdBlocks = { ...s.createdBlocks, ...Object.fromEntries(inserted.map(b => [b.id, copy(b)])) }; return true;
  }
  async deleteDesignBlockIfDraft(sessionId: string, revision: string, expected: Block, expectedOutcomeIds: string[]) {
    const b = this.data.blocks.find(x => x.id === expected.id);
    const links = this.data.outcomeLinks!.filter(x => x.targetKind === 'block' && x.targetId === expected.id).map(x => x.outcomeId).sort();
    if (!this.undoOwns(sessionId, revision, 'blockIds', expected.id) || !b || b.aiState !== 'draft' || b.previous !== null || JSON.stringify(b) !== JSON.stringify(normalized(expected)) || JSON.stringify(links) !== JSON.stringify([...expectedOutcomeIds].sort())) return false;
    this.data.blocks = this.data.blocks.filter(x => x.id !== b.id); this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => x.targetKind !== 'block' || x.targetId !== b.id); return true;
  }
  async deleteDesignAssignmentIfUnchanged(sessionId: string, revision: string, expected: Assignment, expectedOutcomeIds: string[]) {
    const a = this.data.assignments.find(x => x.id === expected.id);
    const links = this.data.outcomeLinks!.filter(x => x.targetKind === 'assignment' && x.targetId === expected.id).map(x => x.outcomeId).sort();
    if (!this.undoOwns(sessionId, revision, 'assignmentIds', expected.id) || !a || JSON.stringify(a) !== JSON.stringify(expected) || this.data.submissions.some(x => x.assignmentId === a.id) || JSON.stringify(links) !== JSON.stringify([...expectedOutcomeIds].sort())) return false;
    this.data.assignments = this.data.assignments.filter(x => x.id !== a.id); this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => x.targetKind !== 'assignment' || x.targetId !== a.id); return true;
  }
  async deleteDesignLessonIfUnchanged(sessionId: string, revision: string, expected: Lesson) {
    const l = this.data.lessons.find(x => x.id === expected.id);
    if (!this.undoOwns(sessionId, revision, 'lessonIds', expected.id) || !l || JSON.stringify(l) !== JSON.stringify(normalized(expected)) || this.data.blocks.some(x => x.lessonId === l.id) || this.data.lessons.some(x => x.variantOf?.lessonId === l.id) || this.data.progress.some(x => x.lessonId === l.id)) return false;
    this.data.lessons = this.data.lessons.filter(x => x.id !== l.id); return true;
  }
  async deleteDesignModuleIfUnchanged(sessionId: string, revision: string, expected: Module) {
    const m = this.data.modules.find(x => x.id === expected.id);
    if (!this.undoOwns(sessionId, revision, 'moduleIds', expected.id) || !m || JSON.stringify(m) !== JSON.stringify(normalized(expected)) || this.data.lessons.some(x => x.moduleId === m.id) || this.data.assignments.some(x => x.moduleId === m.id)) return false;
    this.data.modules = this.data.modules.filter(x => x.id !== m.id); return true;
  }
  async deleteDesignOutcomeIfUnused(sessionId: string, revision: string, id: string, text: string) {
    const o = this.data.outcomes!.find(x => x.id === id), c = o && this.data.courses.find(x => x.id === o.courseId);
    if (!this.undoOwns(sessionId, revision, 'outcomeIds', id) || !o || !c || o.aiState !== 'draft' || o.text !== text || this.data.outcomeLinks!.some(x => x.outcomeId === id)) return false;
    const mirrored = JSON.stringify(c.outcomes) === JSON.stringify(this.data.outcomes!.filter(x => x.courseId === o.courseId && x.aiState !== 'draft').sort(byPosition).map(x => x.text));
    this.data.outcomes = this.data.outcomes!.filter(x => x.id !== id);
    if (mirrored) c.outcomes = this.data.outcomes!.filter(x => x.courseId === o.courseId && x.aiState !== 'draft').sort(byPosition).map(x => x.text);
    return true;
  }
  async getInstructorProfile(userId: string): Promise<InstructorProfile | null> { return copy(this.data.instructorProfiles!.find(x => x.userId === userId) ?? null); }
  async putInstructorProfile(value: InstructorProfile) { const rows = this.data.instructorProfiles!; const i = rows.findIndex(x => x.userId === value.userId); if (i < 0) rows.push(copy(value)); else rows[i] = copy(value); }
  async getGenerationJob(id: string): Promise<GenerationJob | null> { return copy(this.data.generationJobs.find(x => x.id === id) ?? null); }
  async putGenerationJob(value: GenerationJob) { const job = normalized(value); if (job.kind === 'generate') delete job.kind; this.upsert(this.data.generationJobs, job); }
  // Like D1Repo, a file's `scan` is derived from its latest stored scan.
  private withScan(f: FileRecord): FileRecord {
    const s = this.data.scans.filter(x => x.target.kind === 'file' && x.target.fileId === f.id).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];
    return copy({ ...f, visibility: f.visibility ?? 'course', scan: s ? { score: s.score, grade: s.grade, issueCount: s.issueCount, bySeverity: s.bySeverity, scannedAt: s.scannedAt } : null });
  }
  async getFile(id: string) { const f = this.data.files.find(x => x.id === id); return f ? this.withScan(f) : null; }
  async listFiles(courseId: string) { return this.data.files.filter(x => x.courseId === courseId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id)).map(f => this.withScan(f)); }
  async putFile(file: FileRecord) { this.upsert(this.data.files, file); }
  async deleteFile(id: string) {
    this.data.files = this.data.files.filter(x => x.id !== id);
    this.data.fileVersions = this.data.fileVersions.filter(x => x.fileId !== id);
    this.data.formats = this.data.formats.filter(x => x.fileId !== id);
    this.data.scans = this.data.scans.filter(x => !(x.target.kind === 'file' && x.target.fileId === id));
  }
  async putFileVersion(v: FileVersion) { const i = this.data.fileVersions.findIndex(x => x.fileId === v.fileId && x.version === v.version); if (i < 0) this.data.fileVersions.push(copy(v)); else this.data.fileVersions[i] = copy(v); }
  async listFileVersions(fileId: string) { return copy(this.data.fileVersions.filter(x => x.fileId === fileId).sort((a, b) => a.version - b.version)); }
  async putScan(scan: StoredScan) { this.upsert(this.data.scans, scan); }
  async latestScan(targetKind: 'lesson' | 'file', targetId: string) {
    const list = this.data.scans.filter(s => s.target.kind === targetKind && (s.target.kind === 'lesson' ? s.target.lessonId : s.target.fileId) === targetId).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
    return list[0] ? copy(list[0]) : null;
  }
  async listScans(filter: { courseId?: string; targetKind?: 'lesson' | 'file'; since?: string }) {
    return copy(this.data.scans.filter(s => (!filter.courseId || s.courseId === filter.courseId) && (!filter.targetKind || s.target.kind === filter.targetKind) && (!filter.since || s.scannedAt >= filter.since)).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)));
  }
  async getFormat(fileId: string, version: number, format: AccessibleFormat) { const f = this.data.formats.find(x => x.fileId === fileId && x.version === version && x.format === format); return f ? copy(f) : null; }
  async listFormats(fileId: string, version: number) { return copy(this.data.formats.filter(x => x.fileId === fileId && x.version === version)); }
  async putFormat(f: StoredFormat) { const i = this.data.formats.findIndex(x => x.fileId === f.fileId && x.version === f.version && x.format === f.format); if (i < 0) this.data.formats.push(copy(f)); else this.data.formats[i] = copy(f); }
  async getApiTokenByHash(hash: string) { const t = this.data.apiTokens.find(x => x.hash === hash); return t ? copy(t) : null; }
  async listApiTokens(ownerId: string) { return copy(this.data.apiTokens.filter(x => x.ownerId === ownerId)); }
  async putApiToken(token: ApiToken & { hash: string }) { this.upsert(this.data.apiTokens, token); }
  async touchApiToken(id: string, usedAt: string) { const t = this.data.apiTokens.find(x => x.id === id); if (t) t.lastUsedAt = usedAt; }
  async getInvitation(userId: string) { return copy(this.data.invitations.find(x => x.userId === userId) ?? null); }
  async getInvitationByEmail(email: string) { return copy(this.data.invitations.find(x => x.email.toLowerCase() === email.toLowerCase()) ?? null); }
  async listInvitations() { return copy(this.data.invitations.sort((a, b) => b.invitedAt.localeCompare(a.invitedAt) || a.userId.localeCompare(b.userId))); }
  async putInvitation(value: Invitation) {
    const i = this.data.invitations.findIndex(x => x.userId === value.userId);
    if (i < 0) this.data.invitations.push(copy(value));
    else this.data.invitations[i] = copy({ ...value, acceptedAt: this.data.invitations[i].acceptedAt ?? value.acceptedAt });
  }
  async acceptInvitation(userId: string, at: string) { const invitation = this.data.invitations.find(x => x.userId === userId); if (invitation && !invitation.acceptedAt) invitation.acceptedAt = at; }
  async hasInvitations() { return this.data.invitations.length > 0; }
  async listVariantLessons(masterLessonId: string) { return copy(this.data.lessons.filter(x => x.variantOf?.lessonId === masterLessonId).sort((a, b) => cmp(a.variantOf!.audience, b.variantOf!.audience) || cmp(a.id, b.id))); }
  async getProgram(id: string) { return copy(this.data.programs!.find(x => x.id === id) ?? null); }
  async listPrograms() { return copy([...this.data.programs!].sort((a, b) => byName(a, b) || cmp(a.id, b.id))); }
  async putProgram(value: Program) { this.upsert(this.data.programs!, value); }
  async deleteProgram(id: string) { this.data.programs = this.data.programs!.filter(x => x.id !== id); }
  async getTemplate(id: string) { return copy(this.data.templates!.find(x => x.id === id) ?? null); }
  async listTemplates() { return copy([...this.data.templates!].sort((a, b) => byName(a, b) || cmp(a.id, b.id))); }
  async putTemplate(value: CourseTemplate) { this.upsert(this.data.templates!, value); }
  async deleteTemplate(id: string) { this.data.templates = this.data.templates!.filter(x => x.id !== id); }
  async getRubric(id: string) { return copy(this.data.rubrics!.find(x => x.id === id) ?? null); }
  async listRubrics() { return copy([...this.data.rubrics!].sort((a, b) => byName(a, b) || cmp(a.id, b.id))); }
  async putRubric(value: Rubric) { this.upsert(this.data.rubrics!, { ...value, source: 'custom', builtIn: false }); }
  async deleteRubric(id: string) { this.data.rubrics = this.data.rubrics!.filter(x => x.id !== id); }
  async listReadinessItems(courseId: string, rubricId: string) { return copy(this.data.readinessItems!.filter(x => x.courseId === courseId && x.rubricId === rubricId).sort((a, b) => cmp(a.itemId, b.itemId))); }
  async putReadinessItem(value: StoredReadinessItem) {
    const rows = this.data.readinessItems!;
    const i = rows.findIndex(x => x.courseId === value.courseId && x.rubricId === value.rubricId && x.itemId === value.itemId);
    if (!value.finding && !value.attestation) { if (i >= 0) rows.splice(i, 1); }
    else {
      if (!this.data.courses.some(x => x.id === value.courseId)) throw new Error('Unknown course id');
      if (i < 0) rows.push(copy(value)); else rows[i] = copy(value);
    }
  }
  async listOutcomes(courseId: string) { return copy(this.data.outcomes!.filter(x => x.courseId === courseId).sort((a, b) => a.position - b.position || cmp(a.id, b.id))); }
  async keepDesignOutcome(sessionId: string, outcomeId: string, expectedText: string, keeper: string, keptAt: string) {
    const s = this.data.designSessions!.find(x => x.id === sessionId);
    const o = this.data.outcomes!.find(x => x.id === outcomeId && x.courseId === s?.courseId);
    const c = this.data.courses.find(x => x.id === s?.courseId);
    if (!s || !['provisioning', 'review'].includes(s.stage) || !o || !c || !s.created.outcomeIds.includes(outcomeId) || o.aiState !== 'draft' || o.text !== expectedText) return false;
    delete o.aiState;
    if (o.provenance) o.provenance = { ...o.provenance, keptBy: keeper, keptAt };
    c.outcomes = this.data.outcomes!.filter(x => x.courseId === c.id && x.aiState !== 'draft').sort(byPosition).map(x => x.text);
    return true;
  }
  async keepOutcome(courseId: string, outcomeId: string, expectedText: string, keeper: string, keptAt: string) {
    const o = this.data.outcomes!.find(x => x.id === outcomeId && x.courseId === courseId && x.aiState === 'draft' && x.text === expectedText);
    const c = this.data.courses.find(x => x.id === courseId);
    if (!o || !c) return false;
    delete o.aiState;
    if (o.provenance) o.provenance = { ...o.provenance, keptBy: keeper, keptAt };
    c.outcomes = this.data.outcomes!.filter(x => x.courseId === courseId && x.aiState !== 'draft').sort(byPosition).map(x => x.text);
    return true;
  }
  async replaceOutcomes(courseId: string, outcomes: Outcome[]) {
    if (outcomes.some(x => !this.data.courses.some(c => c.id === x.courseId))) throw new Error('Unknown course id');
    const removed = new Set(this.data.outcomes!.filter(x => x.courseId === courseId && !outcomes.some(y => y.id === x.id)).map(x => x.id));
    const inserted = new Set(outcomes.map(x => x.id));
    this.data.outcomes = this.data.outcomes!.filter(x => x.courseId !== courseId && !inserted.has(x.id)).concat(copy(outcomes));
    this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => !removed.has(x.outcomeId));
  }
  async replaceOutcomesIfUnchanged(courseId: string, expected: Outcome[], outcomes: Outcome[]) {
    const current = copy(this.data.outcomes!.filter(x => x.courseId === courseId).sort(byPosition));
    if (JSON.stringify(current) !== JSON.stringify(expected) || !this.data.courses.some(c => c.id === courseId) || outcomes.some(item => item.courseId !== courseId)) return false;
    const removed = new Set(current.filter(x => !outcomes.some(y => y.id === x.id)).map(x => x.id));
    const inserted = new Set(outcomes.map(x => x.id));
    this.data.outcomes = this.data.outcomes!.filter(x => x.courseId !== courseId && !inserted.has(x.id)).concat(copy(outcomes));
    this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => !removed.has(x.outcomeId));
    const course = this.data.courses.find(c => c.id === courseId)!;
    course.outcomes = outcomes.filter(item => item.aiState !== 'draft').sort(byPosition).map(item => item.text);
    return true;
  }
  async updateCourseAndOutcomesIfUnchanged(value: Course, expectedCourse: Course, expectedOutcomes: Outcome[], outcomes: Outcome[]) {
    const current = this.data.courses.find(course => course.id === value.id);
    if (!current || ['code', 'title', 'term', 'description', 'welcome'].some(key => current[key as keyof Course] !== expectedCourse[key as keyof Course])) return false;
    if (JSON.stringify(copy(this.data.outcomes!.filter(row => row.courseId === value.id).sort(byPosition))) !== JSON.stringify(expectedOutcomes) || outcomes.some(row => row.courseId !== value.id)) return false;
    const removed = new Set(expectedOutcomes.filter(row => !outcomes.some(next => next.id === row.id)).map(row => row.id));
    const inserted = new Set(outcomes.map(row => row.id));
    this.data.outcomes = this.data.outcomes!.filter(row => row.courseId !== value.id && !inserted.has(row.id)).concat(copy(outcomes));
    this.data.outcomeLinks = this.data.outcomeLinks!.filter(link => !removed.has(link.outcomeId));
    Object.assign(current, { code: value.code, title: value.title, term: value.term, description: value.description, welcome: value.welcome, outcomes: outcomes.filter(row => row.aiState !== 'draft').sort(byPosition).map(row => row.text) });
    return true;
  }
  async listOutcomeLinks(filter: { courseId?: string; targetKind?: AlignableKind; targetId?: string }) {
    const ids = filter.courseId ? new Set(this.data.outcomes!.filter(x => x.courseId === filter.courseId).map(x => x.id)) : null;
    return copy(this.data.outcomeLinks!.filter(x => (!ids || ids.has(x.outcomeId)) && (!filter.targetKind || x.targetKind === filter.targetKind) && (!filter.targetId || x.targetId === filter.targetId))
      .sort((a, b) => cmp(a.outcomeId, b.outcomeId) || cmp(a.targetKind, b.targetKind) || cmp(a.targetId, b.targetId)));
  }
  async setOutcomeLinks(targetKind: AlignableKind, targetId: string, outcomeIds: string[]) {
    if (outcomeIds.some(id => !this.data.outcomes!.some(x => x.id === id))) throw new Error('Unknown outcome id');
    this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => x.targetKind !== targetKind || x.targetId !== targetId);
    this.data.outcomeLinks.push(...[...new Set(outcomeIds)].map(outcomeId => ({ outcomeId, targetKind, targetId })));
  }
  async getRequirement(id: string) { return copy(this.data.requirements!.find(x => x.id === id) ?? null); }
  async listRequirements(filter?: { targetKind?: Requirement['target']['kind']; targetId?: string }) {
    return copy(this.data.requirements!.filter(x => (!filter?.targetKind || x.target.kind === filter.targetKind) && (!filter?.targetId || (x.target.kind === 'course' ? x.target.courseId : x.target.programId) === filter.targetId))
      .sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id)));
  }
  async putRequirement(value: Requirement) { this.upsert(this.data.requirements!, value); }
  async deleteRequirement(id: string) { this.data.requirements = this.data.requirements!.filter(x => x.id !== id); }
  async appendCompletionEvent(value: CompletionEvent) { if (this.data.completionEvents!.some(x => x.id === value.id)) throw new Error('Duplicate completion event id'); this.data.completionEvents!.push(copy(value)); }
  async listCompletionEvents(filter: { userId?: string; courseId?: string; since?: string }) {
    return copy(this.data.completionEvents!.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.courseId || x.courseId === filter.courseId) && (!filter.since || x.at >= filter.since))
      .sort((a, b) => cmp(a.at, b.at) || cmp(a.id, b.id)));
  }
  async getTestOut(courseId: string) { return copy(this.data.testOuts!.find(x => x.courseId === courseId) ?? null); }
  async putTestOut(value: TestOut) { if (!this.data.courses.some(x => x.id === value.courseId) || value.passPercent < 1 || value.passPercent > 100) throw new Error('Invalid test-out'); const i = this.data.testOuts!.findIndex(x => x.courseId === value.courseId); if (i < 0) this.data.testOuts!.push(copy(value)); else this.data.testOuts![i] = copy(value); }
  async deleteTestOut(courseId: string) { this.data.testOuts = this.data.testOuts!.filter(x => x.courseId !== courseId); }
  async putTestOutAttempt(value: TestOutAttempt) { if (value.percent < 0 || value.percent > 100) throw new Error('Invalid attempt percent'); this.upsert(this.data.testOutAttempts!, value); }
  async listTestOutAttempts(userId: string, courseId: string) { return copy(this.data.testOutAttempts!.filter(x => x.userId === userId && x.courseId === courseId).sort((a, b) => cmp(a.at, b.at) || cmp(a.id, b.id))); }
  async getCertificate(id: string) { return copy(this.data.certificates!.find(x => x.id === id) ?? null); }
  async getCertificateByCode(code: string) { return copy(this.data.certificates!.find(x => x.code === code) ?? null); }
  async listCertificates(filter: { userId?: string; courseId?: string }) { return copy(this.data.certificates!.filter(x => (!filter.userId || x.userId === filter.userId) && (!filter.courseId || x.courseId === filter.courseId)).sort((a, b) => cmp(b.issuedAt, a.issuedAt) || cmp(b.id, a.id))); }
  async insertCertificate(value: Certificate) { if (this.data.certificates!.some(x => x.id === value.id || x.code === value.code)) throw new Error('Duplicate certificate id or code'); this.data.certificates!.push(copy(value)); }
  async markCertificateReplaced(id: string, replacedBy: string) { const c = this.data.certificates!.find(x => x.id === id); if (!c || c.replacedBy !== null) throw new ApiError('conflict', 'Certificate is missing or already replaced.'); c.replacedBy = replacedBy; }
  async listReportingLines(filter: { managerId?: string; reportId?: string }) { return copy(this.data.reportingLines!.filter(x => (!filter.managerId || x.managerId === filter.managerId) && (!filter.reportId || x.reportId === filter.reportId)).sort((a, b) => cmp(a.managerId, b.managerId) || cmp(a.reportId, b.reportId))); }
  async putReportingLine(value: ReportingLine) { if (value.managerId === value.reportId) throw new Error('Manager cannot report to self'); const i = this.data.reportingLines!.findIndex(x => x.managerId === value.managerId && x.reportId === value.reportId); if (i < 0) this.data.reportingLines!.push(copy(value)); else this.data.reportingLines![i] = copy({ ...value, createdAt: this.data.reportingLines![i].createdAt }); }
  async deleteReportingLine(managerId: string, reportId: string) { this.data.reportingLines = this.data.reportingLines!.filter(x => x.managerId !== managerId || x.reportId !== reportId); this.data.managerConsents = this.data.managerConsents!.filter(x => x.managerId !== managerId || x.reportId !== reportId); }
  async listManagerConsents(filter: { managerId?: string; reportId?: string }) { return copy(this.data.managerConsents!.filter(x => (!filter.managerId || x.managerId === filter.managerId) && (!filter.reportId || x.reportId === filter.reportId)).sort((a, b) => cmp(a.managerId, b.managerId) || cmp(a.reportId, b.reportId))); }
  async putManagerConsent(value: ManagerConsent) { const i = this.data.managerConsents!.findIndex(x => x.managerId === value.managerId && x.reportId === value.reportId); if (i < 0) this.data.managerConsents!.push(copy(value)); else this.data.managerConsents![i] = copy(value); }
  async isEmpty(): Promise<boolean> { return this.data.users.length === 0; }
  async reset(seed: SeedData) { this.data = this.withNight3(seed); }
  private withNight3(seed: SeedData): SeedData & { readinessItems: StoredReadinessItem[] } {
    return copy({ ...seed, designSessions: seed.designSessions ?? [], instructorProfiles: seed.instructorProfiles ?? [], generationJobs: seed.generationJobs.map(job => { const clean = normalized(job); if (clean.kind === 'generate') delete clean.kind; return clean; }), programs: seed.programs ?? [], templates: seed.templates ?? [], rubrics: (seed.rubrics ?? []).map(r => ({ ...r, source: 'custom' as const, builtIn: false })), readinessItems: [],
      outcomes: seed.outcomes ?? seed.courses.flatMap(course => course.outcomes.flatMap((value, i) => value.trim() ? [{ id: `${course.id}-o${i + 1}`, courseId: course.id, code: `O${i + 1}`, text: value, position: i }] : [])),
      outcomeLinks: seed.outcomeLinks ?? [], requirements: seed.requirements ?? [], completionEvents: seed.completionEvents ?? [], testOuts: seed.testOuts ?? [], testOutAttempts: seed.testOutAttempts ?? [], certificates: seed.certificates ?? [], reportingLines: seed.reportingLines ?? [], managerConsents: seed.managerConsents ?? [] });
  }
  private upsert<T extends { id: string }>(items: T[], value: T) {
    const i = items.findIndex(x => x.id === value.id);
    if (i < 0) items.push(copy(value)); else items[i] = copy(value);
  }
}
