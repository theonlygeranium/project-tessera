import { describe, expect, it } from 'vitest';
import { seedData, SEED_NOW } from '../seed';
import type { Requirement } from '../domain';
import { dispatch, MemoryRepo, service, type ServiceContext } from './index';
import { trainingCycle } from './training';

let next=0;
async function ctx(repo:MemoryRepo,id:string,at=SEED_NOW):Promise<ServiceContext>{return{repo,ai:{run:async()=>{throw Error('AI unused');}} as never,user:await repo.getUser(id),now:()=>at,newId:p=>`${p}-${++next}`};}
const courseId='c-ops101';
const answers=[{itemId:'q1',optionId:'a'},{itemId:'q2',optionId:'a'},{itemId:'q3',optionId:'b'},{itemId:'q4',optionId:'a'}];

describe('required training',()=>{
  it('lets assigned staff learn OPS 101 and records completion without exposing a check key',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin');
    await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId},audience:{kind:'users',userIds:['u-okafor']}});
    const teacher=await ctx(repo,'u-okafor');
    expect((await dispatch(service,teacher,'getMyTestOut',{courseId}))?.items).toHaveLength(4);
    const outline=await dispatch(service,teacher,'getCourseOutline',{courseId,asLearner:true});
    expect(outline.course).toMatchObject({lessonCount:3,progress:0,startedLessonCount:0});
    expect(outline.modules.flatMap(m=>m.lessons).map(l=>l.progress)).toEqual(['not-started','not-started','not-started']);
    const lesson=await dispatch(service,teacher,'getStudentLesson',{lessonId:'l-ops-2'});
    expect(JSON.stringify(lesson)).not.toContain('correctOptionId');
    const answer=await dispatch(service,teacher,'answerCheck',{lessonId:'l-ops-2',blockId:'b-o2-3',optionId:'a'});
    expect(answer).toMatchObject({correct:true,attempts:1});
    expect(JSON.stringify(answer)).not.toContain('correctOptionId');
    expect((await dispatch(service,teacher,'setLessonProgress',{lessonId:'l-ops-2',state:'in-progress'})).state).toBe('in-progress');
    for(const lessonId of ['l-ops-1','l-ops-2','l-ops-3'])await dispatch(service,teacher,'setLessonProgress',{lessonId,state:'completed'});
    expect((await dispatch(service,teacher,'getCourseOutline',{courseId,asLearner:true})).course.progress).toBe(1);
    expect((await dispatch(service,teacher,'listMyTraining',undefined))[0]).toMatchObject({status:'completed',certificateId:expect.any(String)});
    expect(await repo.listCertificates({userId:'u-okafor',courseId})).toHaveLength(1);
    expect((await repo.listCompletionEvents({userId:'u-okafor',courseId})).filter(e=>e.kind==='completed')).toHaveLength(1);
  });
  it('refuses unassigned staff learner access even when they teach or are enrolled, while students retain learner access',async()=>{
    const repo=new MemoryRepo(seedData()),teacher=await ctx(repo,'u-okafor'),admin=await ctx(repo,'u-admin'),student=await ctx(repo,'u-dana');
    const denied=[
      () => dispatch(service,teacher,'getStudentLesson',{lessonId:'l-ops-1'}),
      () => dispatch(service,teacher,'answerCheck',{lessonId:'l-ops-2',blockId:'b-o2-3',optionId:'a'}),
      () => dispatch(service,teacher,'setLessonProgress',{lessonId:'l-ops-1',state:'completed'}),
      () => dispatch(service,teacher,'getCourseOutline',{courseId,asLearner:true}),
      () => dispatch(service,teacher,'getStudentLesson',{lessonId:'l-stat-1'}),
      () => dispatch(service,admin,'getStudentLesson',{lessonId:'l-ops-1'}),
      () => dispatch(service,admin,'getCourseOutline',{courseId,asLearner:true}),
    ];
    await repo.addEnrollment(courseId,'u-okafor');
    for(const operation of denied)await expect(operation()).rejects.toMatchObject({code:'forbidden',message:"This course isn't required training for you."});
    expect((await dispatch(service,teacher,'getCourseOutline',{courseId:'c-stat110'})).modules.flatMap(m=>m.lessons).map(l=>l.id)).toContain('l-stat-3');
    expect((await dispatch(service,student,'getStudentLesson',{lessonId:'l-ops-1'})).lesson.id).toBe('l-ops-1');
    expect((await dispatch(service,student,'getCourseOutline',{courseId,asLearner:true})).course.progress).toBe(0);
  });
  it('hides draft lessons and draft-only modules in a staff learner outline',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin');
    await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-stat110'},audience:{kind:'users',userIds:['u-okafor']}});
    const teacher=await ctx(repo,'u-okafor');
    const outline=await dispatch(service,teacher,'getCourseOutline',{courseId:'c-stat110',asLearner:true});
    expect(outline.modules.map(m=>m.id)).toEqual(['m-stat-1']);
    expect(outline.modules[0].lessons.map(l=>l.id)).toEqual(['l-stat-1','l-stat-2']);
    expect(outline.modules[0].lessons.every(l=>l.draftBlockCount===null)).toBe(true);
    expect(outline.course).toMatchObject({lessonCount:2,progress:0,startedLessonCount:0});
    await expect(dispatch(service,teacher,'getStudentLesson',{lessonId:'l-stat-3'})).rejects.toMatchObject({code:'not-found'});
  });
  it('stores staff variant checks and completion under the master lesson',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin');
    await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId},audience:{kind:'users',userIds:['u-okafor']}});
    const master=(await repo.getLesson('l-ops-2'))!;
    await repo.putLesson({...master,id:'l-ops-2-plain',title:'The six lockout steps (plain language)',variantOf:{lessonId:master.id,audience:'plain',syncedAt:SEED_NOW}});
    const check=(await repo.getBlock('b-o2-3'))!;
    await repo.putBlock({...check,id:'b-o2-3-plain',lessonId:'l-ops-2-plain'});
    const teacher=await ctx(repo,'u-okafor');
    expect((await dispatch(service,teacher,'getStudentLesson',{lessonId:'l-ops-2-plain'})).progress.lessonId).toBe(master.id);
    await dispatch(service,teacher,'answerCheck',{lessonId:'l-ops-2-plain',blockId:'b-o2-3-plain',optionId:'a'});
    expect((await dispatch(service,teacher,'setLessonProgress',{lessonId:'l-ops-2-plain',state:'completed'})).lessonId).toBe(master.id);
    expect((await repo.getProgress('u-okafor',master.id))?.checks['b-o2-3-plain']).toMatchObject({correct:true,attempts:1});
    expect(await repo.getProgress('u-okafor','l-ops-2-plain')).toBeNull();
  });
  it('lets an assigned administrator take the learner path',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin');
    await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId},audience:{kind:'users',userIds:['u-admin']}});
    expect((await dispatch(service,admin,'getCourseOutline',{courseId,asLearner:true})).course.progress).toBe(0);
    expect((await dispatch(service,admin,'getStudentLesson',{lessonId:'l-ops-1'})).lesson.id).toBe('l-ops-1');
    expect((await dispatch(service,admin,'setLessonProgress',{lessonId:'l-ops-1',state:'completed'})).state).toBe('completed');
  });
  it('adds concurrent eligible learners without removing enrollments or duplicating assigned events',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin');
    const r=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId},audience:{kind:'role',role:'student'}});
    const dana=(await repo.getUser('u-dana'))!;
    await repo.putUser({...dana,id:'u-concurrent-a',name:'Alex Example',email:'alex@example.test'});
    await repo.putUser({...dana,id:'u-concurrent-b',name:'Bea Example',email:'bea@example.test'});
    const a=await ctx(repo,'u-concurrent-a'),b=await ctx(repo,'u-concurrent-b');
    await Promise.all([dispatch(service,a,'listMyTraining',undefined),dispatch(service,b,'listMyTraining',undefined),dispatch(service,a,'listMyTraining',undefined)]);
    expect((await repo.listEnrollments({courseId})).map(e=>e.userId)).toEqual(expect.arrayContaining(['u-concurrent-a','u-concurrent-b']));
    for(const id of ['u-concurrent-a','u-concurrent-b'])expect((await repo.listCompletionEvents({userId:id,courseId})).filter(e=>e.kind==='assigned'&&e.requirementId===r.id)).toHaveLength(1);
  });
  it('issues one certificate and one event of each kind for concurrent passing attempts',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana');
    const [a,b]=await Promise.all([dispatch(service,dana,'takeTestOut',{courseId,answers}),dispatch(service,dana,'takeTestOut',{courseId,answers})]);
    expect(a.certificate?.id).toBe(b.certificate?.id);
    expect(await repo.listCertificates({userId:'u-dana',courseId})).toHaveLength(1);
    const events=await repo.listCompletionEvents({userId:'u-dana',courseId});
    for(const kind of ['tested-out','certificate-issued'])expect(events.filter(e=>e.kind===kind)).toHaveLength(1);
  });
  it('allows only one concurrent replacement and keeps verification valid only for it',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana'),admin=await ctx(repo,'u-admin');
    const first=(await dispatch(service,dana,'takeTestOut',{courseId,answers})).certificate!;
    const outcomes=await Promise.allSettled([dispatch(service,admin,'reissueCertificate',{certificateId:first.id,learnerName:'Dana A.'}),dispatch(service,admin,'reissueCertificate',{certificateId:first.id,learnerName:'Dana B.'})]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x=>x.status==='rejected').map(x=>(x as PromiseRejectedResult).reason.code)).toEqual(['conflict']);
    const replacement=(outcomes.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.reissueCertificate>>>).value;
    expect((await repo.getCertificate(first.id))?.replacedBy).toBe(replacement.id);
    expect((await repo.listCertificates({userId:'u-dana',courseId})).filter(c=>c.replaces===first.id)).toHaveLength(1);
    expect((await dispatch(service,admin,'verifyCertificate',{code:first.code})).valid).toBe(false);
    expect((await dispatch(service,admin,'verifyCertificate',{code:replacement.code})).valid).toBe(true);
  });
  it('lists the seed assignment on Today, lets Dana test out, issues one immutable certificate, and keeps the answer key private',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana');
    const today=await dispatch(service,dana,'getToday',undefined);
    expect(today.required?.[0]).toMatchObject({courseId,status:'not-started'});
    const test=await dispatch(service,dana,'getMyTestOut',{courseId});
    expect(JSON.stringify(test)).not.toContain('correctOptionId');
    await expect(dispatch(service,dana,'takeTestOut',{courseId,answers:answers.slice(1)})).rejects.toMatchObject({code:'invalid'});
    const failed=await dispatch(service,dana,'takeTestOut',{courseId,answers:answers.map(a=>({...a,optionId:'c'}))});
    expect(failed).toEqual({passed:false,percent:0,certificate:null});
    const passed=await dispatch(service,dana,'takeTestOut',{courseId,answers});
    expect(passed).toMatchObject({passed:true,percent:100,certificate:{basis:'tested-out',learnerName:'Dana Whitfield'}});
    expect(passed.certificate?.code).toMatch(/^TSR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect((await dispatch(service,dana,'listMyTraining',undefined))[0]).toMatchObject({status:'tested-out',certificateId:passed.certificate?.id});
    const again=await dispatch(service,dana,'takeTestOut',{courseId,answers});
    expect(again.certificate?.id).toBe(passed.certificate?.id);
    expect((await repo.listCertificates({userId:'u-dana',courseId}))).toHaveLength(1);
    const verify=await dispatch(service,{...dana,user:null},'verifyCertificate',{code:passed.certificate!.code});
    expect(verify).toMatchObject({valid:true,courseTitle:passed.certificate?.courseTitle});
    expect(JSON.stringify(verify)).not.toContain('Dana');
    expect((await dispatch(service,{...dana,user:null},'verifyCertificate',{code:'TSR-NOPE-NOPE'})).valid).toBe(false);
    const admin=await ctx(repo,'u-admin');const reissued=await dispatch(service,admin,'reissueCertificate',{certificateId:passed.certificate!.id,learnerName:'Dana W.'});
    expect(reissued.id).not.toBe(passed.certificate!.id);
    expect((await repo.getCertificate(passed.certificate!.id))?.learnerName).toBe('Dana Whitfield');
    expect((await repo.getCertificate(passed.certificate!.id))?.replacedBy).toBe(reissued.id);
    expect((await dispatch(service,admin,'verifyCertificate',{code:passed.certificate!.code})).replaced).toBe(true);
    expect((await dispatch(service,dana,'listMyCertificates',undefined))).toHaveLength(2);
  });
  it('enforces resource access, validates authoring, and uses manager opt-in',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana'),teacher=await ctx(repo,'u-okafor'),outsider=await ctx(repo,'u-jordan');
    await expect(dispatch(service,outsider,'getMyTestOut',{courseId})).rejects.toMatchObject({code:'forbidden'});
    const existing=(await dispatch(service,teacher,'getTestOut',{courseId}))!;
    await expect(dispatch(service,outsider,'getTestOut',{courseId})).rejects.toMatchObject({code:'forbidden'});
    await expect(dispatch(service,teacher,'saveTestOut',{courseId,items:[{...existing.items[0],correctOptionId:'missing'}],passPercent:75})).rejects.toMatchObject({code:'invalid'});
    await dispatch(service,teacher,'saveTestOut',{courseId,items:existing.items,passPercent:80});
    const result=await dispatch(service,dana,'takeTestOut',{courseId,answers});
    await expect(dispatch(service,outsider,'getCertificate',{certificateId:result.certificate!.id})).rejects.toMatchObject({code:'forbidden'});
    const sam=await ctx(repo,'u-sam');
    await expect(dispatch(service,sam,'getCertificate',{certificateId:result.certificate!.id})).rejects.toMatchObject({code:'forbidden'});
    await repo.putManagerConsent({managerId:'u-sam',reportId:'u-dana',sharing:true,at:SEED_NOW});
    expect((await dispatch(service,sam,'getCertificate',{certificateId:result.certificate!.id})).id).toBe(result.certificate!.id);
    await repo.putManagerConsent({managerId:'u-sam',reportId:'u-dana',sharing:false,at:SEED_NOW});
    await expect(dispatch(service,sam,'getCertificate',{certificateId:result.certificate!.id})).rejects.toMatchObject({code:'forbidden'});
  });
  it('assigns role members once, picks up new members, preserves enrollments on removal, and filters programs',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin'),r=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId},audience:{kind:'role',role:'student'},dueAt:'2026-10-01T00:00:00.000Z'});
    expect((await repo.listCompletionEvents({courseId})).filter(e=>e.requirementId===r.id&&e.kind==='assigned').length).toBe((await repo.listUsers({role:'student'})).length);
    const dana=await ctx(repo,'u-dana');await dispatch(service,dana,'listMyTraining',undefined);await dispatch(service,dana,'listMyTraining',undefined);
    expect((await repo.listCompletionEvents({userId:'u-dana',courseId})).filter(e=>e.requirementId===r.id&&e.kind==='assigned')).toHaveLength(1);
    const newPerson={...(await repo.getUser('u-dana'))!,id:'u-new',name:'New Employee',email:'new@meridian.example.edu'};await repo.putUser(newPerson);
    const newcomer=await ctx(repo,'u-new');await dispatch(service,newcomer,'getToday',undefined);
    expect(await repo.listEnrollments({courseId,userId:'u-new'})).toHaveLength(1);
    expect((await repo.listCompletionEvents({userId:'u-new',courseId})).filter(e=>e.requirementId===r.id&&e.kind==='assigned')).toHaveLength(1);
    const updated=await dispatch(service,admin,'updateRequirement',{requirementId:r.id,dueAt:'2026-10-15T00:00:00.000Z'});
    expect(updated.dueAt).toBe('2026-10-15T00:00:00.000Z');
    expect((await repo.listCompletionEvents({courseId})).filter(e=>e.requirementId===r.id&&e.kind==='due-date-changed').length).toBe((await repo.listUsers({role:'student'})).length);
    await dispatch(service,admin,'deleteRequirement',{requirementId:r.id});
    expect(await repo.listEnrollments({courseId,userId:'u-new'})).toHaveLength(1);
    expect((await repo.listCompletionEvents({courseId})).some(e=>e.requirementId===r.id&&e.kind==='unassigned')).toBe(true);
    await expect(dispatch(service,admin,'createRequirement',{target:{kind:'program',programId:'missing'},audience:{kind:'role',role:'student'}})).rejects.toMatchObject({code:'not-found'});
  });
  it('completes published lessons once and exports oldest-first escaped CSV',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana');
    for(const id of ['l-ops-1','l-ops-2','l-ops-3'])await dispatch(service,dana,'setLessonProgress',{lessonId:id,state:'completed'});
    await dispatch(service,dana,'setLessonProgress',{lessonId:'l-ops-3',state:'completed'});
    const events=await repo.listCompletionEvents({userId:'u-dana',courseId});
    expect(events.filter(e=>e.kind==='started')).toHaveLength(1);expect(events.filter(e=>e.kind==='completed')).toHaveLength(1);expect(events.filter(e=>e.kind==='certificate-issued')).toHaveLength(1);
    expect((await dispatch(service,dana,'listMyTraining',undefined))[0].status).toBe('completed');
    expect((await dispatch(service,dana,'takeTestOut',{courseId,answers})).certificate?.basis).toBe('completed');
    expect((await repo.listCompletionEvents({userId:'u-dana',courseId})).filter(e=>e.kind==='tested-out')).toHaveLength(0);
    const admin=await ctx(repo,'u-admin');const record=await repo.getUser('u-dana');await repo.putUser({...record!,name:'=PAYLOAD'});
    const csv=(await dispatch(service,admin,'exportCompletionEvents',{courseId})).csv;
    expect(csv).toContain('"\'=PAYLOAD"');expect(csv.split('\r\n')[0]).toBe('"at","person","email","course","event","detail","actor"');
    expect(events.map(e=>e.id)).toEqual((await repo.listCompletionEvents({userId:'u-dana',courseId})).map(e=>e.id));
  });
  it('computes annual windows and paginates compliance by severity',async()=>{
    const r:Requirement={id:'x',target:{kind:'course',courseId},audience:{kind:'users',userIds:['u-dana']},dueAt:'2026-10-15T00:00:00.000Z',recurrence:'annual',createdAt:'2026-09-27T00:00:00.000Z',createdBy:'u-admin'};
    expect(trainingCycle(r,'2026-10-01T00:00:00.000Z').dueAt).toBe(r.dueAt);
    expect(trainingCycle(r,'2027-10-16T00:00:00.000Z').dueAt).toBe(r.dueAt);
    expect(trainingCycle(r,'2027-10-16T00:00:00.000Z','2026-10-01T00:00:00.000Z').dueAt).toBe('2027-10-15T00:00:00.000Z');
    expect(trainingCycle({...r,dueAt:null},'2026-11-01T00:00:00.000Z','2026-10-01T00:00:00.000Z').dueAt).toBe('2027-10-01T00:00:00.000Z');
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin','2026-10-16T00:00:00.000Z');
    const first=await dispatch(service,admin,'getComplianceReport',{limit:1});expect(first.items).toHaveLength(1);expect(first.items[0].training.status).toBe('overdue');
    expect(first.nextCursor).toBeNull();
  });
  it('expands program targets, pages with the next row as cursor, and records one completion per course',async()=>{
    const repo=new MemoryRepo(seedData()),admin=await ctx(repo,'u-admin'),dana=await ctx(repo,'u-dana');
    await repo.putProgram({id:'p-ops',name:'Operations',description:'',templateId:null,brand:{accent:null,logo:null},createdAt:SEED_NOW});
    const c=(await repo.getCourse(courseId))!;await repo.putCourse({...c,programId:'p-ops'});
    const program=await dispatch(service,admin,'createRequirement',{target:{kind:'program',programId:'p-ops'},audience:{kind:'users',userIds:['u-dana']}});
    expect((await dispatch(service,admin,'listRequirements',{courseId})).map(r=>r.id)).toContain(program.id);
    await dispatch(service,dana,'setLessonProgress',{lessonId:'l-ops-1',state:'in-progress'});
    expect((await repo.listCompletionEvents({userId:'u-dana',courseId})).filter(e=>e.kind==='started')).toHaveLength(1);
    for(const id of ['l-ops-1','l-ops-2','l-ops-3'])await dispatch(service,dana,'setLessonProgress',{lessonId:id,state:'completed'});
    const events=await repo.listCompletionEvents({userId:'u-dana',courseId});
    expect(events.filter(e=>e.kind==='completed')).toHaveLength(1);
    expect(events.filter(e=>e.kind==='certificate-issued')).toHaveLength(1);
    const first=await dispatch(service,admin,'getComplianceReport',{limit:1});
    expect(first.nextCursor).not.toBeNull();
    const second=await dispatch(service,admin,'getComplianceReport',{limit:1,cursor:first.nextCursor!});
    expect(second.items[0].training.requirementId).not.toBe(first.items[0].training.requirementId);
  });
  it('keeps a replacement in the original annual cycle',async()=>{
    const repo=new MemoryRepo(seedData()),dana=await ctx(repo,'u-dana');
    const passed=await dispatch(service,dana,'takeTestOut',{courseId,answers});
    const later='2028-01-01T00:00:00.000Z';
    const admin=await ctx(repo,'u-admin',later);
    const replacement=await dispatch(service,admin,'reissueCertificate',{certificateId:passed.certificate!.id});
    expect(replacement.replaces).toBe(passed.certificate!.id);
    const row=(await dispatch(service,await ctx(repo,'u-dana',later),'listMyTraining',undefined))[0];
    expect(row.certificateId).toBeNull();
  });
});
