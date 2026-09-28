import { describe, expect, it } from 'vitest';
import { fixtureAi } from '../ai';
import { seedData, SEED_NOW } from '../seed';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';

let count=0;
async function context(repo:MemoryRepo,id:string,now=SEED_NOW):Promise<ServiceContext>{return {repo,ai:fixtureAi,user:await repo.getUser(id),now:()=>now,newId:p=>`${p}-${++count}`};}
const id='asg-stat-1';
const rubric=[{criterionId:'criterion-question',levelId:'clear',points:5,comment:'Clear question'},{criterionId:'criterion-reason',levelId:'clear',points:5,comment:'Good reason'}];

describe('grading service',()=>{
  it('requires the correct submission field, allows one replacement, and blocks late or graded replacement',async()=>{
    const repo=new MemoryRepo(seedData()),student=await context(repo,'u-priya'),teacher=await context(repo,'u-okafor');
    await expect(dispatch(service,student,'submit',{assignmentId:id})).rejects.toMatchObject({code:'invalid'});
    const first=await dispatch(service,student,'submit',{assignmentId:id,text:'First'});
    const second=await dispatch(service,student,'submit',{assignmentId:id,text:'Second'});
    expect(second.attempt).toBe(2);
    expect((await dispatch(service,student,'getMySubmission',{assignmentId:id}))?.id).toBe(second.id);
    await expect(dispatch(service,student,'submit',{assignmentId:id,text:'Third'})).rejects.toMatchObject({code:'conflict'});
    await expect(dispatch(service,teacher,'gradeSubmission',{submissionId:first.id,criteria:rubric,score:10,feedback:'Good',feedbackOrigin:'human'})).rejects.toMatchObject({code:'conflict'});
    await dispatch(service,teacher,'gradeSubmission',{submissionId:second.id,criteria:rubric,score:10,feedback:'Good',feedbackOrigin:'human'});
    await expect(dispatch(service,student,'submit',{assignmentId:id,text:'More'})).rejects.toMatchObject({code:'conflict'});
    const late=await context(repo,'u-marcus','2026-10-03T00:00:00.000Z');
    await expect(dispatch(service,late,'submit',{assignmentId:id,text:'Late'})).rejects.toMatchObject({code:'conflict'});
  });
  it('validates rubric results, hides grades until release, and counts released points',async()=>{
    const repo=new MemoryRepo(seedData()),student=await context(repo,'u-priya'),teacher=await context(repo,'u-okafor');
    const submitted=await dispatch(service,student,'submit',{assignmentId:id,text:'A question about variability'});
    await expect(dispatch(service,teacher,'gradeSubmission',{submissionId:submitted.id,criteria:[{...rubric[0],levelId:'unknown'}],score:9,feedback:'',feedbackOrigin:'human'})).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,teacher,'gradeSubmission',{submissionId:submitted.id,criteria:rubric,score:11,feedback:'',feedbackOrigin:'human'})).rejects.toMatchObject({code:'invalid'});
    const draft=await dispatch(service,teacher,'draftFeedback',{submissionId:submitted.id,criteria:rubric});
    expect(draft.provenance.summary).not.toContain(submitted.text);
    await dispatch(service,teacher,'gradeSubmission',{submissionId:submitted.id,criteria:rubric,score:8,feedback:draft.feedback,feedbackOrigin:'ai',feedbackProvenance:draft.provenance});
    expect((await dispatch(service,student,'getMySubmission',{assignmentId:id}))?.grade).toBeNull();
    let book=await dispatch(service,teacher,'getGradebook',{courseId:'c-stat110'});
    expect(book.rows.find(x=>x.student.id==='u-priya')).toMatchObject({total:0,possible:10});
    await dispatch(service,teacher,'releaseGrades',{assignmentId:id});
    expect((await dispatch(service,student,'getMySubmission',{assignmentId:id}))?.grade?.score).toBe(8);
    book=await dispatch(service,teacher,'getGradebook',{courseId:'c-stat110'});
    expect(book.rows.find(x=>x.student.id==='u-priya')).toMatchObject({total:8,possible:10});
    expect((await dispatch(service,teacher,'exportGradebook',{courseId:'c-stat110'})).csv).toContain('"Student","Email"');
  });
  it('restricts assignment visibility to published enrolled students and honors AI policy',async()=>{
    const repo=new MemoryRepo(seedData()),teacher=await context(repo,'u-okafor'),student=await context(repo,'u-priya'),outsider=await context(repo,'u-jordan');
    await expect(dispatch(service,outsider,'getAssignment',{assignmentId:id})).rejects.toMatchObject({code:'forbidden'});
    const created=await dispatch(service,teacher,'createAssignment',{moduleId:'m-stat-1',title:'Draft',submissionType:'link',points:4});
    await expect(dispatch(service,student,'getAssignment',{assignmentId:created.id})).rejects.toMatchObject({code:'not-found'});
    await dispatch(service,teacher,'publishAssignment',{assignmentId:created.id});
    await expect(dispatch(service,student,'submit',{assignmentId:created.id,link:'javascript:bad'})).rejects.toMatchObject({code:'invalid'});
    const s=await dispatch(service,student,'submit',{assignmentId:created.id,link:'https://example.edu/work'});
    const inst=await repo.getInstitution();inst.policy.aiAuthoring=false;await repo.putInstitution(inst);
    await expect(dispatch(service,teacher,'draftFeedback',{submissionId:s.id,criteria:[]})).rejects.toMatchObject({code:'ai-disabled'});
  });
});

