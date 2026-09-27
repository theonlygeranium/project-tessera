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
    expect(book.rows.find(x=>x.student.id==='u-priya')).toMatchObject({total:0,possible:0});
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
