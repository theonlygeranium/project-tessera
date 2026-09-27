import { describe, expect, it } from 'vitest';
import type { Repo } from '../repo';
import { seedData } from '../seed';

/** Shared behavioral contract for MemoryRepo and the Worker's D1Repo. */
export function describeRepoContract(name: string, makeRepo: () => Promise<Repo>) {
  describe(name, () => {
    it('round trips entities and isolates both reads and writes', async () => {
      const repo = await makeRepo();
      const institution = await repo.getInstitution(); institution.name = 'Changed'; await repo.putInstitution(institution);
      institution.name = 'Changed again'; expect((await repo.getInstitution()).name).toBe('Changed');
      const read = await repo.getInstitution(); read.policy.tutorModes.practice.push('off'); expect((await repo.getInstitution()).policy.tutorModes.practice).toEqual(seedData().institution.policy.tutorModes.practice);
      const user = (await repo.getUser('u-priya'))!; user.name = 'New'; await repo.putUser(user); user.name = 'Mutated'; expect((await repo.getUser('u-priya'))?.name).toBe('New');
      const course = (await repo.getCourse('c-stat110'))!; course.outcomes.push('Extra'); await repo.putCourse(course); course.outcomes.push('Mutated'); expect((await repo.getCourse(course.id))?.outcomes).not.toContain('Mutated');
      const module = (await repo.getModule('m-stat-1'))!; module.title = 'New'; await repo.putModule(module); expect((await repo.getModule(module.id))?.title).toBe('New');
      const lesson = (await repo.getLesson('l-stat-1'))!; lesson.title = 'New'; await repo.putLesson(lesson); expect((await repo.getLesson(lesson.id))?.title).toBe('New');
      const block = (await repo.getBlock('b-s1-1'))!; await repo.putBlock(block); expect(await repo.getBlock(block.id)).toEqual(block);
      const assignment = (await repo.getAssignment('asg-stat-1'))!; assignment.title = 'Edited'; await repo.putAssignment(assignment); assignment.title = 'Changed locally';
      expect((await repo.getAssignment(assignment.id))?.title).toBe('Edited');
      const submission = { id:'sub-contract',assignmentId:assignment.id,studentId:'u-priya',attempt:1,state:'submitted' as const,text:'Answer',fileId:null,link:'',submittedAt:'2026-09-26T00:00:00Z',grade:null };
      await repo.putSubmission(submission); expect(await repo.getSubmission(submission.id)).toEqual(submission);
      const tutorSetting = { activityKind:'lesson' as const, activityId:'l-stat-1', mode:'hints' as const, maxHints:2, allowedSourceIds:['b-s1-1'], setBy:'u-okafor', setAt:'2026-09-26T00:00:00Z' };
      await repo.putTutorSetting(tutorSetting);
      tutorSetting.allowedSourceIds.push('local-change');
      expect((await repo.getTutorSetting('lesson','l-stat-1'))?.allowedSourceIds).toEqual(['b-s1-1']);
      const tutorSession = { id:'ts-contract', studentId:'u-priya', activityKind:'lesson' as const, activityId:'l-stat-1', courseId:'c-stat110', mode:'hints' as const, hintsUsed:0, maxHints:2, answerRequests:0, messages:[], startedAt:'2026-09-26T00:00:00Z', updatedAt:'2026-09-26T00:00:00Z' };
      await repo.putTutorSession(tutorSession);
      expect(await repo.getTutorSession(tutorSession.id)).toEqual(tutorSession);
      expect((await repo.listTutorSessions({ courseId:'c-stat110', studentId:'u-priya', activityKind:'lesson', activityId:'l-stat-1' })).map(s => s.id)).toContain(tutorSession.id);
      const announcement = (await repo.getAnnouncement('a-stat-welcome'))!; await repo.putAnnouncement(announcement); expect(await repo.getAnnouncement(announcement.id)).toEqual(announcement);
      const progress = (await repo.getProgress('u-priya','l-stat-1'))!; await repo.putProgress(progress); expect(await repo.getProgress('u-priya','l-stat-1')).toEqual(progress);
      const session = { id: 'bs-x', courseId: 'c-stat110', prompt: 'x', sources: [], stage: 'brief' as const, brief: null, outline: null, lessonIds: [], provenance: null, createdAt: '2026-09-26T00:00:00Z' };
      await repo.putBuilderSession(session); expect(await repo.getBuilderSession(session.id)).toEqual(session);
      const job = { id: 'gj-contract', courseId: 'c-stat110', requestedBy: 'u-okafor', state: 'running' as const, done: 0, total: 1, lessonIds: [], error: null, work: [{ lessonId: 'l-stat-1', type: 'text' as const }], instruction: 'Keep it short', failures: [], createdAt: '2026-09-26T00:00:00Z', updatedAt: '2026-09-26T00:00:00Z' };
      await repo.putGenerationJob(job); job.work[0].lessonId = 'changed'; expect((await repo.getGenerationJob(job.id))?.work[0].lessonId).toBe('l-stat-1');
      const storedJob = (await repo.getGenerationJob(job.id))!; storedJob.failures.push({ lessonId: 'l-stat-1', type: 'text', message: 'Failed' }); expect((await repo.getGenerationJob(job.id))?.failures).toEqual([]);
    });
    it('orders users, courses, modules, lessons, blocks, announcements, and sessions', async () => {
      const repo = await makeRepo();
      expect((await repo.listUsers()).map(x => x.role)).toEqual(['administrator','instructor','instructor','student','student','student','student']);
      expect((await repo.listUsers({ role: 'student' })).map(x => x.name)).toEqual(['Jordan Lee','Marcus Bell','Priya Natarajan','Sofia Alvarez']);
      expect((await repo.listCourses()).map(x => x.code)).toEqual(['COMM 120','STAT 110']);
      expect((await repo.listModules('c-stat110')).map(x => x.id)).toEqual(['m-stat-1','m-stat-2']);
      expect((await repo.listLessons({ courseId: 'c-stat110' })).map(x => x.id)).toEqual(['l-stat-1','l-stat-2','l-stat-3']);
      expect((await repo.listBlocks('l-stat-1')).map(x => x.position)).toEqual([0,1,2,3,4]);
      const seedAssignment = (await repo.getAssignment('asg-stat-1'))!;
      await repo.putAssignment({ ...seedAssignment,id:'asg-later',position:2 });
      await repo.putAssignment({ ...seedAssignment,id:'asg-middle',position:1 });
      expect((await repo.listAssignments({moduleId:'m-stat-1'})).map(x=>x.id)).toEqual(['asg-stat-1','asg-middle','asg-later']);
      const baseSubmission = {id:'sub-one',assignmentId:'asg-stat-1',studentId:'u-priya',attempt:1,state:'submitted' as const,text:'One',fileId:null,link:'',submittedAt:'2026-09-26T00:00:00Z',grade:null};
      await repo.putSubmission(baseSubmission); await repo.putSubmission({...baseSubmission,id:'sub-two',attempt:2,text:'Two'});
      expect((await repo.listSubmissions({assignmentId:'asg-stat-1',studentId:'u-priya'})).map(x=>x.id)).toEqual(['sub-two','sub-one']);
      expect((await repo.listAnnouncements({})).map(x => x.id)).toEqual(['a-stat-draft','a-stat-office','a-comm-reading','a-stat-welcome']);
      const base = { courseId: 'c-stat110', prompt: '', sources: [], stage: 'brief' as const, brief: null, outline: null, lessonIds: [], provenance: null };
      await repo.putBuilderSession({ ...base, id: 'bs-old', createdAt: '2026-01-01T00:00:00Z' });
      await repo.putBuilderSession({ ...base, id: 'bs-new', createdAt: '2026-02-01T00:00:00Z' });
      expect((await repo.listBuilderSessions('c-stat110')).map(x => x.id)).toEqual(['bs-new','bs-old']);
    });
    it('replaces blocks, cascades lesson deletion, and keeps first read timestamp', async () => {
      const repo = await makeRepo(); const block = (await repo.getBlock('b-s1-1'))!;
      await repo.replaceBlocks('l-stat-1', [{ ...block, position: 7 }]);
      expect((await repo.listBlocks('l-stat-1')).map(x => x.position)).toEqual([7]);
      expect(await repo.getBlock('b-s1-2')).toBeNull();
      const first = { userId: 'u-priya', announcementId: 'a-stat-office', readAt: '2026-01-01T00:00:00Z' };
      await repo.putRead(first); await repo.putRead({ ...first, readAt: '2026-02-01T00:00:00Z' });
      expect(await repo.listReads({ userId: first.userId, announcementId: first.announcementId })).toEqual([first]);
      await repo.deleteLesson('l-stat-1');
      expect(await repo.getLesson('l-stat-1')).toBeNull(); expect(await repo.getBlock('b-s1-1')).toBeNull(); expect(await repo.getProgress('u-priya','l-stat-1')).toBeNull();
    });
    it('replaces enrollments and resets from an empty seed', async () => {
      const repo = await makeRepo(); await repo.setEnrollments('c-stat110',['u-priya']);
      expect((await repo.listEnrollments({ courseId: 'c-stat110' })).map(x => x.userId)).toEqual(['u-priya']);
      const empty = seedData(); empty.users = []; empty.courses = []; empty.enrollments = []; empty.modules = []; empty.lessons = []; empty.blocks = []; empty.assignments = []; empty.submissions = []; empty.announcements = []; empty.reads = []; empty.progress = []; empty.builderSessions = []; empty.generationJobs = [];
      await repo.reset(empty); expect(await repo.isEmpty()).toBe(true);
      await repo.reset(seedData()); expect(await repo.isEmpty()).toBe(false); expect(await repo.getUser('u-priya')).not.toBeNull();
      expect(await repo.getAssignment('asg-stat-1')).not.toBeNull();
    });
  });
}
