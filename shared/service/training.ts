import { ApiError } from '../api';
import type { Certificate, CompletionEvent, CompletionEventKind, Requirement, RequiredTraining, TestOut, User } from '../domain';
import { managerMayReadCertificate } from '../managers/policy';
import type { Service, ServiceContext } from './context';
import { canReachCourse, canTeach, course, fail, required, user } from './helpers';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'no due date';
const newest = <T extends { at: string; id: string }>(items: T[]) => items.sort((a,b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
const page = <T>(items: T[], cursor: string | undefined, limit: number | undefined, key: (item:T)=>string) => { const start = cursor ? Math.max(0, items.findIndex(x => key(x) === cursor)) : 0; const size = Math.max(1, Math.min(200, limit ?? 50)); const slice = items.slice(start,start+size); return { items: slice, nextCursor: items[start+size] ? key(items[start+size]) : null }; };

/** Current annual window; a finish remains valid for 365 days, including when no due date was set. */
export function trainingCycle(r: Requirement, now: string, latestFinish: string | null = null): { start: string; dueAt: string | null } {
  if (r.recurrence === 'none' || !latestFinish) return { start:r.createdAt, dueAt:r.dueAt };
  const finish=Date.parse(latestFinish), expiry=finish+365*DAY, valid=Date.parse(now)<expiry;
  const dueAt=r.dueAt ? iso(Date.parse(r.dueAt)+Math.max(1,Math.floor(((valid?finish:expiry)-Date.parse(r.dueAt))/(365*DAY))+1)*365*DAY) : iso(expiry);
  return { start:valid?r.createdAt:iso(expiry), dueAt };
}

async function targetCourses(ctx: ServiceContext, r: Requirement): Promise<string[]> {
  if (r.target.kind === 'course') return [r.target.courseId];
  const programId = r.target.programId;
  return (await ctx.repo.listCourses()).filter(c => c.programId === programId).map(c => c.id);
}
async function audience(ctx: ServiceContext, r: Requirement): Promise<User[]> {
  return r.audience.kind === 'role' ? ctx.repo.listUsers({ role: r.audience.role }) : (await Promise.all(r.audience.userIds.map(id => ctx.repo.getUser(id)))).filter((x):x is User => !!x);
}
async function event(ctx: ServiceContext, kind: CompletionEventKind, userId: string, courseId: string, requirementId: string | null, detail: string, actorId: string | null = null) {
  const e: CompletionEvent = { id:ctx.newId('ev'),at:ctx.now(),userId,courseId,requirementId,kind,detail,actorId }; await ctx.repo.appendCompletionEvent(e);
}
async function ensureAssignment(ctx: ServiceContext, r: Requirement, person: User, courseId: string) {
  const events = await ctx.repo.listCompletionEvents({ userId:person.id,courseId });
  if (!events.some(e => e.requirementId === r.id && e.kind === 'assigned')) await event(ctx,'assigned',person.id,courseId,r.id,`Assigned ${courseId}, due ${date(r.dueAt)}.`,r.createdBy);
  const enrolled = await ctx.repo.listEnrollments({courseId});
  if (!enrolled.some(e=>e.userId===person.id)) await ctx.repo.setEnrollments(courseId,[...enrolled.map(e=>e.userId),person.id]);
}
async function applicable(ctx:ServiceContext, person:User) {
  const rows:{r:Requirement; courseId:string}[]=[];
  for (const r of await ctx.repo.listRequirements()) if (r.audience.kind==='role' ? r.audience.role===person.role : r.audience.userIds.includes(person.id)) for (const courseId of await targetCourses(ctx,r)) { await ensureAssignment(ctx,r,person,courseId); rows.push({r,courseId}); }
  return rows;
}
async function certificateCycleAt(ctx:ServiceContext, certificate:Certificate):Promise<string> {
  let root=certificate;const seen=new Set<string>();
  while(root.replaces&&!seen.has(root.id)){seen.add(root.id);const parent=await ctx.repo.getCertificate(root.replaces);if(!parent)break;root=parent;}
  return root.issuedAt;
}
async function currentCertificate(ctx:ServiceContext,userId:string,courseId:string,start:string){
  for(const c of await ctx.repo.listCertificates({userId,courseId})) if(!c.replacedBy&&(await certificateCycleAt(ctx,c))>=start)return c;
  return null;
}
async function trainingRow(ctx:ServiceContext, person:User, r:Requirement, courseId:string):Promise<RequiredTraining> {
  const c=await course(ctx,courseId), events=await ctx.repo.listCompletionEvents({userId:person.id,courseId});
  const finished=events.filter(e=>e.kind==='completed'||e.kind==='tested-out').sort((a,b)=>b.at.localeCompare(a.at))[0];
  const cycle=trainingCycle(r,ctx.now(),finished?.at ?? null);
  const attempts=await ctx.repo.listTestOutAttempts(person.id,courseId);
  const passed=attempts.filter(a=>a.passed && a.at>=cycle.start && a.at<=ctx.now()).at(-1);
  const lessons=(await ctx.repo.listLessons({courseId})).filter(l=>l.status==='published');
  const progress=await ctx.repo.listProgress({userId:person.id,lessonIds:lessons.map(l=>l.id)});
  const current=progress.filter(p=>p.updatedAt && p.updatedAt>=cycle.start && p.updatedAt<=ctx.now());
  const complete=lessons.length>0 && lessons.every(l=>current.some(p=>p.lessonId===l.id && p.state==='completed'));
  const completedEvent=events.filter(e=>e.kind==='completed'&&e.at>=cycle.start && e.at<=ctx.now()).at(-1);
  const status=passed?'tested-out':(complete||!!completedEvent)?'completed':cycle.dueAt && Date.parse(cycle.dueAt)<Date.parse(ctx.now())?'overdue':current.length?'in-progress':'not-started';
  const certificate=await currentCertificate(ctx,person.id,courseId,cycle.start);
  return {requirementId:r.id,courseId,courseTitle:c.title,dueAt:cycle.dueAt,status,completedAt:passed?.at ?? completedEvent?.at ?? (complete ? current.map(p=>p.updatedAt!).sort().at(-1) ?? null : null),certificateId:certificate?.id ?? null};
}
async function rowsFor(ctx:ServiceContext, person:User) { const rows=[]; for (const {r,courseId} of await applicable(ctx,person)) rows.push(await trainingRow(ctx,person,r,courseId)); return rows; }
function sortedTraining(rows:RequiredTraining[]) { return rows.sort((a,b)=> (a.status==='overdue'?-1:0)-(b.status==='overdue'?-1:0) || Number(['completed','tested-out'].includes(a.status))-Number(['completed','tested-out'].includes(b.status)) || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.courseTitle.localeCompare(b.courseTitle)); }
const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function code() { const values=new Uint8Array(8); crypto.getRandomValues(values); return `TSR-${[...values.slice(0,4)].map(x=>alphabet[x%32]).join('')}-${[...values.slice(4)].map(x=>alphabet[x%32]).join('')}`; }
async function issue(ctx:ServiceContext, person:User, courseId:string, basis:Certificate['basis'], replaces:string|null=null, learnerName=person.name) {
  const c=await course(ctx,courseId);
  for(let tries=0;tries<20;tries++) { const value=code(); if(await ctx.repo.getCertificateByCode(value)) continue;
    const cert:Certificate={id:ctx.newId('cert'),code:value,userId:person.id,learnerName,courseId,courseTitle:c.title,issuedAt:ctx.now(),basis,replaces,replacedBy:null};
    try { await ctx.repo.insertCertificate(cert); return cert; } catch(error) { if(error instanceof ApiError && error.code==='conflict') continue; throw error; }
  }
  return fail('conflict','Could not create a unique certificate code.');
}
async function assignedOrEnrolled(ctx:ServiceContext,courseId:string){ const u=user(ctx); await course(ctx,courseId); const assigned=(await applicable(ctx,u)).some(x=>x.courseId===courseId); if (!assigned && !(await ctx.repo.listEnrollments({courseId,userId:u.id})).length) fail('forbidden','You are not enrolled or assigned.'); }
async function instructorCourse(ctx:ServiceContext,courseId:string){ await canTeach(ctx,courseId); }

/** Called after progress is saved; audit events are only appended. */
export async function onLessonProgress(ctx:ServiceContext,courseId:string) {
  const person=user(ctx), assigned=(await applicable(ctx,person)).filter(x=>x.courseId===courseId); if(!assigned.length)return;
  const r=assigned[0].r,events=await ctx.repo.listCompletionEvents({userId:person.id,courseId});
  const cycle=trainingCycle(r,ctx.now(),events.filter(e=>e.kind==='completed'||e.kind==='tested-out').at(-1)?.at??null);
  const row=await trainingRow(ctx,person,r,courseId);
  if(!events.some(e=>e.kind==='started'&&e.at>=cycle.start))await event(ctx,'started',person.id,courseId,r.id,'Training started.');
  if(row.status==='completed'&&!events.some(e=>e.kind==='completed'&&e.at>=cycle.start))await event(ctx,'completed',person.id,courseId,r.id,'All published lessons completed.');
  if(row.status==='completed'&&!row.certificateId){await issue(ctx,person,courseId,'completed');await event(ctx,'certificate-issued',person.id,courseId,r.id,'Certificate issued for completed training.');}
}

const csvCell=(v:unknown)=>`"${String(v??'').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')}"`;
export const training: Pick<Service,'listRequirements'|'createRequirement'|'updateRequirement'|'deleteRequirement'|'getComplianceReport'|'listCompletionEvents'|'exportCompletionEvents'|'listMyTraining'|'getTestOut'|'saveTestOut'|'deleteTestOut'|'getMyTestOut'|'takeTestOut'|'listMyCertificates'|'getCertificate'|'verifyCertificate'|'reissueCertificate'> = {
  listRequirements:async(ctx,{courseId})=>{ const all=await ctx.repo.listRequirements(); if(!courseId) return all; await course(ctx,courseId); const c=await course(ctx,courseId); return all.filter(r=>r.target.kind==='course'?r.target.courseId===courseId:c.programId===r.target.programId); },
  createRequirement:async(ctx,input)=>{ if(input.target.kind==='course') await course(ctx,input.target.courseId); else if(!await ctx.repo.getProgram(input.target.programId)) fail('not-found','Program not found.');
    if(input.audience.kind==='users') { if(!input.audience.userIds.length||new Set(input.audience.userIds).size!==input.audience.userIds.length) fail('invalid','Choose distinct people.'); for(const id of input.audience.userIds) if(!await ctx.repo.getUser(id)) fail('not-found','Person not found.'); }
    const r:Requirement={id:ctx.newId('req'),target:input.target,audience:input.audience,dueAt:input.dueAt??null,recurrence:input.recurrence??'none',createdBy:user(ctx).id,createdAt:ctx.now()}; await ctx.repo.putRequirement(r);
    for(const p of await audience(ctx,r)) for(const courseId of await targetCourses(ctx,r)) await ensureAssignment(ctx,r,p,courseId); return r; },
  updateRequirement:async(ctx,input)=>{ const r=await ctx.repo.getRequirement(input.requirementId)??fail('not-found','Requirement not found.'); const before=r.dueAt,beforeRecurrence=r.recurrence; if(input.dueAt!==undefined)r.dueAt=input.dueAt;if(input.recurrence!==undefined)r.recurrence=input.recurrence;await ctx.repo.putRequirement(r); if(before!==r.dueAt||beforeRecurrence!==r.recurrence) for(const p of await audience(ctx,r))for(const courseId of await targetCourses(ctx,r)) { await ensureAssignment(ctx,r,p,courseId); await event(ctx,'due-date-changed',p.id,courseId,r.id,before!==r.dueAt?`Due date changed from ${date(before)} to ${date(r.dueAt)}.`:`Recurrence changed from ${beforeRecurrence} to ${r.recurrence}.`,user(ctx).id); } return r; },
  deleteRequirement:async(ctx,{requirementId})=>{const r=await ctx.repo.getRequirement(requirementId)??fail('not-found','Requirement not found.');for(const p of await audience(ctx,r))for(const courseId of await targetCourses(ctx,r)){await ensureAssignment(ctx,r,p,courseId);await event(ctx,'unassigned',p.id,courseId,r.id,'Required training removed.',user(ctx).id);}await ctx.repo.deleteRequirement(r.id);return {ok:true};},
  listMyTraining:async(ctx)=>sortedTraining(await rowsFor(ctx,user(ctx))),
  getComplianceReport:async(ctx,{courseId,status,cursor,limit})=>{const rows=[];for(const p of await ctx.repo.listUsers())for(const t of await rowsFor(ctx,p))if((!courseId||t.courseId===courseId)&&(!status||t.status===status))rows.push({user:{id:p.id,name:p.name,email:p.email},training:t});const severity=['overdue','not-started','in-progress','completed','tested-out'];rows.sort((a,b)=>severity.indexOf(a.training.status)-severity.indexOf(b.training.status)||a.user.name.localeCompare(b.user.name)||a.training.courseTitle.localeCompare(b.training.courseTitle));return page(rows,cursor,limit,r=>`${r.user.id}:${r.training.requirementId}:${r.training.courseId}`);},
  listCompletionEvents:async(ctx,{courseId,userId,cursor,limit})=>page(newest(await ctx.repo.listCompletionEvents({courseId,userId})),cursor,limit,e=>e.id),
  exportCompletionEvents:async(ctx,{courseId,since})=>{const events=await ctx.repo.listCompletionEvents({courseId,since});const lines=[['at','person','email','course','event','detail','actor'].map(csvCell).join(',')];for(const e of events){const [p,c,a]=await Promise.all([ctx.repo.getUser(e.userId),ctx.repo.getCourse(e.courseId),e.actorId?ctx.repo.getUser(e.actorId):null]);lines.push([e.at,p?.name??'',p?.email??'',c?.title??'',e.kind,e.detail,a?.name??'Tessera'].map(csvCell).join(','));}return {csv:lines.join('\r\n')+'\r\n'};},
  getTestOut:async(ctx,{courseId})=>{await canReachCourse(ctx,courseId);return ctx.repo.getTestOut(courseId);},
  saveTestOut:async(ctx,{courseId,items,passPercent})=>{await instructorCourse(ctx,courseId);if(!Number.isInteger(passPercent)||passPercent<1||passPercent>100||!items.length||new Set(items.map(i=>i.id)).size!==items.length||items.some(i=>!i.id.trim()||!i.question.trim()||i.options.length<2||i.options.length>6||new Set(i.options.map(o=>o.id)).size!==i.options.length||i.options.some(o=>!o.id.trim()||!o.text.trim())||!i.options.some(o=>o.id===i.correctOptionId)))fail('invalid','Test-out items are invalid.');const t:TestOut={courseId,items,passPercent,updatedBy:user(ctx).id,updatedAt:ctx.now()};await ctx.repo.putTestOut(t);return t;},
  deleteTestOut:async(ctx,{courseId})=>{await instructorCourse(ctx,courseId);await ctx.repo.deleteTestOut(courseId);return {ok:true};},
  getMyTestOut:async(ctx,{courseId})=>{await assignedOrEnrolled(ctx,courseId);const t=await ctx.repo.getTestOut(courseId);if(!t)return null;return {courseId,passPercent:t.passPercent,items:t.items.map(({id,question,options})=>({id,question,options})),attempts:(await ctx.repo.listTestOutAttempts(user(ctx).id,courseId)).map(({at,percent,passed})=>({at,percent,passed}))};},
  takeTestOut:async(ctx,{courseId,answers})=>{await assignedOrEnrolled(ctx,courseId);const t=await ctx.repo.getTestOut(courseId)??fail('not-found','Test-out not found.');if(answers.length!==t.items.length||new Set(answers.map(a=>a.itemId)).size!==answers.length||answers.some(a=>!t.items.some(i=>i.id===a.itemId&&i.options.some(o=>o.id===a.optionId))))fail('invalid','Answer every question once.');const percent=Math.floor(100*t.items.filter(i=>answers.find(a=>a.itemId===i.id)?.optionId===i.correctOptionId).length/t.items.length),passed=percent>=t.passPercent,person=user(ctx);await ctx.repo.putTestOutAttempt({id:ctx.newId('attempt'),courseId,userId:person.id,percent,passed,at:ctx.now()});if(!passed)return {passed,percent,certificate:null};const assigned=(await applicable(ctx,person)).filter(x=>x.courseId===courseId),events=await ctx.repo.listCompletionEvents({userId:person.id,courseId});let certificate:Certificate|null=null;const active=assigned[0]?.r??null;const cycle=active?trainingCycle(active,ctx.now(),events.filter(e=>e.kind==='completed'||e.kind==='tested-out').at(-1)?.at??null):null;if(!events.some(e=>['completed','tested-out'].includes(e.kind)&&(!cycle||e.at>=cycle.start)))await event(ctx,'tested-out',person.id,courseId,active?.id??null,'Passed the test-out.');const existing=await currentCertificate(ctx,person.id,courseId,cycle?.start??'');const alreadyFinished=events.some(e=>['completed','tested-out'].includes(e.kind)&&(!cycle||e.at>=cycle.start));certificate=existing??(alreadyFinished?null:await issue(ctx,person,courseId,'tested-out'));if(!existing&&!alreadyFinished)await event(ctx,'certificate-issued',person.id,courseId,assigned[0]?.r.id??null,'Certificate issued for test-out.');return {passed,percent,certificate};},
  listMyCertificates:async(ctx)=>ctx.repo.listCertificates({userId:user(ctx).id}),
  getCertificate:async(ctx,{certificateId})=>{const c=await ctx.repo.getCertificate(certificateId)??fail('not-found','Certificate not found.');const u=user(ctx);if(u.id===c.userId||u.role==='administrator')return c;const [lines,consents,learner]=await Promise.all([ctx.repo.listReportingLines({managerId:u.id,reportId:c.userId}),ctx.repo.listManagerConsents({managerId:u.id,reportId:c.userId}),ctx.repo.getUser(c.userId)]);const requiredIds=learner?(await rowsFor(ctx,learner)).map(x=>x.courseId):[];if(managerMayReadCertificate(lines,consents,u.id,c,requiredIds))return c;return fail('forbidden','You cannot view this certificate.');},
  verifyCertificate:async(ctx,{code:value})=>{const c=await ctx.repo.getCertificateByCode(value);return {code:value,valid:!!c&&!c.replacedBy,courseTitle:c?.courseTitle??null,issuedAt:c?.issuedAt??null,replaced:!!c?.replacedBy};},
  reissueCertificate:async(ctx,{certificateId,learnerName})=>{const old=await ctx.repo.getCertificate(certificateId)??fail('not-found','Certificate not found.');if(old.replacedBy)fail('conflict','Certificate was already replaced.');const person=await ctx.repo.getUser(old.userId)??fail('not-found','Learner not found.');const cert=await issue(ctx,person,old.courseId,old.basis,old.id,learnerName===undefined?old.learnerName:required(learnerName,'Learner name'));await ctx.repo.markCertificateReplaced(old.id,cert.id);await event(ctx,'certificate-replaced',person.id,old.courseId,null,`Certificate ${old.code} replaced by ${cert.code}.`,user(ctx).id);await event(ctx,'certificate-issued',person.id,old.courseId,null,`Replacement certificate ${cert.code} issued.`,user(ctx).id);return cert;},
};

/** A person's required training (status per course), for other services such as the manager view. */
export const requiredTrainingFor = rowsFor;
