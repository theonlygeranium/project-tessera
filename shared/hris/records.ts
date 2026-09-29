import type { CompletionEvent, Course, Requirement, RuleMember, User, WorkerChangeKind, WorkerChangeSet, WorkerColumnMap, WorkerField, WorkerLink, WorkerRecord, WorkerRecordInput, WorkerRowErrorCode } from '../domain';
import { stableHash, stableJson } from '../hash';
import { workerFields } from './csv';
import { planRule } from './rules';

export type RawWorkerRow = { line: number; value: Record<string,unknown>; tooLong?: boolean };
export type WorkerError = WorkerChangeSet['rowErrors'][number];
export type ValidWorkerRow = { line: number; record: WorkerRecordInput };
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const fields=workerFields.filter(x=>x!=='effectiveAt');
const unsafe=/^\s*[=+\-@＝＋－＠]/u;
const control=/[\u0000-\u001f\u007f]/u;
const idShape=/^[A-Za-z0-9._-]+$/;
const emailShape=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const clean=(value:unknown)=>typeof value==='string'?value.trim():'';
const emTypes=['full-time','part-time','contractor','temporary','other'] as const;
const statuses=['active','leave','terminated'] as const;
function dateValue(value:string, format:WorkerColumnMap['dateFormat'], timestamp=false):string|null {
  if(!value) return null;
  if(timestamp && format==='iso' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    const parsed=new Date(value);
    if(Number.isFinite(parsed.getTime())&&parsed.getUTCFullYear()>=1900&&parsed.getUTCFullYear()<=2100&&parsed.toISOString().slice(0,10)===value.slice(0,10)) return parsed.toISOString();
    return null;
  }
  const match=(format==='iso'?/^(\d{4})-(\d{2})-(\d{2})$/:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/).exec(value);
  if(!match) return null;
  const year=+(format==='iso'?match[1]:match[3]);
  const month=+(format==='dmy'?match[2]:format==='iso'?match[2]:match[1]);
  const day=+(format==='dmy'?match[1]:format==='iso'?match[3]:match[2]);
  if(year<1900||year>2100||month<1||month>12||day<1||day>31) return null;
  const ms=Date.UTC(year,month-1,day), d=new Date(ms);
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day) return null;
  const iso=d.toISOString().slice(0,10);
  return timestamp?`${iso}T00:00:00.000Z`:iso;
}

