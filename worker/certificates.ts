import { PDFDocument, PDFName, PDFOperator, PDFOperatorNames, type PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ApiError } from '../shared/api';
import tokens from '../design/tokens.json';
// Wrangler loads these as Data modules; Vitest supplies the same ArrayBuffer shape.
// @ts-ignore Wrangler Data module has no TypeScript declaration
import regularFontData from './fonts/NotoSans-Regular.ttf';
// @ts-ignore Wrangler Data module has no TypeScript declaration
import boldFontData from './fonts/NotoSans-Bold.ttf';
import type { Certificate, CertificateVerification } from '../shared/domain';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
const humanDate=(value:string)=>new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});

export function verificationPage(result:CertificateVerification,status=200):Response {
  const heading=!result.courseTitle?'No certificate has this code':result.replaced?'Replaced by a newer certificate':'Valid certificate';
  const color=tokens.color;
  const body=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${heading} · Tessera</title><style>:root{color-scheme:light}body{margin:0;padding:2rem;background:${color.paper.$value};color:${color.ink.$value};font:1rem/1.5 system-ui,sans-serif}main{max-width:38rem;margin:3rem auto;padding:2rem;background:${color.surface.$value};border:1px solid ${color.line.$value};border-radius:.75rem}h1{font-size:2rem;line-height:1.2;color:${result.valid?color['success-text'].$value:result.replaced?color['warning-text'].$value:color['error-text'].$value}}dt{font-weight:700;margin-top:1rem}dd{margin:0}a{color:${color.accent.$value}}a:focus-visible{outline:3px solid ${color.focus.$value};outline-offset:3px}</style></head><body><main><h1>${heading}</h1>${result.courseTitle?`<dl><dt>Course</dt><dd>${escapeHtml(result.courseTitle)}</dd><dt>Issued</dt><dd>${humanDate(result.issuedAt!)}</dd></dl>`:'<p>Check the code and try again.</p>'}</main></body></html>`;
  return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}

export async function certificatePdf(cert:Certificate,origin:string,fontBytes:{regular:ArrayBuffer;bold:ArrayBuffer}={regular:regularFontData as unknown as ArrayBuffer,bold:boldFontData as unknown as ArrayBuffer}):Promise<Response>{
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(`Certificate of completion · ${cert.courseTitle}`);pdf.setLanguage('en');
  const page=pdf.addPage([612,792]);const font=await pdf.embedFont(fontBytes.regular,{subset:true});const bold=await pdf.embedFont(fontBytes.bold,{subset:true});
  const ctx=pdf.context;const n=(x:string)=>PDFName.of(x);
  // Each visible text line is a marked content sequence with its own MCID.
  const lines:[string,string,number,number][]=[
    ['H1','Certificate of completion',26,710],['P',`Awarded to ${cert.learnerName}`,18,645],['P',`Course: ${cert.courseTitle}`,14,600],
    ['P',`Issued: ${humanDate(cert.issuedAt)}`,12,560],['P',`Basis: ${cert.basis==='tested-out'?'Tested out':'Completed'}`,12,535],
    ['P',`Certificate code: ${cert.code}`,12,510],['P',`Verify: ${origin}/verify/${encodeURIComponent(cert.code)}`,10,485],
  ];
  try {
    const regularGlyphs=fontkit.create(new Uint8Array(fontBytes.regular));
    const boldGlyphs=fontkit.create(new Uint8Array(fontBytes.bold));
    for(const [tag,value] of lines)for(const character of value)if((tag==='H1'?boldGlyphs:regularGlyphs).glyphForCodePoint(character.codePointAt(0)!).id===0)throw new Error('Unsupported glyph');
  }
  catch { throw new ApiError('unsupported',"This certificate's name uses characters the PDF can't show yet. Use Print or save as PDF on the certificate page."); }
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
