import type { Adaptation, Announcement, Assignment, Block, BuilderSession, Course, Institution, Invitation, Lesson, Module, Submission, User, ApiToken, FileRecord, AccessibleFormat, ActivityKind, TutorSetting, Program, CourseTemplate, Rubric, Outcome, OutcomeLink, AlignableKind, Requirement, CompletionEvent, TestOut, Certificate, ReportingLine, ManagerConsent } from '../domain';
import type { Repo, Enrollment, StoredAnnouncement, AnnouncementRead, StoredProgress, FileVersion, StoredScan, StoredFormat, GenerationJob, StoredTutorSession, StoredReadinessItem, TestOutAttempt } from '../repo';
import type { SeedData } from '../seed';
import { ApiError } from '../api';
import type { CourseGradeOverride, GradebookSetup, StudentItemState, GradeEvent } from '../domain';
import type { GradeBatch, GradeSnapshot, GradeWrite, GradeWriteResult } from '../repo';

declare const structuredClone: <T>(value: T) => T;
const copy = <T>(value: T): T => structuredClone(value);
/**
 * Night 3 optional fields are omitted when null, as D1 omits NULL columns, so both repos
 * return identical objects (including through `toEqual`).
 */
const OPTIONAL_NIGHT3 = ['templateId', 'readinessPolicy', 'programId', 'objective', 'templateKey', 'variantOf', 'source'] as const;
function normalized<T extends object>(value: T): T {
  const out = copy(value) as Record<string, unknown>;
  for (const key of OPTIONAL_NIGHT3) if (key in out && (out[key] === null || out[key] === undefined)) delete out[key];
  return out as T;
}
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const byName = (a: { name: string }, b: { name: string }) => cmp(a.name, b.name);
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const byNewest = (a: { publishedAt: string | null; createdAt: string }, b: { publishedAt: string | null; createdAt: string }) =>
  (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);