/** Validation stays per row; invalid rows never enter a plan. */
export function validateWorkerRows(raw: RawWorkerRow[], existing: WorkerRecord[], format: WorkerColumnMap['dateFormat']): {rows:ValidWorkerRow[];rowErrors:WorkerError[]} {
  const rows:ValidWorkerRow[]=[], rowErrors:WorkerError[]=[]; const seen=new Set<string>();
  const add=(line:number,employeeId:string|null,field:WorkerField|null,code:WorkerRowErrorCode,message:string)=>rowErrors.push({line,employeeId,field,code,message});
  for(const {line,value,tooLong} of raw) {
    const id=clean(value.employeeId) as string; const base=rowErrors.length;
    if(tooLong || workerFields.some(field=>typeof value[field]==='string'&&value[field].length>500)) add(line,id||null,null,'worker-too-long','Shorten cells to 500 characters or less.');
    if(!id) add(line,null,'employeeId','worker-missing-id','Add an employee ID.');
    else {
      if(id.length>64||!idShape.test(id)) add(line,id,'employeeId','worker-bad-value','Use at most 64 letters, digits, dots, underscores or hyphens for employee ID.');
      const folded=id.toLowerCase(); if(seen.has(folded)) add(line,id,'employeeId','worker-duplicate-id','Keep only the first row for this employee ID.');
      seen.add(folded);
    }
    for(const field of [...fields,'effectiveAt'] as WorkerField[]) {
      const rawValue=value[field];
      if(rawValue!=null&&typeof rawValue!=='string') add(line,id||null,field,'worker-bad-value',`Enter text for ${field}.`); const val=clean(rawValue) as string;
      if(typeof rawValue==='string' && control.test(val)) add(line,id||null,field,'worker-bad-value',`Remove control characters from ${field}.`);
      // A later spreadsheet export must not execute imported text as a formula.
      if(['employeeId','name','jobCode','jobTitle','department','location','managerEmployeeId'].includes(field) && typeof rawValue==='string' && (unsafe.test(rawValue)||/^[\t\r]/.test(rawValue))) add(line,id||null,field,'worker-unsafe-value',`Remove the formula-like prefix from ${field}.`);
    }
    const email=(clean(value.email) as string).toLowerCase();
    if(!emailShape.test(email)) add(line,id||null,'email','worker-bad-email','Enter one valid email address.');
    const name=clean(value.name) as string, jobCode=clean(value.jobCode) as string, department=clean(value.department) as string, location=clean(value.location) as string;
    for(const [field,val] of [['name',name],['jobCode',jobCode],['department',department],['location',location]] as const) if(!val) add(line,id||null,field,'worker-bad-value',`Enter ${field}.`);
    const typeText=(clean(value.employmentType) as string).toLowerCase();
    const employmentType=typeText==='ft'||typeText==='full time'?'full-time':typeText;
    if(!emTypes.includes(employmentType as never)) add(line,id||null,'employmentType','worker-bad-value','Use full-time, part-time, contractor, temporary or other.');
    const statusText=(clean(value.status) as string).toLowerCase();
    const status=statusText==='on leave'?'leave':['inactive','left'].includes(statusText)?'terminated':statusText;
    if(!statuses.includes(status as never)) add(line,id||null,'status','worker-bad-value','Use active, leave or terminated.');
    const rawHire=clean(value.hireDate) as string, hireDate=rawHire?dateValue(rawHire,format):null;
    if(rawHire&&!hireDate) add(line,id||null,'hireDate','worker-bad-date','Enter a real hire date in the selected date format.');
    const rawEffective=clean(value.effectiveAt) as string, effectiveAt=rawEffective?dateValue(rawEffective,format,true):null;
    if(rawEffective&&!effectiveAt) add(line,id||null,'effectiveAt','worker-bad-date','Enter a real effective date in the selected date format.');
    const managerEmployeeId=(clean(value.managerEmployeeId) as string)||null;
    if(managerEmployeeId===id && id) add(line,id,'managerEmployeeId','worker-bad-value','An employee cannot manage themself.');
    if(rowErrors.length===base) rows.push({line,record:{employeeId:id,email,name,jobCode,jobTitle:clean(value.jobTitle) as string,department,location,employmentType:employmentType as WorkerRecordInput['employmentType'],managerEmployeeId,hireDate,status:status as WorkerRecordInput['status'],...(effectiveAt?{effectiveAt}:{})}});
  }
  // A manager must have a valid row in this file or an existing stored version.
  let changed=true;
  while(changed) {
    changed=false; const available=new Set([...existing.map(x=>x.employeeId),...rows.map(x=>x.record.employeeId)]);
    for(let i=rows.length-1;i>=0;i--) {
      const row=rows[i], manager=row.record.managerEmployeeId;
      if(manager&&!available.has(manager)) { add(row.line,row.record.employeeId,'managerEmployeeId','worker-unknown-manager','Add a valid row for the manager or use an existing employee ID.'); rows.splice(i,1);changed=true; }
    }
  }
  return {rows:rows.sort((a,b)=>cmp(a.record.employeeId,b.record.employeeId)||a.line-b.line),rowErrors:rowErrors.sort((a,b)=>a.line-b.line||cmp(a.field??'',b.field??'')||cmp(a.code,b.code))};
}

