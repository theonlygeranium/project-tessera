import { PDFDocument, PDFName, PDFOperator, PDFOperatorNames, StandardFonts, type PDFRef } from 'pdf-lib';
import type { Certificate, CertificateVerification } from '../shared/domain';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
const humanDate=(value:string)=>new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});

export function verificationPage(result:CertificateVerification):Response {
  const heading=!result.courseTitle?'No certificate has this code':result.replaced?'Replaced by a newer certificate':'Valid certificate';
  const body=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${heading} · Tessera</title><style>:root{color-scheme:light}body{margin:0;padding:2rem;background:#F4F1EB;color:#1C1B19;font:1rem/1.5 system-ui,sans-serif}main{max-width:38rem;margin:3rem auto;padding:2rem;background:#FFFFFF;border:1px solid #E3DED4;border-radius:.75rem}h1{font-size:2rem;line-height:1.2}dt{font-weight:700;margin-top:1rem}dd{margin:0}a{color:#0E6B63}a:focus-visible{outline:3px solid #0E6B63;outline-offset:3px}</style></head><body><main><h1>${heading}</h1>${result.courseTitle?`<dl><dt>Course</dt><dd>${escapeHtml(result.courseTitle)}</dd><dt>Issued</dt><dd>${humanDate(result.issuedAt!)}</dd></dl>`:'<p>Check the code and try again.</p>'}</main></body></html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}

export async function certificatePdf(cert:Certificate,origin:string):Promise<Response>{
  const pdf=await PDFDocument.create();pdf.setTitle(`Certificate of completion · ${cert.courseTitle}`);pdf.setLanguage('en');
  const page=pdf.addPage([612,792]);const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx=pdf.context;const n=(x:string)=>PDFName.of(x);
  // Each visible text line is a marked content sequence with its own MCID.
  const lines:[string,string,number,number][]=[
    ['H1','Certificate of completion',26,710],['P',`Awarded to ${cert.learnerName}`,18,645],['P',`Course: ${cert.courseTitle}`,14,600],
    ['P',`Issued: ${humanDate(cert.issuedAt)}`,12,560],['P',`Basis: ${cert.basis==='tested-out'?'Tested out':'Completed'}`,12,535],
    ['P',`Certificate code: ${cert.code}`,12,510],['P',`Verify: ${origin}/verify/${encodeURIComponent(cert.code)}`,10,485],
  ];
  const root=ctx.obj({Type:'StructTreeRoot',K:[]});const rootRef=ctx.register(root);
  const document=ctx.obj({Type:'StructElem',S:'Document',P:rootRef,K:[]});const documentRef=ctx.register(document);
  const children:PDFRef[]=[];const parentEntries:PDFRef[]=[];
  lines.forEach(([tag,value,size,y],mcid)=>{
    page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence,[n(tag),ctx.obj({MCID:mcid}) as never]));
    page.drawText(value,{x:55,y,size,font:tag==='H1'?bold:font,color:undefined});
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    const elem=ctx.obj({Type:'StructElem',S:tag,P:documentRef,Pg:page.ref,K:mcid});
    const ref=ctx.register(elem);children.push(ref);parentEntries.push(ref);
  });
  document.set(n('K'),ctx.obj(children));root.set(n('K'),ctx.obj([documentRef]));
  const parentTree=ctx.obj({Nums:[0,parentEntries]});root.set(n('ParentTree'),ctx.register(parentTree));root.set(n('ParentTreeNextKey'),ctx.obj(1));
  page.node.set(n('StructParents'),ctx.obj(0));pdf.catalog.set(n('StructTreeRoot'),rootRef);pdf.catalog.set(n('MarkInfo'),ctx.obj({Marked:true}));pdf.catalog.set(n('ViewerPreferences'),ctx.obj({DisplayDocTitle:true}));
  const bytes=await pdf.save();return new Response(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="${cert.code}.pdf"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
