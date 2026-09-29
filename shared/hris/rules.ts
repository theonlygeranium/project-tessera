import type { AssignmentRule, CompletionEvent, Requirement, RuleMember, RulePreview, User, WorkerLink, WorkerRecord } from '../domain';
import { stableHash } from '../hash';
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const DAY=86_400_000;
const labels={jobCode:'Job code',department:'Department',location:'Location',employmentType:'Employment type'} as const;
const unsafe=/^\s*[=+\-@＝＋－＠]/u;
export function validateRule(rule:AssignmentRule):string|null {
  if(!rule||!['all','any'].includes(rule.match)||!Array.isArray(rule.conditions)||rule.conditions.length<1||rule.conditions.length>20)return 'Choose 1 to 20 rule conditions.';
  for(const c of rule.conditions) {
    if(c.field==='hireDate') {if(c.op!=='within-days'||!Number.isInteger(c.days)||c.days<1||c.days>3650)return 'Hired-within days must be from 1 to 3650.';continue;}
    if(!['jobCode','department','location','employmentType'].includes(c.field)||!['in','not-in'].includes(c.op)||!Array.isArray(c.values)||c.values.length<1||c.values.length>100)return 'Choose 1 to 100 values per condition.';
    const normalized=c.values.map(v=>typeof v==='string'?v.trim():'');
    if(c.values.some(v=>typeof v!=='string'||v!==v.trim()||/^[\t\r]/.test(v))||normalized.some(v=>!v||v.length>100||unsafe.test(v)||/[\u0000-\u001f\u007f]/u.test(v)))return 'Rule values must be safe, nonempty text of at most 100 characters.';
    if(new Set(normalized.map(v=>v.toLowerCase())).size!==normalized.length)return 'Rule values must be distinct.';
    if(c.field==='employmentType'&&normalized.some(v=>!['full-time','part-time','contractor','temporary','other'].includes(v)))return 'Use a valid employment type.';
  }
  return null;
}
export function evaluateRule(rule:AssignmentRule,record:WorkerRecord,now:string):{matches:boolean;reasons:string[]} {
  const results=rule.conditions.map(c=>{
    if(c.field==='hireDate') {
      const days=record.hireDate?Math.floor((Date.parse(now.slice(0,10)+'T00:00:00.000Z')-Date.parse(record.hireDate+'T00:00:00.000Z'))/DAY):NaN;
      const matches=Number.isFinite(days)&&days>=0&&days<=c.days;
      return {matches,reason:`Hired within ${c.days} days (hired ${record.hireDate})`};
    }
    const actual=record[c.field].trim();const contains=c.values.some(v=>v.trim().toLowerCase()===actual.toLowerCase());
    const matches=c.op==='in'?contains:!contains;
    const reason=c.op==='not-in'?`${labels[c.field]} is not in ${c.values.join(', ')}`:c.field==='location'||c.field==='department'||c.field==='employmentType'?`${labels[c.field]} is ${actual}`:`${labels[c.field]} ${actual} is in ${c.values.join(', ')}`;
    return {matches,reason};
  });
  return {matches:rule.match==='all'?results.every(x=>x.matches):results.some(x=>x.matches),reasons:results.filter(x=>x.matches).map(x=>x.reason)};
}
export interface RulePlanInput { requirement:Requirement; records:WorkerRecord[]; allRecords?:WorkerRecord[]; links:WorkerLink[]; users:User[]; members:RuleMember[]; completions:CompletionEvent[]; now:string; targetCourseIds?:string[] }
export function planRule(input:RulePlanInput):RulePreview {
  const {requirement,now}=input;
  if(requirement.audience.kind!=='rule') throw new Error('Rule audience required.');
  const rule=requirement.audience.rule;
  const records=[...input.records].sort((a,b)=>cmp(a.employeeId,b.employeeId));
  const byEmployee=new Map(records.map(r=>[r.employeeId,r]));
  const links=[...input.links].sort((a,b)=>cmp(a.employeeId,b.employeeId));
  const byUser=new Map(input.users.map(u=>[u.id,u]));
  const byLink=new Map(links.map(l=>[l.employeeId,l]));
  const byMember=new Map(input.members.map(m=>[m.userId,m]));
  const targetIds=new Set(input.targetCourseIds??(requirement.target.kind==='course'?[requirement.target.courseId]:[]));
  const previousCompletionAt=(userId:string)=>input.completions.filter(e=>e.userId===userId&&targetIds.has(e.courseId)&&['completed','tested-out'].includes(e.kind)&&e.at<now).map(e=>e.at).sort(cmp).at(-1)??null;
  const finished=(userId:string)=>input.completions.some(e=>e.userId===userId&&targetIds.has(e.courseId)&&['completed','tested-out'].includes(e.kind));
  const add:RulePreview['add']=[],remove:RulePreview['remove']=[];const unchangedIds:string[]=[];
  let unlinked=0,notCurrent=0;
  for(const r of records) if(!byLink.has(r.employeeId))unlinked++;
  for(const l of links) if(!byEmployee.has(l.employeeId)&&(input.allRecords??[]).some(r=>r.employeeId===l.employeeId&&r.effectiveAt>now))notCurrent++;
  const eligible=new Map<string,{record:WorkerRecord;reasons:string[]}>();
  for(const r of records) {
    const link=byLink.get(r.employeeId),person=link&&byUser.get(link.userId);
    if(!person||r.status==='terminated')continue; // Leave remains assigned; due-date pause is deferred.
    const result=evaluateRule(rule,r,now);
    if(result.matches)eligible.set(person.id,{record:r,reasons:result.reasons});
  }
  for(const [userId,{record,reasons}] of [...eligible].sort(([a],[b])=>cmp(a,b))) {
    const person=byUser.get(userId)!;
    if(byMember.get(userId)?.state==='assigned')unchangedIds.push(userId);
    // Recognition of completions before this requirement's training cycle is deferred.
    else add.push({userId,name:person.name,employeeId:record.employeeId,reasons,previousCompletionAt:previousCompletionAt(userId)});
  }
  for(const m of [...input.members].sort((a,b)=>cmp(a.userId,b.userId))) if(m.state==='assigned'&&!eligible.has(m.userId)) {
    const person=byUser.get(m.userId);if(!person)continue;
    const link=links.find(l=>l.userId===m.userId),r=link?byEmployee.get(link.employeeId):undefined;
    const firstMiss=r?rule.conditions.find(c=>!evaluateRule({match:'all',conditions:[c]},r,now).matches):undefined;
    const mismatch=firstMiss?.field==='hireDate'?`Hire date is outside ${firstMiss.days} days`:firstMiss?`${labels[firstMiss.field]} is ${r?.[firstMiss.field]??''}`:'rule conditions';
    const reason=!link?'Not linked to a Tessera user':!r?'No current HR record':r.status==='terminated'?'Employment status is terminated':`No longer matches: ${mismatch}`;
    remove.push({userId:m.userId,name:person.name,employeeId:link?.employeeId??'',reasons:[reason],hasCompleted:finished(m.userId)});
  }
  const summary=`Assigns ${add.length} ${add.length===1?'person':'people'}. Unassigns ${remove.length?`${remove.length} ${remove.length===1?'person':'people'}; their completed training and certificates stay`:'nobody'}. Earlier completions are shown for review and are not counted as completion of this assignment.`;
  const hash=stableHash({requirementId:requirement.id,targetCourseIds:[...targetIds].sort(cmp),rule,add:add.map(({userId,reasons})=>({userId,reasons})),remove:remove.map(({userId,reasons})=>({userId,reasons})),unchangedIds});
  return {requirementId:requirement.id,add,remove,unchanged:unchangedIds.length,skipped:{unlinked,notCurrent},summary,hash};
}
