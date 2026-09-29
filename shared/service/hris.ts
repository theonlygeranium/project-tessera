import type { CompletionEvent, Requirement, RuleMember, WorkerChangeKind, WorkerColumnMap, WorkerImportSource, WorkerRecord } from '../domain';
import { csvObjects, workerFields } from '../hris/csv';
import { currentWorkers, planWorkerImport, suggestedUser, validateWorkerRows, type RawWorkerRow } from '../hris/records';
import { evaluateRule, planRule, validateRule } from '../hris/rules';
import type { Service, ServiceContext } from './context';
import { fail, user } from './helpers';
import { stableHash } from '../hash';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
async function importPlan(ctx:ServiceContext,source:WorkerImportSource,asOf:string) {
  if(!source||!['csv','json'].includes(source.format))fail('invalid','Choose CSV or JSON HR data.');
  if(source.format==='csv'&&typeof source.csv!=='string')fail('invalid','Provide CSV text.');
  if(source.format==='json'&&!Array.isArray(source.records))fail('invalid','Provide a list of HR records.');
  const [existing,links,users,requirements,courses,completions,map]=await Promise.all([ctx.repo.listWorkerRecords(),ctx.repo.listWorkerLinks(),ctx.repo.listUsers(),ctx.repo.listRequirements(),ctx.repo.listCourses(),ctx.repo.listCompletionEvents({}),ctx.repo.getWorkerColumnMap()]);
  let raw:RawWorkerRow[],format:WorkerColumnMap['dateFormat']='iso';
  if(source.format==='csv') {
    const parsed=csvObjects(source.csv,source.columnMap??map??undefined);raw=parsed.rows;format=parsed.dateFormat;
  } else {
    if(source.records.length>1000)fail('invalid','JSON imports are limited to 1,000 records.');
    raw=source.records.map((value,index)=>{const input=value&&typeof value==='object'&&!Array.isArray(value)?value as unknown as Record<string,unknown>:Object.create(null);const projected:Record<string,unknown>=Object.create(null);for(const field of workerFields)if(Object.hasOwn(input,field))projected[field]=input[field];return {line:index+1,value:projected};});
  }
  const validated=validateWorkerRows(raw,existing,format);
  const members=(await Promise.all(requirements.filter(r=>r.audience.kind==='rule').map(r=>ctx.repo.listRuleMembers(r.id)))).flat();
  const preview=planWorkerImport({...validated,existing,links,users,requirements,courses,completions,members,now:ctx.now(),asOf});
  // A claimed receipt can precede a crash before any version is written. Re-preview with a fresh hash even if the clock is frozen.
  let claimed;
  while((claimed=await ctx.repo.findHrImportByHash(preview.hash)))preview.hash=stableHash({planned:preview.hash,claimedBy:claimed.id});
  return {preview,rows:validated.rows,existing};
}
async function targetCourses(ctx:ServiceContext,r:Requirement):Promise<string[]> {
  if(r.target.kind==='course')return [r.target.courseId];
  const programId=r.target.programId;return (await ctx.repo.listCourses()).filter(c=>c.programId===programId).map(c=>c.id).sort(cmp);
}
async function rulePlan(ctx:ServiceContext,requirementId:string,asOf=ctx.now()) {
  const hrRevision=await ctx.repo.getHrRevision();
  const requirement=await ctx.repo.getRequirement(requirementId);
  if(!requirement||requirement.audience.kind!=='rule')return fail('invalid','Choose a rule requirement.');
  const [allRecords,links,users,members,completions,courses]=await Promise.all([ctx.repo.listWorkerRecords(),ctx.repo.listWorkerLinks(),ctx.repo.listUsers(),ctx.repo.listRuleMembers(requirementId),ctx.repo.listCompletionEvents({}),targetCourses(ctx,requirement)]);
  const preview=planRule({requirement,records:currentWorkers(allRecords,asOf),allRecords,links,users,members,completions,now:asOf,targetCourseIds:courses});
  return {preview,requirement,members,courses,hrRevision};
}
function ruleEvent(member:RuleMember,courseId:string):CompletionEvent {
  const kind=member.state==='assigned'?'assigned':'unassigned';
  const id=`ev-rule-${member.requirementId}-${member.userId}-${courseId}-r${member.revision}`;
  const detail=member.state==='assigned'?`Assigned by rule: ${member.reasons.join(' and ')}.`:`Unassigned by rule: ${member.reasons.join(' and ')}. Completed training and certificates stay.`;
  return {id,at:member.changedAt,userId:member.userId,courseId,requirementId:member.requirementId,kind,actorId:member.changedBy,detail};
}
async function appendRuleEvent(ctx:ServiceContext,member:RuleMember,courseId:string) {
  const event=ruleEvent(member,courseId);
  try {await ctx.repo.appendCompletionEvent(event);} catch(error) {
    if(!(await ctx.repo.listCompletionEvents({userId:member.userId,courseId})).some(e=>e.id===event.id))throw error;
  }
}
export const hris:Pick<Service,'getWorkerColumnMap'|'saveWorkerColumnMap'|'previewWorkerImport'|'applyWorkerImport'|'listWorkerRecords'|'listWorkerLinkSuggestions'|'confirmWorkerLink'|'previewRule'|'applyRule'>={
  getWorkerColumnMap:async ctx=>ctx.repo.getWorkerColumnMap(),
  saveWorkerColumnMap:async(ctx,{columns,dateFormat})=>{
    if(!['iso','mdy','dmy'].includes(dateFormat)||!columns||typeof columns!=='object')fail('invalid','Choose a valid date format and column map.');
    const entries=Object.entries(columns);
    if(entries.some(([field,header])=>!workerFields.includes(field as never)||typeof header!=='string'||!header.trim()||header.length>100)||new Set(entries.map(([,header])=>header.trim().toLowerCase())).size!==entries.length)fail('invalid','Use distinct, valid header names of at most 100 characters.');
    const map={columns,dateFormat,updatedBy:user(ctx).id,updatedAt:ctx.now()};await ctx.repo.putWorkerColumnMap(map);return map;
  },
  previewWorkerImport:async(ctx,{source})=>(await importPlan(ctx,source,ctx.now())).preview,
  applyWorkerImport:async(ctx,{source,asOf,hash})=>{
    const now=ctx.now();if(!Number.isFinite(Date.parse(asOf))||Date.parse(asOf)>Date.parse(now)||Date.parse(asOf)<Date.parse(now)-86_400_000)fail('invalid','Preview again.');
    const sourceHash=stableHash({source,asOf});
    const {preview,rows,existing}=await importPlan(ctx,source,asOf);
    if(preview.hash!==hash) {
      const previous=await ctx.repo.findHrImportByHash(hash);
      if(previous&&previous.sourceHash===sourceHash)return {importId:previous.id,alreadyApplied:true,people:previous.counts,skippedRows:previous.skippedRows,...(previous.incomplete?{message:'Previous apply did not finish. Preview again.'}:{})};
      return fail('conflict','The HR data changed since the preview. Review the changes again.');
    }
    const importId=ctx.newId('hrimp');const people={...preview.people};let skippedRows=new Set(preview.rowErrors.map(e=>e.line)).size,conflicted=false;
    // Claim first. A crash after the claim leaves unwritten rows visible as changes in the next preview with a new hash.
    const inserted=await ctx.repo.insertHrImport({id:importId,hash,sourceHash,at:now,actorId:user(ctx).id,source:source.format,counts:people,skippedRows,incomplete:true});
    if(!inserted) {
      const previous=await ctx.repo.findHrImportByHash(hash);
      if(previous&&previous.sourceHash===sourceHash)return {importId:previous.id,alreadyApplied:true,people:previous.counts,skippedRows:previous.skippedRows,...(previous.incomplete?{message:'Previous apply did not finish. Preview again.'}:{})};
      return fail('conflict','The HR import could not be recorded.');
    }
    try {
      for(const change of preview.changes) {
        const record=rows.find(x=>x.line===change.line&&x.record.employeeId===change.employeeId)!.record;
        const stored:WorkerRecord={...record,effectiveAt:change.effectiveAt,receivedAt:now,source:source.format,importId};
        const preceding=existing.filter(x=>x.employeeId===change.employeeId&&x.effectiveAt<change.effectiveAt).sort((a,b)=>cmp(b.effectiveAt,a.effectiveAt))[0]??null;
        const result=await ctx.repo.insertWorkerRecord(stored,{preceding});
        if(result==='conflict') {skippedRows++;people[change.kind]--;conflicted=true;}
      }
    } catch(error) {await ctx.repo.finishHrImport(importId,true,skippedRows,people);throw error;}
    await ctx.repo.finishHrImport(importId,conflicted,skippedRows,people);
    return {importId,alreadyApplied:false,people,skippedRows,...(conflicted?{message:'HR data changed during apply. Preview again.'}:{})};
  },
  listWorkerRecords:async(ctx,{employeeId,history})=>{
    const all=await ctx.repo.listWorkerRecords(employeeId!==undefined?{employeeId}:undefined);
    return history?all:currentWorkers(all,ctx.now());
  },
  listWorkerLinkSuggestions:async ctx=>{
    const [records,links,users]=await Promise.all([ctx.repo.listWorkerRecords(),ctx.repo.listWorkerLinks(),ctx.repo.listUsers()]);
    return currentWorkers(records,ctx.now()).filter(r=>!links.some(l=>l.employeeId===r.employeeId)).flatMap(r=>{
      const candidate=suggestedUser(r,links,users);return candidate?[{employeeId:r.employeeId,name:r.name,email:r.email,userId:candidate.id,userName:candidate.name}]:[];
    });
  },
  confirmWorkerLink:async(ctx,{employeeId,userId})=>{
    const [records,person]=await Promise.all([ctx.repo.listWorkerRecords({employeeId}),ctx.repo.getUser(userId)]);
    if(!currentWorkers(records,ctx.now()).length)return fail('not-found','Current employee record not found.');
    if(!person)return fail('not-found','Tessera user not found.');
    const link={employeeId,userId,linkedBy:user(ctx).id,linkedAt:ctx.now()};
    if(!await ctx.repo.insertWorkerLink(link))return fail('conflict','The employee or Tessera user is already linked.');
    return link;
  },
  previewRule:async(ctx,{requirementId})=>(await rulePlan(ctx,requirementId)).preview,
  applyRule:async(ctx,{requirementId,hash})=>{
    const asOf=ctx.now();
    const {preview,requirement,members,courses,hrRevision}=await rulePlan(ctx,requirementId,asOf);
    if(preview.hash!==hash && (preview.add.length||preview.remove.length))
      return fail('conflict','The rule audience changed since the preview. Review the changes again.');
    // Repair a crash after membership CAS but before the append-only event or enrollment.
    for(const member of members) for(const courseId of courses) {
      const id=`ev-rule-${member.requirementId}-${member.userId}-${courseId}-r${member.revision}`;
      if(!(await ctx.repo.listCompletionEvents({userId:member.userId,courseId})).some(e=>e.id===id)) {
        await appendRuleEvent(ctx,member,courseId);
        if(member.state==='assigned')await ctx.repo.addEnrollment(courseId,member.userId);
      }
    }
    if(preview.hash!==hash)return {added:0,removed:0,conflicts:0};
    let added=0,removed=0,conflicts=0;
    const previous=new Map(members.map(m=>[m.userId,m]));
    const stale=()=>({added,removed,conflicts:++conflicts,message:'HR data or the requirement changed. Preview the rule again.'});
    for(const [state,items] of [['assigned',preview.add],['removed',preview.remove]] as const) for(const item of items) {
      if(Date.parse(ctx.now())!==Date.parse(asOf))return stale();
      if(state==='assigned'&&requirement.audience.kind==='rule') {
        const [records,links]=await Promise.all([ctx.repo.listWorkerRecords(),ctx.repo.listWorkerLinks()]);
        const record=currentWorkers(records,asOf).find(r=>r.employeeId===item.employeeId);
        if(!record||record.status==='terminated'||!links.some(l=>l.employeeId===item.employeeId&&l.userId===item.userId)||!evaluateRule(requirement.audience.rule,record,asOf).matches)return stale();
      }
      if(Date.parse(ctx.now())!==Date.parse(asOf))return stale();
      const prior=previous.get(item.userId),expected=prior?.revision??0;
      const member:RuleMember={requirementId,userId:item.userId,state,revision:expected+1,reasons:item.reasons,changedAt:asOf,changedBy:user(ctx).id};
      if(!await ctx.repo.assignRuleMember(member,expected,{hrRevision},courses.map(courseId=>ruleEvent(member,courseId)),state==='assigned'?courses:[]))return stale();
      if(state==='assigned')added++;else removed++;
    }
    return {added,removed,conflicts};
  },
};