describe('listAssignments', () => {
  it('shows drafts to staff and only published assignments to students', async () => {
    const repo = new MemoryRepo(seedData()), teacher = await context(repo, 'u-okafor'), student = await context(repo, 'u-priya');
    const draft = await dispatch(service, teacher, 'createAssignment', { moduleId: 'm-stat-1', title: 'Draft only', submissionType: 'text', points: 5 });
    expect((await dispatch(service, teacher, 'listAssignments', { courseId: 'c-stat110' })).map(a => a.id)).toContain(draft.id);
    const seen = (await dispatch(service, student, 'listAssignments', { courseId: 'c-stat110' })).map(a => a.id);
    expect(seen).toContain(id);
    expect(seen).not.toContain(draft.id);
  });
});

describe('file scans in demo mode', () => {
  it('derives a file summary from its latest scan, like D1', async () => {
    const repo = new MemoryRepo(seedData());
    await repo.putFile({ id: 'f1', courseId: 'c-stat110', name: 'a.pdf', kind: 'pdf', mime: 'application/pdf', size: 1, key: 'k', version: 1, uploadedBy: 'u-okafor', uploadedAt: '2026-09-27T00:00:00.000Z', scan: null });
    await repo.putScan({ id: 's1', courseId: 'c-stat110', version: 1, target: { kind: 'file', fileId: 'f1', version: 1 }, score: 70, grade: 'Moderate', issueCount: 1, bySeverity: { critical: 1, serious: 0, moderate: 0, minor: 0 }, scannedAt: '2026-09-27T01:00:00.000Z', issues: [], document: null });
    expect((await repo.getFile('f1'))?.scan?.score).toBe(70);
    expect((await repo.listFiles('c-stat110'))[0].scan?.grade).toBe('Moderate');
  });
});

describe('review 3 fixes', () => {
  it('compares due dates as instants, not text', async () => {
    const repo = new MemoryRepo(seedData());
    const a = (await repo.getAssignment(id))!; a.dueAt = '2026-09-27T23:00:00-05:00'; await repo.putAssignment(a);
    const student = await context(repo, 'u-priya', '2026-09-28T01:00:00.000Z'); // 8 p.m. in UTC-5, before the deadline
    expect((await dispatch(service, student, 'submit', { assignmentId: id, text: 'On time' })).attempt).toBe(1);
  });
});

describe('review 4: gradebook access', () => {
  it('lets an administrator read the gradebook and its CSV', async () => {
    const repo = new MemoryRepo(seedData()), admin = await context(repo, 'u-admin');
    expect((await dispatch(service, admin, 'getGradebook', { courseId: 'c-stat110' })).rows.length).toBeGreaterThan(0);
    expect((await dispatch(service, admin, 'exportGradebook', { courseId: 'c-stat110' })).csv).toContain('"Student"');
  });
});