export function currentWorkers(records:WorkerRecord[],now:string):WorkerRecord[] {
  const byId=new Map<string,WorkerRecord>();
  for(const r of records) if(r.effectiveAt<=now) {const prior=byId.get(r.employeeId);if(!prior||r.effectiveAt>prior.effectiveAt)byId.set(r.employeeId,r);}
  return [...byId.values()].sort((a,b)=>cmp(a.employeeId,b.employeeId));
}
export function suggestedUser(record:Pick<WorkerRecordInput,'email'>,links:WorkerLink[],users:User[]):User|null {
  const candidates=users.filter(u=>u.email.toLowerCase()===record.email.toLowerCase()&&!links.some(l=>l.userId===u.id));
  return candidates.length===1?candidates[0]:null;
}
export interface WorkerImportPlanInput { rows:ValidWorkerRow[]; rowErrors?:WorkerError[]; existing:WorkerRecord[]; links:WorkerLink[]; users:User[]; members:RuleMember[]; requirements:Requirement[]; courses?:Course[]; completions:CompletionEvent[]; now:string; asOf:string }
export function planWorkerImport(input:WorkerImportPlanInput):WorkerChangeSet {
  const {existing,links,users,now,asOf}=input;
  const people:Record<WorkerChangeKind,number>={add:0,update:0,leave:0,terminate:0,rehire:0,unchanged:0};
  const linkCounts={linked:0,suggested:0,unlinked:0};const changes:WorkerChangeSet['changes']=[];
  const rowErrors=[...(input.rowErrors??[])];
  const simulated=[...existing];
  for(const {line,record} of [...input.rows].sort((a,b)=>cmp(a.record.employeeId,b.record.employeeId)||a.line-b.line)) {
    const versions=existing.filter(x=>x.employeeId===record.employeeId);
    const effectiveAt=record.effectiveAt??asOf;
    const candidate={...record,effectiveAt,receivedAt:asOf,source:'json' as const,importId:''};
    const exact=versions.find(x=>x.effectiveAt===effectiveAt);
    const current=currentWorkers(versions,now).at(0);
    const prior=versions.filter(x=>x.effectiveAt<effectiveAt).sort((a,b)=>cmp(b.effectiveAt,a.effectiveAt))[0];
    const content=(x:WorkerRecord|typeof candidate)=>stableJson(Object.fromEntries(fields.map(k=>[k,x[k]])));
    let kind:WorkerChangeKind;
    if(exact) {
      if(content(exact)!==content(candidate)) { rowErrors.push({line,employeeId:record.employeeId,field:'effectiveAt',code:'worker-version-conflict',message:'Choose a new effective date; existing history cannot be changed.'}); continue; }
      kind='unchanged';
    } else if(current && effectiveAt<current.effectiveAt) {
      rowErrors.push({line,employeeId:record.employeeId,field:'effectiveAt',code:'worker-version-conflict',message:`This effective date is before the current HR record; history can't be rewritten. Use ${current.effectiveAt.slice(0,10)} or later.`}); continue;
    } else if(prior&&content(prior)===content(candidate)) kind='unchanged';
    else if(!versions.length) kind='add';
    else if(record.status==='terminated'&&prior?.status!=='terminated') kind='terminate';
    else if(prior?.status==='terminated'&&record.status!=='terminated') kind='rehire';
    else if(record.status==='leave'&&prior?.status!=='leave') kind='leave';
    else kind='update';
    people[kind]++;
    const link=links.find(l=>l.employeeId===record.employeeId),suggestion=!link?suggestedUser(record,links,users):null;
    if(link)linkCounts.linked++;else if(suggestion)linkCounts.suggested++;else linkCounts.unlinked++;
    if(kind!=='unchanged') {
      const changed:WorkerField[]=fields.filter(f=>!prior||prior[f]!==candidate[f]);
      if(effectiveAt>now) changed.push('effectiveAt');
      changes.push({line,employeeId:record.employeeId,name:record.name,kind,fields:changed,effectiveAt,suggestedUserId:suggestion?.id??null});
      simulated.push(candidate);
    }
  }
  const current=currentWorkers(simulated,now);
  const ruleEffects=input.requirements.filter(r=>r.audience.kind==='rule').map(r=>{
    const target=r.target;
    const targetCourseIds=target.kind==='course'?[target.courseId]:(input.courses??[]).filter(c=>c.programId===target.programId).map(c=>c.id);
    const preview=planRule({requirement:r,records:current,allRecords:simulated,links,users,members:input.members.filter(m=>m.requirementId===r.id),completions:input.completions,now,targetCourseIds});
    return {requirementId:r.id,add:preview.add.length,remove:preview.remove.length};
  }).sort((a,b)=>cmp(a.requirementId,b.requirementId));
  rowErrors.sort((a,b)=>a.line-b.line||cmp(a.field??'',b.field??'')||cmp(a.code,b.code));
  const summary=`Will add ${people.add} people, update ${people.update}, put ${people.leave} on leave, mark ${people.terminate} as terminated, and rehire ${people.rehire}. Removes nothing. ${new Set(rowErrors.map(x=>x.line)).size} rows have errors and will be skipped.`;
  const candidates=changes.map(change=>({line:change.line,record:{...input.rows.find(x=>x.line===change.line&&x.record.employeeId===change.employeeId)!.record,effectiveAt:change.effectiveAt}}));
  const hash=stableHash({asOf,changes,candidates,rowErrors,links:linkCounts,ruleEffects});
  return {asOf,people,links:linkCounts,changes,rowErrors,ruleEffects,summary,hash};
}
