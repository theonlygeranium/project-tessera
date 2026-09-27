import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import type { DocumentCheck, Element } from './types';
import { issue, buffer } from './types';
import type { ApiSpec } from '../../shared/api';

type Struct = { role?: string; alt?: string; children?: Struct[]; type?: string; id?: string };
const mul=(a:number[],b:number[])=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function walk(node:Struct, result:Struct[]=[]):Struct[] { result.push(node); for(const child of node.children??[]) walk(child,result); return result; }
export async function checkPdf(bytes:ArrayBuffer):Promise<DocumentCheck>{
  const loading=getDocument({data:new Uint8Array(bytes.slice(0)),useWorkerFetch:false,disableFontFace:true,disableAutoFetch:true});
  const pdf=await loading.promise;
  try {
    const metadata=await pdf.getMetadata();
    const info=metadata.info as Record<string, unknown>;
    const mark=await pdf.getMarkInfo();
    const title=typeof info.Title==='string'?info.Title.trim():'';
    const language=String(info.Language??info.Lang??'').trim();
    const issues:DocumentCheck['issues']=[],elements:Element[]=[],sections:DocumentCheck['text']['sections']=[];
    let hasText=false, images=0, missingAlt=0, taggedPages=0, headings=0, heuristicHeadings=0, orderMismatch=0;
    for(let pageNum=1;pageNum<=pdf.numPages;pageNum++){
      const page=await pdf.getPage(pageNum);
      const [tc,tree,list]=await Promise.all([page.getTextContent({includeMarkedContent:true}),page.getStructTree(),page.getOperatorList()]);
      const textItems=tc.items.filter((v):v is typeof v & {str:string;transform:number[]} => 'str' in v && !!v.str.trim());
      if(textItems.length) hasText=true;
      const nodes=tree?walk(tree as Struct):[];
      if(tree) taggedPages++;
      headings+=nodes.filter(n=>/^H[1-6]$/.test(n.role??'')).length;
      const figures=nodes.filter(n=>n.role==='Figure');
      const missingFigures=figures.filter(n=>!n.alt?.trim()).length;
      const pageLines=textItems.map(t=>({text:t.str,y:t.transform[5],x:t.transform[4]}));
      const byLine=new Map<number,string[]>();
      for(const item of pageLines){ const key=Math.round(item.y/3)*3; byLine.set(key,[...(byLine.get(key)??[]),item.text]); }
      if([...byLine.values()].some(parts=>{ const line=parts.join(' ').trim(); return line.length>=3 && line.length<=60 && !/[.!?]$/.test(line); })) heuristicHeadings++;
      if(tree && nodes.some(n=>n.type==='content')) {
        const ids=nodes.filter(n=>n.type==='content').map(n=>n.id).filter((id):id is string=>!!id);
        const positions=new Map<string,{x:number;y:number}>();
        const active:string[]=[];
        for(const item of tc.items){
          if('str' in item){ const id=active[active.length-1]; if(id && !positions.has(id) && item.str.trim()) positions.set(id,{x:item.transform[4],y:item.transform[5]}); }
          else if(item.type==='beginMarkedContentProps') active.push(item.id);
          else if(item.type==='endMarkedContent') active.pop();
        }
        const first20=ids.filter(id=>positions.has(id)).slice(0,20);
        const visual=[...first20].sort((a,b)=>{ const pa=positions.get(a)!,pb=positions.get(b)!; return Math.abs(pb.y-pa.y)>2 ? pb.y-pa.y : pa.x-pb.x; });
        if(first20.length>1 && first20.join('|')!==visual.join('|')) orderMismatch++;
      }
      sections.push({heading:'',level:0,text:pageLines.map(l=>l.text).join(' '),page:pageNum});
      const viewport=page.getViewport({scale:1});
      let ctm=[1,0,0,1,0,0]; const stack:number[][]=[];
      for(let i=0;i<list.fnArray.length;i++){
        const op=list.fnArray[i],args=list.argsArray[i] as unknown[];
        if(op===OPS.save) stack.push([...ctm]);
        else if(op===OPS.restore) ctm=stack.pop()??[1,0,0,1,0,0];
        else if(op===OPS.transform && args.length>=6) ctm=mul(ctm,args as number[]);
        else if(op===OPS.paintImageXObject || op===OPS.paintInlineImageXObject){
          const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>{ const px=ctm[0]*x+ctm[2]*y+ctm[4],py=ctm[1]*x+ctm[3]*y+ctm[5]; return [px,py]; });
          const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
          const x=clamp((Math.min(...xs)-viewport.viewBox[0])/viewport.width),y=clamp((viewport.viewBox[3]-Math.max(...ys))/viewport.height);
          const w=clamp((Math.max(...xs)-Math.min(...xs))/viewport.width),h=clamp((Math.max(...ys)-Math.min(...ys))/viewport.height);
          elements.push({index:images,page:pageNum,kind:'image',bbox:{x,y,w,h},label:`Image ${images+1}`});
          images++;
        }
      }
      if(figures.length>elements.filter(e=>e.page===pageNum).length){
        for(let extra=elements.filter(e=>e.page===pageNum).length;extra<figures.length;extra++) elements.push({index:images++,page:pageNum,kind:'image',bbox:{x:0,y:0,w:0,h:0},label:`Figure ${extra+1}`});
      }
      if(!tree || mark?.Marked===false) missingAlt+=elements.filter(e=>e.page===pageNum).length;
      else missingAlt+=Math.max(missingFigures,Math.max(0,elements.filter(e=>e.page===pageNum).length-figures.length));
    }
    const tagged=taggedPages>0&&mark?.Marked!==false;
    if(!hasText) issues.push(issue('pdf_no_text','critical','No extractable text','This PDF appears scanned or image-only.','Use OCR to create a text version.','manual'));
    if(!tagged) issues.push(issue('pdf_untagged','serious','PDF is untagged','No usable structure tree was found.','Add document tags in an authoring tool.','manual'));
    if(!title) issues.push(issue('pdf_no_title','moderate','PDF title missing','No document title is set.','Set the title metadata.','metadata'));
    if(!language) issues.push(issue('pdf_no_language','serious','PDF language missing','No document language is set.','Set the language metadata.','metadata'));
    if(missingAlt) issues.push(issue('pdf_images_no_alt','serious','Images lack alt text',`${missingAlt} image(s) have no matching Figure alt text.`,'Add alt text to the accessible reading version.','alt-text',missingAlt, elements.find(e=>e.kind==='image')?.page, elements.find(e=>e.kind==='image')?.index));
    if(tagged ? headings===0 : heuristicHeadings===0) issues.push(issue('pdf_no_headings','moderate','No headings detected','No heading structure was found.','Add semantic headings.','manual'));
    if(orderMismatch) issues.push(issue('pdf_reading_order','moderate','Reading order differs',`${orderMismatch} page(s) have differing structure and text order.`,'Correct the structure reading order.','manual',orderMismatch));
    return {issues,document:{pages:pdf.numPages,hasText,images,tagged},text:{title,sections},elements};
  } finally { await loading.destroy(); }
}
export async function fixPdf(bytes:ArrayBuffer,fix:ApiSpec['fixFileIssue']['input']['fix']):Promise<ArrayBuffer>{
  if(fix.kind!=='metadata') throw new Error('PDF supports metadata fixes only');
  const pdf=await PDFDocument.load(bytes.slice(0));
  if(fix.title!==undefined) pdf.setTitle(fix.title);
  if(fix.language!==undefined) pdf.setLanguage(fix.language);
  return buffer(await pdf.save());
}
