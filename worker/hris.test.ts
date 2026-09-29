import { describe, expect, it } from 'vitest';
import type { Repo } from '../shared/repo';
import type { ServiceContext } from '../shared/service/context';
import type { WorkerRecord, WorkerRecordInput } from '../shared/domain';
import { seedData } from '../shared/seed';
import { MemoryRepo, dispatch, service } from '../shared/service';
import { D1Repo } from './d1-repo';
import { createTestDb } from './test/d1-shim';
import { workerFixtures } from '../shared/hris/fixtures';
import { csvObjects, parseCsv } from '../shared/hris/csv';
import { currentWorkers, planWorkerImport, validateWorkerRows } from '../shared/hris/records';
import { evaluateRule, planRule, validateRule } from '../shared/hris/rules';
import { validateInput } from '../shared/schema';

const now='2026-09-28T12:00:00.000Z';
let next=0;
const mk=async(kind:'memory'|'d1'):Promise<Repo>=>{if(kind==='memory')return new MemoryRepo(seedData());const repo=new D1Repo(createTestDb() as never);await repo.reset(seedData());return repo;};
const ctx=async(repo:Repo,userId='u-admin'):Promise<ServiceContext>=>({repo,ai:{run:async()=>{throw Error('AI unused');}} as never,user:await repo.getUser(userId),now:()=>now,newId:p=>`${p}-hris-${++next}`});
const input=(overrides:Partial<WorkerRecordInput>={}):WorkerRecordInput=>({...workerFixtures[0],employeeId:'MS-101',name:'Taylor Quinn',email:'taylor.quinn@example.test',managerEmployeeId:null,...overrides});
const stored=(overrides:Partial<WorkerRecord>={}):WorkerRecord=>({...input(),effectiveAt:'2026-09-28T00:00:00.000Z',receivedAt:now,source:'csv',importId:'imp-1',...overrides});
const rule={match:'all' as const,conditions:[{field:'location' as const,op:'in' as const,values:['North Campus Facilities']}]};

