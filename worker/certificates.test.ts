import { describe,expect,it } from 'vitest';
import type { Certificate } from '../shared/domain';
import { seedData } from '../shared/seed';
import { checkPdf } from './access/pdf';
import { certificatePdf } from './certificates';
import { D1Repo } from './d1-repo';
import worker from './index';
import { createTestDb } from './test/d1-shim';
import tokens from '../design/tokens.json';
import { readFileSync } from 'node:fs';

const cert:Certificate={id:'cert-test',code:'TSR-7K2M-94QD',userId:'u-dana',learnerName:'Dana Whitfield',courseId:'c-ops101',courseTitle:'Lockout and Tagout Basics',issuedAt:'2026-09-27T00:00:00.000Z',basis:'tested-out',replaces:null,replacedBy:null};
const buffer=(bytes:Uint8Array)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
function env(db:ReturnType<typeof createTestDb>){return{DB:db,ENVIRONMENT:'local',ACCESS_TEAM_DOMAIN:'team.test.cloudflareaccess.com',ACCESS_AUD:'aud-test',ASSETS:{fetch:async()=>new Response('missing',{status:404})}} as never;}

describe('certificate worker pages',()=>{
  it('produces a tagged PDF with a document tree, heading, metadata, and no critical scan issue',async()=>{
    const response=await certificatePdf(cert,'https://tessera.example');
    const bytes=await response.arrayBuffer();const scan=await checkPdf(bytes);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(scan.document.tagged).toBe(true);
    expect(scan.issues.filter(i=>i.severity==='critical')).toEqual([]);
    expect(scan.issues.map(i=>i.code)).not.toContain('pdf_no_headings');
    expect(scan.text.sections[0].text).toContain('Dana Whitfield');
  });
  it('embeds Latin and Cyrillic names in tagged PDFs and rejects unsupported CJK names',async()=>{
    for(const name of ['Zoë Ångström-Łukasik','Дмитрий Петров']){
      const response=await certificatePdf({...cert,learnerName:name},'https://tessera.example');
      const scan=await checkPdf(await response.arrayBuffer());
      expect(scan.document.tagged).toBe(true);
      expect(scan.text.sections[0].text).toContain(name);
    }
    await expect(certificatePdf({...cert,learnerName:'李明'},'https://tessera.example')).rejects.toMatchObject({code:'unsupported',message:"This certificate's name uses characters the PDF can't show yet. Use Print or save as PDF on the certificate page."});
  });
  it('uses design tokens for verification page colors without inline hex literals',async()=>{
    const page=await (await import('./certificates')).verificationPage({code:cert.code,valid:true,courseTitle:cert.courseTitle,issuedAt:cert.issuedAt,replaced:false});
    const html=await page.text();
    for(const name of ['paper','surface','ink','line','accent','focus','success-text'] as const)expect(html).toContain(tokens.color[name].$value);
    expect(readFileSync(new URL('./certificates.ts',import.meta.url),'utf8')).not.toMatch(/#[\da-fA-F]{3,8}\b/);
  });
  it('rejects malformed verification codes before touching the database',async()=>{
    const noDb={ get DB(){throw new Error('database queried');},ASSETS:{fetch:async()=>new Response('missing',{status:404})} } as never;
    for(const path of ['/verify/%ZZ',`/verify/${'A'.repeat(500)}`]){
      const response=await worker.fetch(new Request(`http://localhost${path}`),noDb,{} as never);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain('No certificate has this code');
    }
  });
  it('serves public verification without a name and restricts the PDF to the learner',async()=>{
    const db=createTestDb(),repo=new D1Repo(db);await repo.reset(seedData());await repo.insertCertificate(cert);const e=env(db);
    const fetch=(path:string,init:RequestInit={})=>worker.fetch(new Request(`http://localhost${path}`,init),e,{} as never);
    const valid=await fetch('/verify/TSR-7K2M-94QD');expect(valid.status).toBe(200);expect(valid.headers.get('content-type')).toContain('text/html');const html=await valid.text();expect(html).toContain('Valid certificate');expect(html).toContain(cert.courseTitle);expect(html).not.toContain(cert.learnerName);expect(html).toContain('noindex');
    const missing=await fetch('/verify/NOPE');expect(missing.status).toBe(200);expect(await missing.text()).toContain('No certificate has this code');
    for(const path of ['/verify/%ZZ',`/verify/${'A'.repeat(500)}`]){
      const invalid=await fetch(path);expect(invalid.status).toBe(404);expect(await invalid.text()).toContain('No certificate has this code');
    }
    const denied=await fetch('/api/v1/certificates/cert-test/pdf',{headers:{cookie:'tessera_user=u-jordan'}});expect(denied.status).toBe(403);
    const allowed=await fetch('/api/v1/certificates/cert-test/pdf',{headers:{cookie:'tessera_user=u-dana'}});expect(allowed.status).toBe(200);expect(allowed.headers.get('content-type')).toBe('application/pdf');
    await repo.insertCertificate({...cert,id:'cert-cjk',code:'TSR-CJK-TEST',learnerName:'李明'});
    const unsupported=await fetch('/api/v1/certificates/cert-cjk/pdf',{headers:{cookie:'tessera_user=u-dana'}});
    expect(unsupported.status).toBe(415);
    expect(await unsupported.text()).toContain("This certificate's name uses characters the PDF can't show yet. Use Print or save as PDF on the certificate page.");
  });
});