export class MemoryRepo implements Repo {
  private data: SeedData & { readinessItems: StoredReadinessItem[] };
  private gradebookSetups: GradebookSetup[] = [];
  private studentItemStates: StudentItemState[] = [];
  private finalOverrides: CourseGradeOverride[] = [];
  private gradeEvents: GradeEvent[] = [];
  private gradeBatches: GradeBatch[] = [];
  constructor(seed: SeedData) { this.data = this.withNight3(seed); this.loadGradebook(seed); }
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
  async listEnrollments(filter: { courseId?: string; userId?: string }): Promise<Enrollment[]> {
    return copy(this.data.enrollments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.userId || x.userId === filter.userId)).sort((a,b) => a.courseId.localeCompare(b.courseId) || a.userId.localeCompare(b.userId)));
  }
  async listCourseStudents(courseId:string):Promise<User[]>{const ids=new Set(this.data.enrollments.filter(e=>e.courseId===courseId).map(e=>e.userId));return copy(this.data.users.filter(u=>u.role==='student'&&ids.has(u.id)).sort((a,b)=>cmp(a.name,b.name)||cmp(a.id,b.id)));}
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
  async deleteModule(id: string) { const ids=new Set(this.data.assignments.filter(a=>a.moduleId===id).map(a=>a.id));if(this.data.submissions.some(s=>ids.has(s.assignmentId))||this.studentItemStates.some(s=>ids.has(s.assignmentId)))throw new ApiError('conflict','Module has grade history.');this.data.modules = this.data.modules.filter(x => x.id !== id); }
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
  async getAssignment(id: string): Promise<Assignment | null> { const a=this.data.assignments.find(x => x.id === id); return a ? {categoryId:null,extraCredit:false,countsTowardGrade:true,...copy(a)} : null; }
  async listAssignments(filter: { courseId?: string; moduleId?: string }): Promise<Assignment[]> {
    const positions = new Map(this.data.modules.map(x => [x.id, x.position]));
    return copy(this.data.assignments.filter(x => (!filter.courseId || x.courseId === filter.courseId) && (!filter.moduleId || x.moduleId === filter.moduleId))
      .sort((a,b) => (positions.get(a.moduleId) ?? 0) - (positions.get(b.moduleId) ?? 0) || a.position - b.position || a.id.localeCompare(b.id)).map(a=>({categoryId:null,extraCredit:false,countsTowardGrade:true,...a})));
  }
  async putAssignment(value: Assignment) { this.upsert(this.data.assignments, value); }
  async deleteAssignment(id: string) { if(this.data.submissions.some(s=>s.assignmentId===id)||this.studentItemStates.some(s=>s.assignmentId===id))throw new ApiError('conflict','Assignment has grade history.');this.data.assignments = this.data.assignments.filter(x => x.id !== id); }
  async getSubmission(id: string): Promise<Submission | null> { const s=this.data.submissions.find(x => x.id === id && !x.deleted); return s ? this.publicSubmission(s) : null; }
  private publicSubmission(s: Submission): Submission { return {id:s.id,assignmentId:s.assignmentId,studentId:s.studentId,attempt:s.attempt,state:s.state,text:s.text,fileId:s.fileId,link:s.link,submittedAt:s.submittedAt,grade:copy(s.grade),version:s.version??0,source:s.source??'student',feedbackDraft:copy(s.feedbackDraft??null),...(s.deleted ? {deleted:true} : {})}; }
  async listSubmissions(filter: { assignmentId?: string; studentId?: string; courseId?: string; includeDeleted?: boolean }): Promise<Submission[]> {
    const ids = filter.courseId ? new Set(this.data.assignments.filter(a => a.courseId === filter.courseId).map(a => a.id)) : null;
    return copy(this.data.submissions.filter(x => (filter.includeDeleted || !x.deleted) && (!filter.assignmentId || x.assignmentId === filter.assignmentId) && (!filter.studentId || x.studentId === filter.studentId) && (!ids || ids.has(x.assignmentId)))
      .sort((a,b) => a.studentId.localeCompare(b.studentId) || b.attempt - a.attempt || b.submittedAt.localeCompare(a.submittedAt)).map(s=>this.publicSubmission(s)));
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
  async getGenerationJob(id: string): Promise<GenerationJob | null> { return copy(this.data.generationJobs.find(x => x.id === id) ?? null); }
  async putGenerationJob(value: GenerationJob) { this.upsert(this.data.generationJobs, value); }
  // Like D1Repo, a file's `scan` is derived from its latest stored scan.
  private withScan(f: FileRecord): FileRecord {
    const s = this.data.scans.filter(x => x.target.kind === 'file' && x.target.fileId === f.id).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];
    return copy({ ...f, scan: s ? { score: s.score, grade: s.grade, issueCount: s.issueCount, bySeverity: s.bySeverity, scannedAt: s.scannedAt } : null });
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
  async replaceOutcomes(courseId: string, outcomes: Outcome[]) {
    if (outcomes.some(x => !this.data.courses.some(c => c.id === x.courseId))) throw new Error('Unknown course id');
    const removed = new Set(this.data.outcomes!.filter(x => x.courseId === courseId && !outcomes.some(y => y.id === x.id)).map(x => x.id));
    const inserted = new Set(outcomes.map(x => x.id));
    this.data.outcomes = this.data.outcomes!.filter(x => x.courseId !== courseId && !inserted.has(x.id)).concat(copy(outcomes));
    this.data.outcomeLinks = this.data.outcomeLinks!.filter(x => !removed.has(x.outcomeId));
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
  async getGradebookSetup(courseId: string) { return copy(this.gradebookSetups.find(x => x.courseId === courseId) ?? null); }
  async putGradebookSetup(value: GradebookSetup, expectedVersion: number, event: GradeEvent) { return this.applyGradeWrites([{ kind: 'setup', value, expectedVersion }], [event]); }
  async listStudentItemStates(filter: { courseId: string; studentId?: string; assignmentId?: string }) { return copy(this.studentItemStates.filter(x => x.courseId === filter.courseId && (!filter.studentId || x.studentId === filter.studentId) && (!filter.assignmentId || x.assignmentId === filter.assignmentId)).sort((a,b) => cmp(a.studentId,b.studentId) || cmp(a.assignmentId,b.assignmentId))); }
  async putStudentItemState(value: StudentItemState, expectedVersion: number, event: GradeEvent) { return this.applyGradeWrites([{ kind: 'state', value, expectedVersion }], [event]); }
  async getFinalOverride(courseId: string, studentId: string) { return copy(this.finalOverrides.find(x => x.courseId === courseId && x.studentId === studentId && (x.letter !== null || x.percent !== null)) ?? null); }
  async listFinalOverrides(courseId:string){return copy(this.finalOverrides.filter(x=>x.courseId===courseId && (x.letter !== null || x.percent !== null)).sort((a,b)=>cmp(a.studentId,b.studentId)));}
  async listFinalOverrideRevisions(courseId:string){return copy(this.finalOverrides.filter(x=>x.courseId===courseId).sort((a,b)=>cmp(a.studentId,b.studentId)));}
  async putFinalOverride(value: CourseGradeOverride | { courseId: string; studentId: string; clear: true }, expectedVersion: number, event: GradeEvent) { return this.applyGradeWrites([{ kind: 'final', value, expectedVersion }], [event]); }
  async appendGradeEvent(event: GradeEvent) { if (event.batchId) throw new ApiError('conflict','Batched events require a reservation.'); if (this.gradeEvents.some(x => x.id === event.id)) throw new ApiError('conflict','Duplicate grade event.'); this.gradeEvents.push(copy({...event,seq:1+Math.max(0,...this.gradeEvents.filter(x=>x.courseId===event.courseId).map(x=>x.seq??0))})); }
  async getGradeEvent(id: string) { return copy(this.gradeEvents.find(x => x.id === id) ?? null); }
  async getGradeBatch(courseId: string, batchId: string) { return copy(this.gradeBatches.find(x => x.courseId === courseId && x.batchId === batchId) ?? null); }
  async listGradeEvents(filter: { courseId: string; studentId?: string; assignmentId?: string; kind?: GradeEvent['kind']; batchId?: string; cursor?: string; limit?: number }) {
    const all = this.gradeEvents.filter(x => x.courseId === filter.courseId && (!filter.studentId || x.studentId === filter.studentId) && (!filter.assignmentId || x.assignmentId === filter.assignmentId) && (!filter.kind || x.kind === filter.kind) && (!filter.batchId || x.batchId === filter.batchId))
      .sort((a,b) => (b.seq??0)-(a.seq??0));
    let cursor:number|null=null;try{if(filter.cursor){const value:unknown=JSON.parse(atob(filter.cursor));if(typeof value!=='number'||!Number.isInteger(value)||value<1)throw new Error('Bad cursor');cursor=value;}}catch{throw new ApiError('invalid','Invalid event cursor.');}
    const after = cursor !== null ? all.filter(x => (x.seq??0) < cursor) : all;
    const items = after.slice(0, Math.max(1,Math.min(100,filter.limit ?? 20)));
    return { items: copy(items), nextCursor: after.length > items.length ? btoa(JSON.stringify(items.at(-1)!.seq)) : null };
  }
  private matchesGradeSnapshot(snapshot: GradeSnapshot): boolean {
    const courseId=snapshot.courseId,same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
    const setup=this.gradebookSetups.find(x=>x.courseId===courseId);
    const positions=new Map(this.data.modules.map(x=>[x.id,x.position]));
    const assignments=this.data.assignments.filter(x=>x.courseId===courseId)
      .sort((a,b)=>(positions.get(a.moduleId)??0)-(positions.get(b.moduleId)??0)||a.position-b.position||a.id.localeCompare(b.id))
      .map(a=>({categoryId:null,extraCredit:false,countsTowardGrade:true,...a}));
    const ids=new Set(this.data.enrollments.filter(e=>e.courseId===courseId).map(e=>e.userId));
    const studentIds=this.data.users.filter(u=>u.role==='student'&&ids.has(u.id))
      .sort((a,b)=>cmp(a.name,b.name)||cmp(a.id,b.id)).map(u=>u.id);
    const assignmentIds=new Set(assignments.map(a=>a.id));
    const submissions=this.data.submissions.filter(s=>assignmentIds.has(s.assignmentId))
      .sort((a,b)=>cmp(a.studentId,b.studentId)||b.attempt-a.attempt||cmp(b.submittedAt,a.submittedAt))
      .map(s=>this.publicSubmission(s));
    const states=this.studentItemStates.filter(s=>s.courseId===courseId)
      .sort((a,b)=>cmp(a.studentId,b.studentId)||cmp(a.assignmentId,b.assignmentId));
    const finals=this.finalOverrides.filter(f=>f.courseId===courseId).sort((a,b)=>cmp(a.studentId,b.studentId));
    return (setup?same(setup,snapshot.setup):snapshot.setup.version===0)
      && same(assignments,snapshot.assignments)&&same(studentIds,snapshot.studentIds)
      && same(submissions,snapshot.submissions)&&same(states,snapshot.states)
      && same(finals,snapshot.finalRevisions);
  }
  async applyGradeWrites(writes: GradeWrite[], events: GradeEvent[], snapshot?: GradeSnapshot, batch?: GradeBatch): Promise<GradeWriteResult> {
    if (events.some(e => e.batchId && (!batch || e.courseId !== batch.courseId || e.batchId !== batch.batchId || e.by !== batch.by || e.requestFingerprint !== batch.fingerprint)))
      return {ok:false,conflicts:[{key:'batch:unreserved',current:null}]};
    const current = (w: GradeWrite): unknown => w.kind === 'setup' ? this.gradebookSetups.find(x => x.courseId === w.value.courseId) : w.kind === 'state' ? this.studentItemStates.find(x => x.assignmentId === w.value.assignmentId && x.studentId === w.value.studentId) : w.kind === 'final' ? this.finalOverrides.find(x => x.courseId === w.value.courseId && x.studentId === w.value.studentId) : w.kind === 'submission' && w.create ? [...this.data.submissions].filter(x => x.assignmentId === w.value.assignmentId && x.studentId === w.value.studentId).sort((a,b)=>b.attempt-a.attempt||b.submittedAt.localeCompare(a.submittedAt))[0] : this.data.submissions.find(x => x.id === w.value.id);
    const key = (w: GradeWrite) => w.kind === 'setup' ? `setup:${w.value.courseId}` : w.kind === 'state' ? `state:${w.value.assignmentId}:${w.value.studentId}` : w.kind === 'final' ? `final:${w.value.courseId}:${w.value.studentId}` : `submission:${w.value.id}`;
    const conflicts = writes.flatMap(w => { const row = current(w) as {id?:string;version?:number}|undefined; const valid = w.kind === 'submission' && !w.create ? !!row && (row.version ?? 0) === w.expectedVersion : w.kind === 'submission' && w.create && w.priorId ? !!row && row.id===w.priorId && (row.version??0)===w.expectedVersion : w.expectedVersion === 0 ? !row : !!row && row.version === w.expectedVersion; return valid ? [] : [{ key:key(w), current:copy(row ?? null) }]; });
    if (snapshot && !this.matchesGradeSnapshot(snapshot)) conflicts.push({key:`snapshot:${snapshot.courseId}`,current:null});
    if (batch && (this.gradeBatches.some(x => x.courseId === batch.courseId && x.batchId === batch.batchId) || this.gradeEvents.some(e => e.courseId === batch.courseId && e.batchId === batch.batchId))) conflicts.push({key:`batch:${batch.courseId}:${batch.batchId}`,current:null});
    if (conflicts.length || events.some(e => this.gradeEvents.some(x => x.id === e.id))) return {ok:false,conflicts};
    if (batch) this.gradeBatches.push(copy(batch));
    for (const w of writes) {
      if (w.kind === 'setup') this.upsertBy(this.gradebookSetups, w.value, x => x.courseId);
      else if (w.kind === 'state') this.upsertBy(this.studentItemStates, w.value, x => `${x.assignmentId}:${x.studentId}`);
      else if (w.kind === 'final') { if ('clear' in w.value) { const old=this.finalOverrides.find(x=>x.courseId===w.value.courseId&&x.studentId===w.value.studentId)!; this.upsertBy(this.finalOverrides,{...old,letter:null,percent:null,reason:'',version:old.version+1},x=>`${x.courseId}:${x.studentId}`); } else this.upsertBy(this.finalOverrides, w.value, x => `${x.courseId}:${x.studentId}`); }
      else if(w.kind==='submission-delete') { const old=this.data.submissions.find(x=>x.id===w.value.id)!; this.upsert(this.data.submissions,{...old,deleted:true,grade:null,version:(old.version??0)+1}); }
      else this.upsert(this.data.submissions, w.value);
    }
    for(const e of events)this.gradeEvents.push(copy({...e,seq:1+Math.max(0,...this.gradeEvents.filter(x=>x.courseId===e.courseId).map(x=>x.seq??0))}));
    return {ok:true,versions:writes.map(w => ({key:key(w),version:'clear' in w.value ? w.expectedVersion+1 : w.value.version ?? 0}))};
  }
  async isEmpty(): Promise<boolean> { return this.data.users.length === 0 && !this.gradebookSetups.length && !this.studentItemStates.length && !this.finalOverrides.length && !this.gradeEvents.length && !this.gradeBatches.length; }
  async reset(seed: SeedData) { this.data = this.withNight3(seed); this.loadGradebook(seed); }
  private loadGradebook(seed: SeedData) { this.gradebookSetups = copy(seed.gradebookSetups ?? []); this.studentItemStates = copy(seed.studentItemStates ?? []); this.finalOverrides = copy(seed.finalOverrides ?? []); this.gradeEvents = copy(seed.gradeEvents ?? []).map((event,index)=>({...event,seq:event.seq??index+1})); this.gradeBatches = []; }
  private upsertBy<T>(items: T[], value: T, key: (value:T)=>string) { const i=items.findIndex(x=>key(x)===key(value)); if(i<0) items.push(copy(value)); else items[i]=copy(value); }
  private withNight3(seed: SeedData): SeedData & { readinessItems: StoredReadinessItem[] } {
    return copy({ ...seed, programs: seed.programs ?? [], templates: seed.templates ?? [], rubrics: (seed.rubrics ?? []).map(r => ({ ...r, source: 'custom' as const, builtIn: false })), readinessItems: [],
      outcomes: seed.outcomes ?? seed.courses.flatMap(course => course.outcomes.flatMap((value, i) => value.trim() ? [{ id: `${course.id}-o${i + 1}`, courseId: course.id, code: `O${i + 1}`, text: value, position: i }] : [])),
      outcomeLinks: seed.outcomeLinks ?? [], requirements: seed.requirements ?? [], completionEvents: seed.completionEvents ?? [], testOuts: seed.testOuts ?? [], testOutAttempts: seed.testOutAttempts ?? [], certificates: seed.certificates ?? [], reportingLines: seed.reportingLines ?? [], managerConsents: seed.managerConsents ?? [] });
  }
  private upsert<T extends { id: string }>(items: T[], value: T) {
    const i = items.findIndex(x => x.id === value.id);
    if (i < 0) items.push(copy(value)); else items[i] = copy(value);
  }
}