// Deterministic parser and validation run without repository state.
describe('HRIS CSV and planning',()=>{
  it('binds every stored candidate value and its effective date into the preview hash',()=>{
    const a=validateWorkerRows([{line:1,value:input()}],[],'iso');
    const b=validateWorkerRows([{line:1,value:input({jobCode:'FL-2',location:'South Campus Grounds',status:'leave'})}],[],'iso');
    const common={existing:[],links:[],users:[],members:[],requirements:[],completions:[],now,asOf:now};
    expect(planWorkerImport({...common,...a}).hash).not.toBe(planWorkerImport({...common,...b}).hash);
  });
  it('rejects hostile known values without throwing and ignores unknown JSON keys',()=>{
    const hostile=[{toString:0},[],42,true,{nested:{toString:0}}];
    const raw=hostile.map((name,i)=>({line:i+1,value:{...input({employeeId:`MS-${i+200}`}),name}}));
    raw.push({line:6,value:{...input({employeeId:'MS-300'}),__tooLong:true,unknown:'x'.repeat(501)}});
    const result=validateWorkerRows(raw,[],'iso');
    expect(result.rows.map(x=>x.record.employeeId)).toEqual(['MS-300']);
    expect(new Set(result.rowErrors.filter(x=>x.field==='name'&&x.code==='worker-bad-value').map(x=>x.line)).size).toBe(5);
    expect(JSON.stringify(result.rows[0].record)).not.toContain('unknown');
  });
  it('rejects rules through the API schema whenever service validation rejects them',()=>{
    const base={target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}};
    const invalid=[{field:'hireDate',op:'within-days',days:0},{field:'hireDate',op:'within-days',days:3651},{field:'hireDate',op:'within-days',days:1.5},{field:'location',op:'in',values:[]},{field:'location',op:'in',values:Array(101).fill('x')},{field:'location',op:'in',values:['x'.repeat(101)]},{field:'location',op:'in',values:['North','north']},{field:'location',op:'in',values:[' North']},{field:'location',op:'in',values:['=SUM(1)']},{field:'employmentType',op:'in',values:['freelance']}];
    for(const condition of invalid)expect(()=>validateInput('createRequirement',{...base,audience:{kind:'rule',rule:{match:'all',conditions:[condition]}}})).toThrow();
    expect(()=>validateInput('createRequirement',{...base,target:{kind:'program',programId:'p-facilities'}})).toThrow();
    expect(()=>validateInput('createRequirement',base)).not.toThrow();
  });
  it('handles BOM, RFC 4180 quoting, CRLF, embedded lines and hostile/unknown headers',()=>{
    const csv='\ufeff__proto__,Employee ID,email,name,job_code,department,location,employment_type,status,Unknown\r\n'+
      'evil,MS-101,taylor.quinn@example.test,"Taylor,\r\nQuinn",FL-1,Facilities and Operations,North Campus Facilities,full-time,active,discard\r\n\r\n';
    expect(parseCsv(csv)).toHaveLength(2);
    const parsed=csvObjects(csv);
    expect(parsed.rows[0].value).not.toHaveProperty('Unknown');expect(parsed.rows[0].value).not.toHaveProperty('__proto__');
    expect(parsed.rows[0].value.name).toBe('Taylor,\r\nQuinn');
    expect(parseCsv('a,b\r1,2\n3,4')).toHaveLength(3);
    expect(parseCsv('name\n"Taylor ""TJ"" Quinn"')[1].cells[0]).toBe('Taylor "TJ" Quinn');
    expect(csvObjects('employeeId,email,name,jobCode,department,location,employmentType,status,ignored\nMS-999,a@example.test,A,FL-1,Facilities and Operations,North Campus Facilities,full-time,active,'+'x'.repeat(501)).rows[0].tooLong).toBe(true);
    expect(()=>parseCsv('a,b\n"unfinished')).toThrow(/unterminated/);
    expect(()=>parseCsv('x'.repeat(2_000_001))).toThrow(/2,000,000/);
    expect(()=>parseCsv(Array(62).fill('x').join(','))).toThrow(/60 columns/);
    expect(()=>parseCsv('a\n'+'x\n'.repeat(5001))).toThrow(/5,000/);
  });
  it('classifies row errors, formula prefixes, duplicates, and strict dates',()=>{
    const raw=[{line:1,value:input()},{line:2,value:input({employeeId:'ms-101'})},{line:3,value:input({employeeId:''})},{line:4,value:input({email:'bad'})},{line:5,value:input({hireDate:'2026-02-30'})},{line:6,value:input({employeeId:'MS-106',managerEmployeeId:'MS-404'})},{line:7,value:input({managerEmployeeId:'MS-107',employeeId:'MS-107'})},{line:8,value:{...input({employeeId:'MS-108'}),name:'a'.repeat(501)}}];
    const {rows,rowErrors}=validateWorkerRows(raw,[],'iso');
    expect(rows.map(r=>r.record.employeeId)).toEqual(['MS-101']);
    expect(new Set(rowErrors.map(e=>e.code))).toEqual(new Set(['worker-duplicate-id','worker-missing-id','worker-bad-email','worker-bad-date','worker-unknown-manager','worker-bad-value','worker-too-long']));
    for(const field of ['employeeId','name','jobCode','jobTitle','department','location','managerEmployeeId'] as const) for(const prefix of ['=','+','-','@','＝','＋','－','＠','  =','\t=','\r=']) {
      const value={...input({employeeId:'MS-999'}),[field]:`${prefix}SUM(1)`};
      expect(validateWorkerRows([{line:1,value}],[],'iso').rowErrors.some(e=>e.field===field&&e.code==='worker-unsafe-value')).toBe(true);
    }
    expect(validateWorkerRows([{line:1,value:input({name:'Bad\nName'})}],[],'iso').rowErrors.some(e=>e.code==='worker-bad-value')).toBe(true);
    expect(validateWorkerRows([{line:1,value:input(),tooLong:true}],[],'iso').rowErrors[0].code).toBe('worker-too-long');
    for(const [format,date,expected] of [['iso','2026-09-10','2026-09-10'],['mdy','9/10/2026','2026-09-10'],['dmy','10/9/2026','2026-09-10']] as const) {
      expect(validateWorkerRows([{line:1,value:input({hireDate:date})}],[],format).rows[0].record.hireDate).toBe(expected);
    }
    expect(validateWorkerRows([{line:1,value:input({hireDate:'9/10/26'})}],[],'mdy').rowErrors[0].code).toBe('worker-bad-date');
    expect(validateWorkerRows([{line:1,value:input({hireDate:'2/30/2026'})}],[],'mdy').rowErrors[0].code).toBe('worker-bad-date');
    expect(validateWorkerRows([{line:1,value:input({effectiveAt:'2026-09-28T10:30:00Z'})}],[],'iso').rows[0].record.effectiveAt).toBe('2026-09-28T10:30:00.000Z');
  });
  it('detects version conflicts, future versions, changes and deterministic link suggestions',()=>{
    const existing=[stored({employeeId:'MS-101',status:'terminated'}),stored({employeeId:'MS-200',effectiveAt:'2026-09-29T00:00:00.000Z'})];
    const rows=validateWorkerRows([{line:1,value:input({status:'active',effectiveAt:'2026-09-29'})},{line:2,value:input({employeeId:'MS-200',effectiveAt:'2026-09-29',name:'Different'})}],existing,'iso');
    const preview=planWorkerImport({...rows,existing,links:[],users:[],members:[],requirements:[],completions:[],now,asOf:now});
    expect(preview.people.rehire).toBe(1);expect(preview.rowErrors.some(e=>e.code==='worker-version-conflict')).toBe(true);
    expect(currentWorkers([...existing,stored({effectiveAt:'2026-09-29T00:00:00.000Z',status:'active'})],now).find(r=>r.employeeId==='MS-101')?.status).toBe('terminated');
    expect(preview.changes[0].fields).toContain('effectiveAt');
  });
  it('previews completed learners, leave, termination, and unlinked workers',()=>{
    const r=stored({employeeId:'MS-301'}),leaver=stored({employeeId:'MS-302',status:'leave'}),unlinked=stored({employeeId:'MS-303'});
    const users=[{...seedData().users.find(u=>u.id==='u-priya')!,id:'u-a'},{...seedData().users.find(u=>u.id==='u-marcus')!,id:'u-b'}];
    const links=[{employeeId:'MS-301',userId:'u-a',linkedBy:'u-admin',linkedAt:now},{employeeId:'MS-302',userId:'u-b',linkedBy:'u-admin',linkedAt:now}];
    const requirement={id:'req-1',target:{kind:'course' as const,courseId:'c-ops101'},audience:{kind:'rule' as const,rule},dueAt:null,recurrence:'none' as const,createdBy:'u-admin',createdAt:now};
    const completions=[{id:'ev-done',userId:'u-a',courseId:'c-ops101',requirementId:'req-1',at:'2026-09-27T12:00:00.000Z',kind:'completed' as const,actorId:null,detail:'Completed.'}];
    const p=planRule({requirement,records:[r,leaver,unlinked],links,users,members:[],completions,now});
    expect(p.add).toMatchObject([{userId:'u-a',previousCompletionAt:'2026-09-27T12:00:00.000Z'},{userId:'u-b',previousCompletionAt:null}]);expect(p.skipped.unlinked).toBe(1);
    const assigned={requirementId:'req-1',userId:'u-a',state:'assigned' as const,revision:1,reasons:['Location is North Campus Facilities'],changedAt:now,changedBy:'u-admin'};
    const terminated=planRule({requirement,records:[{...r,status:'terminated'},leaver],links,users,members:[assigned],completions,now});
    expect(terminated.remove[0]).toMatchObject({userId:'u-a',hasCompleted:true,reasons:['Employment status is terminated']});
    expect(terminated.add.map(x=>x.userId)).toContain('u-b');
  });
  it('evaluates all/any/not-in, dates and stable preview output across orderings',()=>{
    const r=stored({hireDate:'2026-09-10'});
    expect(evaluateRule(rule,r,now)).toEqual({matches:true,reasons:['Location is North Campus Facilities']});
    expect(evaluateRule({match:'all',conditions:[...rule.conditions,{field:'jobCode',op:'not-in',values:['OFF-1']},{field:'hireDate',op:'within-days',days:18}]},r,now).matches).toBe(true);
    expect(evaluateRule({match:'any',conditions:[{field:'jobCode',op:'in',values:['off-1']},...rule.conditions]},r,now).matches).toBe(true);
    expect(evaluateRule({match:'all',conditions:[{field:'hireDate',op:'within-days',days:17}]},r,now).matches).toBe(false);
    expect(validateRule({match:'all',conditions:[{field:'location',op:'in',values:['North','north']}]})).toMatch(/distinct/);
    expect(validateRule({match:'all',conditions:[{field:'location',op:'in',values:['\tNorth']}]})).toMatch(/safe/);
    const requirement={id:'req-1',target:{kind:'course' as const,courseId:'c-ops101'},audience:{kind:'rule' as const,rule},dueAt:null,recurrence:'none' as const,createdBy:'u-admin',createdAt:now};
    const users=[{...seedData().users.find(u=>u.id==='u-priya')!,id:'u-a',name:'A'},{...seedData().users.find(u=>u.id==='u-marcus')!,id:'u-b',name:'B'}];
    const records=[stored({employeeId:'MS-101'}),stored({employeeId:'MS-102'})],links=[{employeeId:'MS-101',userId:'u-a',linkedBy:'u-admin',linkedAt:now},{employeeId:'MS-102',userId:'u-b',linkedBy:'u-admin',linkedAt:now}];
    const first=planRule({requirement,records,links,users,members:[],completions:[],now});
    let seed=7;const shuffle=<T>(items:T[])=>{const out=[...items];for(let j=out.length-1;j>0;j--){seed=(seed*1664525+1013904223)>>>0;const k=seed%(j+1);[out[j],out[k]]=[out[k],out[j]];}return out;};
    for(let i=0;i<20;i++)expect(planRule({requirement,records:shuffle(records),links:shuffle(links),users:shuffle(users),members:[],completions:[],now})).toEqual(first);
  });
});

for(const kind of ['memory','d1'] as const) describe(`HRIS service ${kind}`,()=>{
  it('projects JSON rows to known fields and continues after hostile types',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);
    const source={format:'json' as const,records:[{...input({employeeId:'MS-201'}),name:{toString:0}},{...input({employeeId:'MS-202'}),__tooLong:true,unknown:'x'.repeat(501)}]} as never;
    const preview=await dispatch(service,admin,'previewWorkerImport',{source});
    expect(preview.rowErrors.some(e=>e.line===1&&e.field==='name'&&e.code==='worker-bad-value')).toBe(true);
    expect(preview.changes.map(x=>x.employeeId)).toEqual(['MS-202']);
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash});
    expect(JSON.stringify(await repo.listWorkerRecords())).not.toContain('unknown');
  });
  it('rejects applying changed values under a previewed hash',async()=>{
    const repo=await mk(kind),admin=await ctx(repo),source={format:'json' as const,records:[input()]};
    const preview=await dispatch(service,admin,'previewWorkerImport',{source});
    for(const field of ['jobCode','location','status'] as const){
      const changed={...input(),[field]:field==='status'?'leave':'Different'};
      await expect(dispatch(service,admin,'applyWorkerImport',{source:{format:'json',records:[changed]},asOf:preview.asOf,hash:preview.hash})).rejects.toMatchObject({code:'conflict'});
    }
    expect(await repo.listWorkerRecords()).toEqual([]);
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash});
    await expect(dispatch(service,admin,'applyWorkerImport',{source:{format:'json',records:[input({jobCode:'FL-2'})]},asOf:preview.asOf,hash:preview.hash})).rejects.toMatchObject({code:'conflict'});
    expect(await repo.listWorkerRecords()).toHaveLength(1);
  });
  it('keeps future correction rows, unchanged current rows, and refuses backdated history',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);
    const apply=async(record:WorkerRecordInput)=>{const source={format:'json' as const,records:[record]},p=await dispatch(service,admin,'previewWorkerImport',{source});await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash});return p;};
    await apply(input({effectiveAt:'2026-09-01'}));
    await apply(input({status:'terminated',effectiveAt:'2026-09-30'}));
    expect((await apply(input({effectiveAt:'2026-10-01'}))).people.rehire).toBe(1);
    expect((await repo.listWorkerRecords({employeeId:'MS-101'}))).toHaveLength(3);
    expect((await dispatch(service,admin,'previewWorkerImport',{source:{format:'json',records:[input()]}})).people.unchanged).toBe(1);
    const backdated=await dispatch(service,admin,'previewWorkerImport',{source:{format:'json',records:[input({jobCode:'FL-2',effectiveAt:'2026-08-31'})]}});
    expect(backdated.rowErrors).toMatchObject([{code:'worker-version-conflict',message:expect.stringContaining('Use 2026-09-01 or later.')}]);
    expect((await repo.listWorkerRecords({employeeId:'MS-101'}))).toHaveLength(3);
  });
  it('claims an import before writes and exposes rows left by a crash in the next preview',async()=>{
    const repo=await mk(kind),admin=await ctx(repo),source={format:'json' as const,records:[input(),input({employeeId:'MS-102',email:'other@example.test'})]};
    const p=await dispatch(service,admin,'previewWorkerImport',{source});
    const original=repo.insertWorkerRecord.bind(repo);let calls=0;
    repo.insertWorkerRecord=async(record,guard)=>{if(++calls===2)throw Error('simulated crash');return original(record,guard);};
    await expect(dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash})).rejects.toThrow('simulated crash');
    repo.insertWorkerRecord=original;
    expect(await repo.findHrImportByHash(p.hash)).toMatchObject({incomplete:true});
    expect(await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash})).toMatchObject({alreadyApplied:true,message:'Previous apply did not finish. Preview again.'});
    const next=await dispatch(service,admin,'previewWorkerImport',{source});
    expect(next.hash).not.toBe(p.hash);expect(next.changes.map(x=>x.employeeId)).toEqual(['MS-102']);
    expect((await dispatch(service,admin,'applyWorkerImport',{source,asOf:next.asOf,hash:next.hash})).alreadyApplied).toBe(false);
    expect(await repo.listWorkerRecords()).toHaveLength(2);
  });
  it('offers a fresh preview after a receipt-only crash with a frozen clock',async()=>{
    const repo=await mk(kind),admin=await ctx(repo),source={format:'json' as const,records:[input()]};
    const first=await dispatch(service,admin,'previewWorkerImport',{source});
    const original=repo.insertWorkerRecord.bind(repo);repo.insertWorkerRecord=async()=>{throw Error('crash before first version');};
    await expect(dispatch(service,admin,'applyWorkerImport',{source,asOf:first.asOf,hash:first.hash})).rejects.toThrow('crash before first version');
    repo.insertWorkerRecord=original;
    const next=await dispatch(service,admin,'previewWorkerImport',{source});
    expect(next.hash).not.toBe(first.hash);expect(next.changes).toHaveLength(1);
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:next.asOf,hash:next.hash});
    expect(await repo.listWorkerRecords()).toHaveLength(1);
  });
  it('skips a planned noon update when a termination lands at 11:59',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);
    await repo.insertWorkerRecord(stored({effectiveAt:'2026-09-01T00:00:00.000Z'}));
    const source={format:'json' as const,records:[input({location:'South Campus Grounds',effectiveAt:'2026-09-28T12:00:00.000Z'})]};
    const preview=await dispatch(service,admin,'previewWorkerImport',{source});
    expect(preview.people.update).toBe(1);
    const original=repo.insertWorkerRecord.bind(repo);let interrupted=false;
    repo.insertWorkerRecord=async(record,guard)=>{
      if(!interrupted){interrupted=true;await original(stored({effectiveAt:'2026-09-28T11:59:00.000Z',status:'terminated',importId:'imp-other'}));}
      return original(record,guard);
    };
    const applied=await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash});
    repo.insertWorkerRecord=original;
    expect(applied).toMatchObject({skippedRows:1,message:'HR data changed during apply. Preview again.',people:{update:0}});
    expect((await repo.findHrImportByHash(preview.hash))?.incomplete).toBe(true);
    expect((await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash})).message).toBe('Previous apply did not finish. Preview again.');
    expect(currentWorkers(await repo.listWorkerRecords(),now)[0].status).toBe('terminated');
  });
  it('requires a course target and binds it into the rule hash',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);
    await expect(dispatch(service,admin,'createRequirement',{target:{kind:'program',programId:'p-facilities'},audience:{kind:'rule',rule}})).rejects.toMatchObject({code:'invalid',message:'Rule-based training targets one course for now.'});
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const first=await dispatch(service,admin,'previewRule',{requirementId:req.id});
    await repo.putRequirement({...req,target:{kind:'course',courseId:'c-stat110'}});
    const second=await dispatch(service,admin,'previewRule',{requirementId:req.id});
    expect(second.hash).not.toBe(first.hash);
  });
  for(const interruption of ['termination','delete','link'] as const) it(`rejects a stale rule membership when ${interruption} lands before CAS`,async()=>{
    const repo=await mk(kind),admin=await ctx(repo),later={...admin,now:()=> '2026-09-29T12:00:00.000Z'};
    const source={format:'json' as const,records:[input()]};const p=await dispatch(service,admin,'previewWorkerImport',{source});await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash});
    await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    if(interruption==='link'){const other={format:'json' as const,records:[input({employeeId:'MS-102',email:'other@example.test'})]},t=await dispatch(service,later,'previewWorkerImport',{source:other});await dispatch(service,later,'applyWorkerImport',{source:other,asOf:t.asOf,hash:t.hash});}
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const preview=await dispatch(service,later,'previewRule',{requirementId:req.id});
    const original=repo.assignRuleMember.bind(repo);let entered=false;
    repo.assignRuleMember=async(member,expected,guard,events,courseIds)=>{if(!entered){entered=true;
      if(interruption==='termination'){const changed={format:'json' as const,records:[input({status:'terminated',effectiveAt:'2026-09-29'})]},t=await dispatch(service,later,'previewWorkerImport',{source:changed});await dispatch(service,later,'applyWorkerImport',{source:changed,asOf:t.asOf,hash:t.hash});}
      if(interruption==='delete')await repo.deleteRequirement(req.id);
      if(interruption==='link')await dispatch(service,later,'confirmWorkerLink',{employeeId:'MS-102',userId:'u-marcus'});
    }return original(member,expected,guard,events,courseIds);};
    const result=await dispatch(service,later,'applyRule',{requirementId:req.id,hash:preview.hash});
    repo.assignRuleMember=original;
    expect(result.conflicts).toBeGreaterThanOrEqual(1);
    expect(result.message).toMatch(/Preview the rule again/);
    expect(await repo.listRuleMembers(req.id)).toEqual([]);
  });
  it('rejects assignment when the clock crosses a scheduled termination after recomputing the plan',async()=>{
    const repo=await mk(kind);
    const before='2026-09-28T23:59:59.999Z',after='2026-09-29T00:00:00.001Z';
    await repo.insertWorkerRecord(stored({effectiveAt:'2026-09-01T00:00:00.000Z'}));
    await repo.insertWorkerRecord(stored({effectiveAt:'2026-09-29T00:00:00.000Z',status:'terminated'}));
    await repo.insertWorkerLink({employeeId:'MS-101',userId:'u-priya',linkedBy:'u-admin',linkedAt:before});
    const admin={...await ctx(repo),now:()=>before};
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const preview=await dispatch(service,admin,'previewRule',{requirementId:req.id});
    expect(preview.add.map(x=>x.userId)).toEqual(['u-priya']);
    let reads=0;
    const advancing={...admin,now:()=>++reads===1?before:after};
    expect(await dispatch(service,advancing,'applyRule',{requirementId:req.id,hash:preview.hash})).toMatchObject({added:0,removed:0,conflicts:1,message:expect.stringMatching(/Preview the rule again/)});
    expect(await repo.listRuleMembers(req.id)).toEqual([]);
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'})).filter(e=>e.requirementId===req.id)).toEqual([]);
    expect(await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'})).toEqual([]);
  });
  it('does not re-enroll an assigned learner after an administrator removes enrollment',async()=>{
    const repo=await mk(kind),admin=await ctx(repo),source={format:'json' as const,records:[input()]};
    const p=await dispatch(service,admin,'previewWorkerImport',{source});await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash});
    await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const preview=await dispatch(service,admin,'previewRule',{requirementId:req.id});await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash});
    await dispatch(service,admin,'setCourseEnrollments',{courseId:'c-ops101',userIds:[]});
    expect(await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'})).toEqual([]);
    await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash});
    await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:'other-hash'});
    expect(await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'})).toEqual([]);
  });
  it('validates saved CSV mapping and discards unknown columns on import',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);
    await expect(dispatch(service,admin,'saveWorkerColumnMap',{columns:{employeeId:'ID',email:'id'},dateFormat:'iso'})).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,admin,'saveWorkerColumnMap',{columns:{employeeId:'x'.repeat(101)},dateFormat:'iso'})).rejects.toMatchObject({code:'invalid'});
    const map=await dispatch(service,admin,'saveWorkerColumnMap',{columns:{employeeId:'Worker ID'},dateFormat:'iso'});
    expect(await dispatch(service,admin,'getWorkerColumnMap',undefined)).toEqual(map);
    const csv='Worker ID,email,name,job_code,department,location,employment_type,status,private_field\nMS-501,taylor.quinn@example.test,Taylor Quinn,FL-1,Facilities and Operations,North Campus Facilities,full-time,active,discard';
    const source={format:'csv' as const,csv};const preview=await dispatch(service,admin,'previewWorkerImport',{source});expect(preview.people.add).toBe(1);
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash});
    const history=await dispatch(service,admin,'listWorkerRecords',{employeeId:'MS-501',history:true});
    expect(history).toHaveLength(1);expect(JSON.stringify(history)).not.toContain('private_field');expect(JSON.stringify(history)).not.toContain('discard');
  });
  it('keeps both previews side-effect free and imports idempotently with a hash',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);const source={format:'json' as const,records:[input()]};
    const before=await repo.listWorkerRecords();const preview=await dispatch(service,admin,'previewWorkerImport',{source});
    expect(await repo.listWorkerRecords()).toEqual(before);expect(await repo.findHrImportByHash(preview.hash)).toBeNull();expect(preview.people.add).toBe(1);
    await expect(dispatch(service,admin,'previewWorkerImport',{source:{format:'json',records:Array(1001).fill(input())}})).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,admin,'applyWorkerImport',{source,asOf:'2026-09-26T00:00:00.000Z',hash:preview.hash})).rejects.toMatchObject({code:'invalid'});
    await expect(dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:'wrong'})).rejects.toMatchObject({code:'conflict'});
    const applied=await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash});
    expect(applied.people.add).toBe(1);expect((await repo.listWorkerRecords())).toHaveLength(1);
    expect((await dispatch(service,admin,'previewWorkerImport',{source})).people.unchanged).toBe(1);
    expect((await dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash})).alreadyApplied).toBe(true);
    const again=await dispatch(service,admin,'previewWorkerImport',{source});await dispatch(service,admin,'applyWorkerImport',{source,asOf:again.asOf,hash:again.hash});
    expect((await repo.listWorkerRecords())).toHaveLength(1);
  });
  it('stores future versions in history while current reads stay effective-dated',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);const base={format:'json' as const,records:[input()]};let p=await dispatch(service,admin,'previewWorkerImport',{source:base});await dispatch(service,admin,'applyWorkerImport',{source:base,asOf:p.asOf,hash:p.hash});
    const future={format:'json' as const,records:[input({location:'South Campus Grounds',effectiveAt:'2026-09-30'})]};p=await dispatch(service,admin,'previewWorkerImport',{source:future});
    await dispatch(service,admin,'applyWorkerImport',{source:future,asOf:p.asOf,hash:p.hash});
    expect((await dispatch(service,admin,'listWorkerRecords',{}))[0].location).toBe('North Campus Facilities');
    expect(await dispatch(service,admin,'listWorkerRecords',{history:true})).toHaveLength(2);
    const later={...admin,now:()=> '2026-09-30T12:00:00.000Z'};
    expect((await dispatch(service,later,'listWorkerRecords',{}))[0].location).toBe('South Campus Grounds');
  });
  it('applies a rule with events, enrollment, removal, repair and revised re-add',async()=>{
    const repo=await mk(kind),admin=await ctx(repo),priya=await ctx(repo,'u-priya');
    const record=input({email:'PRIYA.N@EXAMPLE.TEST'});
    const seedUser=(await repo.getUser('u-priya'))!;await repo.putUser({...seedUser,email:'priya.n@example.test'});
    const source={format:'json' as const,records:[record]};const imp=await dispatch(service,admin,'previewWorkerImport',{source});
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:imp.asOf,hash:imp.hash});
    expect(await dispatch(service,admin,'listWorkerLinkSuggestions',undefined)).toMatchObject([{employeeId:'MS-101',userId:'u-priya'}]);
    await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    expect(await dispatch(service,admin,'listWorkerLinkSuggestions',undefined)).toEqual([]);
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    expect(await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'})).toEqual([]);
    const preview=await dispatch(service,admin,'previewRule',{requirementId:req.id});expect(preview.add).toHaveLength(1);
    expect(await repo.listRuleMembers(req.id)).toEqual([]);
    await expect(dispatch(service,admin,'applyRule',{requirementId:req.id,hash:'wrong'})).rejects.toMatchObject({code:'conflict'});
    expect(await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash})).toEqual({added:1,removed:0,conflicts:0});
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'}))[0]).toMatchObject({kind:'assigned',actorId:'u-admin',detail:expect.stringContaining('North Campus Facilities')});
    expect((await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'}))).toHaveLength(1);
    expect((await dispatch(service,priya,'listMyTraining',undefined)).some(x=>x.requirementId===req.id)).toBe(true);
    await repo.appendCompletionEvent({id:'ev-training-finished',at:now,userId:'u-priya',courseId:'c-ops101',requirementId:req.id,kind:'completed',actorId:null,detail:'Completed.'});
    await repo.insertCertificate({id:'cert-hr-test',code:'TSR-HRTEST',userId:'u-priya',learnerName:'Priya Natarajan',courseId:'c-ops101',courseTitle:'Lockout/tagout essentials',issuedAt:now,basis:'completed',replaces:null,replacedBy:null});
    expect(await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash})).toEqual({added:0,removed:0,conflicts:0});
    const later='2026-09-29T12:00:00.000Z';const nextAdmin={...admin,now:()=>later};const nextPriya={...priya,now:()=>later};
    const changed={...record,location:'South Campus Grounds',effectiveAt:'2026-09-29'};const imp2=await dispatch(service,nextAdmin,'previewWorkerImport',{source:{format:'json',records:[changed]}});
    await dispatch(service,nextAdmin,'applyWorkerImport',{source:{format:'json',records:[changed]},asOf:imp2.asOf,hash:imp2.hash});
    const removal=await dispatch(service,nextAdmin,'previewRule',{requirementId:req.id});expect(removal.remove).toHaveLength(1);
    await dispatch(service,nextAdmin,'applyRule',{requirementId:req.id,hash:removal.hash});
    expect((await repo.listRuleMembers(req.id))[0].revision).toBe(2);
    expect((await dispatch(service,nextPriya,'listMyTraining',undefined)).some(x=>x.requirementId===req.id)).toBe(false);
    const events=await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'});expect(events.filter(e=>e.id.startsWith('ev-rule-')).map(e=>e.kind)).toEqual(['assigned','unassigned']);
    expect(events.some(e=>e.id==='ev-training-finished')).toBe(true);expect(await repo.getCertificate('cert-hr-test')).not.toBeNull();
    expect((await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'}))).toHaveLength(1);
    const third='2026-09-30T12:00:00.000Z',thirdAdmin={...admin,now:()=>third};
    const readd={...record,effectiveAt:'2026-09-30'};const imp3=await dispatch(service,thirdAdmin,'previewWorkerImport',{source:{format:'json',records:[readd]}});
    await dispatch(service,thirdAdmin,'applyWorkerImport',{source:{format:'json',records:[readd]},asOf:imp3.asOf,hash:imp3.hash});
    const again=await dispatch(service,thirdAdmin,'previewRule',{requirementId:req.id});expect(again.add).toHaveLength(1);
    await dispatch(service,thirdAdmin,'applyRule',{requirementId:req.id,hash:again.hash});
    expect((await repo.listRuleMembers(req.id))[0].revision).toBe(3);
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'})).filter(e=>e.id.startsWith('ev-rule-')).map(e=>e.kind)).toEqual(['assigned','unassigned','assigned']);
  });
  it('serializes concurrent imports and repairs a missing rule event after CAS',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);const source={format:'json' as const,records:[input()]};
    const preview=await dispatch(service,admin,'previewWorkerImport',{source});
    const both=await Promise.all([dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash}),dispatch(service,admin,'applyWorkerImport',{source,asOf:preview.asOf,hash:preview.hash})]);
    expect((await repo.listWorkerRecords())).toHaveLength(1);
    expect(both.filter(x=>!x.alreadyApplied)).toHaveLength(1);
    const person=(await repo.getUser('u-priya'))!;await repo.putUser({...person,email:'taylor.quinn@example.test'});
    await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const member={requirementId:req.id,userId:'u-priya',state:'assigned' as const,revision:1,reasons:['Location is North Campus Facilities'],changedAt:now,changedBy:'u-admin'};
    expect(await repo.putRuleMember(member,0,{hrRevision:await repo.getHrRevision()})).toBe(true);
    const rulePreview=await dispatch(service,admin,'previewRule',{requirementId:req.id});expect(rulePreview.add).toHaveLength(0);
    await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:rulePreview.hash});
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'})).filter(e=>e.id.endsWith('-r1'))).toHaveLength(1);
    expect((await repo.listEnrollments({courseId:'c-ops101',userId:'u-priya'}))).toHaveLength(1);
  });
  it('counts a rule membership CAS refusal without writing an event',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);const source={format:'json' as const,records:[input()]};const p=await dispatch(service,admin,'previewWorkerImport',{source});
    await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash});await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});
    const preview=await dispatch(service,admin,'previewRule',{requirementId:req.id});
    const original=repo.assignRuleMember.bind(repo);repo.assignRuleMember=async()=>false;
    expect(await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash})).toMatchObject({added:0,removed:0,conflicts:1,message:expect.stringMatching(/Preview the rule again/)});
    repo.assignRuleMember=original;expect(await repo.listRuleMembers(req.id)).toEqual([]);
    expect((await repo.listCompletionEvents({userId:'u-priya',courseId:'c-ops101'})).filter(e=>e.requirementId===req.id)).toEqual([]);
  });
  it('keeps HR fields out of learner and opted-in manager results',async()=>{
    const repo=await mk(kind),admin=await ctx(repo);const person=(await repo.getUser('u-priya'))!;await repo.putUser({...person,email:'taylor.quinn@example.test'});
    const source={format:'json' as const,records:[input()]};const p=await dispatch(service,admin,'previewWorkerImport',{source});await dispatch(service,admin,'applyWorkerImport',{source,asOf:p.asOf,hash:p.hash});
    await dispatch(service,admin,'confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'});
    const req=await dispatch(service,admin,'createRequirement',{target:{kind:'course',courseId:'c-ops101'},audience:{kind:'rule',rule}});const preview=await dispatch(service,admin,'previewRule',{requirementId:req.id});await dispatch(service,admin,'applyRule',{requirementId:req.id,hash:preview.hash});
    await repo.appendCompletionEvent({id:'ev-private-complete',at:now,userId:'u-priya',courseId:'c-ops101',requirementId:req.id,kind:'completed',actorId:null,detail:'Completed.'});
    await repo.insertCertificate({id:'cert-private',code:'TSR-PRIVATE',userId:'u-priya',learnerName:'Priya Natarajan',courseId:'c-ops101',courseTitle:'Lockout/tagout essentials',issuedAt:now,basis:'completed',replaces:null,replacedBy:null});
    await dispatch(service,admin,'addReportingLine',{managerId:'u-jordan',reportId:'u-priya'});
    const priya=await ctx(repo,'u-priya');await dispatch(service,priya,'setManagerSharing',{managerId:'u-jordan',sharing:true});
    const jordan=await ctx(repo,'u-jordan');const outputs=[await dispatch(service,jordan,'getManagerView',undefined),await dispatch(service,priya,'getMyVisibility',undefined),await dispatch(service,priya,'listMyTraining',undefined)];
    const json=JSON.stringify(outputs);
    for(const key of ['jobCode','jobTitle','department','location','employmentType','employeeId','managerEmployeeId','hireDate'])expect(json).not.toContain(`"${key}"`);
    for(const value of ['MS-101','FL-1','North Campus Facilities','Facilities and Operations'])expect(json).not.toContain(value);
    expect(JSON.stringify(outputs[0])).toContain('Lockout/tagout essentials');
    expect(JSON.stringify(outputs[0])).toContain('TSR-PRIVATE');
  });
  it('denies all new operations to non-admin personas',async()=>{
    const repo=await mk(kind);for(const id of ['u-okafor','u-priya','u-marcus']){
      const person=await ctx(repo,id);for(const [op,input] of [['getWorkerColumnMap',undefined],['saveWorkerColumnMap',{columns:{},dateFormat:'iso'}],['previewWorkerImport',{source:{format:'json',records:[]}}],['applyWorkerImport',{source:{format:'json',records:[]},asOf:now,hash:'x'}],['listWorkerRecords',{}],['listWorkerLinkSuggestions',undefined],['confirmWorkerLink',{employeeId:'MS-101',userId:'u-priya'}],['previewRule',{requirementId:'r'}],['applyRule',{requirementId:'r',hash:'x'}]] as const)
        await expect(dispatch(service,person,op,input as never)).rejects.toMatchObject({code:'forbidden'});
    }
  });
});
