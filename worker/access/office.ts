import JSZip from 'jszip';
import type { DocumentCheck, Element } from './types';
import { issue, emptyBox, contrastRatio, buffer } from './types';
import { parseXml, descendants, first, content, patch, setAttr, setText, escapeXml, decodeXml, type XmlNode } from './xml';
import type { ApiSpec } from '../../shared/api';

type Fix = ApiSpec['fixFileIssue']['input']['fix'];
const read = async (zip: JSZip, name: string) => zip.file(name)?.async('string') ?? '';
const meaningful = (value: string) => !!value.trim() && !/^(picture|image)\s*\d+$|\.(png|jpe?g|gif|svg|webp)$/i.test(value.trim());
function paragraphText(xml: string, node: XmlNode): string { return content(xml, node, ['w:t']).trim(); }
function shade(node: XmlNode): string | undefined {
  for (let p: XmlNode | undefined = node; p; p = p.parent) { const fill = first(p, 'w:shd')?.attrs['w:fill']; if (fill && /^[0-9a-f]{6}$/i.test(fill)) return fill; }
  return undefined;
}
function replaceOrInsert(xml: string, root: XmlNode, tag: string, value: string): string {
  const node = first(root, tag);
  if (node) return patch(xml, [node.openEnd===node.end ? {start:node.start,end:node.end,value:`<${tag}>${escapeXml(value)}</${tag}>`} : setText(xml, node, value)]);
  const at = root.children[0]?.openEnd ?? 0;
  return patch(xml, [{ start: at, end: at, value: `<${tag}>${escapeXml(value)}</${tag}>` }]);
}
export async function checkDocx(bytes: ArrayBuffer): Promise<DocumentCheck> {
  const zip = await JSZip.loadAsync(bytes);
  const [xml, styles, core] = await Promise.all(['word/document.xml','word/styles.xml','docProps/core.xml'].map(n => read(zip,n)));
  if (!xml) throw new Error('DOCX lacks word/document.xml');
  const root = parseXml(xml), styleRoot = parseXml(styles), coreRoot = parseXml(core);
  const paras = descendants(root,'w:p'), tables = descendants(root,'w:tbl'), pictures = descendants(root,'wp:docPr');
  const issues: DocumentCheck['issues'] = [], elements: Element[] = [];
  const heading = (p: XmlNode) => /^Heading[1-6]$/i.test(first(p,'w:pStyle')?.attrs['w:val'] ?? '');
  const sections = paras.map(p => {
    let row: XmlNode | undefined = p.parent;
    while (row && row.name !== 'w:tr') row = row.parent;
    const rowParas = row ? descendants(row,'w:p') : [];
    const cells = row?.children.filter(c => c.name === 'w:tc').map(c => content(xml,c,['w:t']).trim()) ?? [];
    const line = row ? (rowParas[0] === p ? cells.join(' | ') : '') : paragraphText(xml,p);
    return { heading: heading(p) ? paragraphText(xml,p) : '', level: heading(p) ? Number((first(p,'w:pStyle')?.attrs['w:val'] ?? '').replace(/\D/g,'')) : 0, text: paragraphText(xml,p), lines: line ? [line] : [] };
  });
  const title = first(coreRoot,'dc:title') ? content(core,coreRoot,['dc:title']).trim() || decodeXml(core.slice(first(coreRoot,'dc:title')!.openEnd,first(coreRoot,'dc:title')!.closeStart)).trim() : '';
  if (!first(first(styleRoot,'w:docDefaults') ?? styleRoot,'w:lang')?.attrs['w:val'] && !first(coreRoot,'dc:language')) issues.push(issue('docx_no_language','serious','Document language missing','No default or core language is set.','Set the document language.','metadata'));
  if (paras.length > 10 && !paras.some(heading)) issues.push(issue('docx_no_headings','serious','No headings','Long document has no heading styles.','Apply Heading styles.','manual'));
  if (!title) issues.push(issue('docx_no_title','minor','Document title missing','Core title is empty.','Set the document title.','metadata'));
  let missing = 0;
  for (const [index,pic] of pictures.entries()) {
    const p = (() => { let n: XmlNode | undefined = pic; while (n && n.name !== 'w:p') n=n.parent; return n; })();
    const label = p ? paragraphText(xml,p) : `Image ${index+1}`;
    elements.push({ index, page: 1, kind: 'image', bbox: emptyBox, label });
    if (!meaningful(pic.attrs.descr ?? '') && !(pic.attrs.descr === '' && pic.attrs.title === '')) missing++;
  }
  if (missing) issues.push(issue('docx_images_no_alt','serious','Images lack alt text',`${missing} image(s) have no meaningful description.`,'Add alt text or mark decorative.','alt-text',missing,1,pictures.findIndex(p => !meaningful(p.attrs.descr ?? ''))));
  let unheaded = 0;
  for (const [index,table] of tables.entries()) {
    const rows = table.children.filter(c => c.name === 'w:tr');
    elements.push({ index, page: 1, kind: 'table', bbox: emptyBox, label: content(xml,rows[0] ?? table,['w:t']).slice(0,100) });
    if (rows.length >= 2 && !first(rows[0],'w:tblHeader')) unheaded++;
  }
  if (unheaded) issues.push(issue('docx_table_no_header','moderate','Tables lack header rows',`${unheaded} table(s) have no marked header row.`,'Mark the first row as a header.','table-header',unheaded,1,tables.findIndex(t => { const rows=t.children.filter(c=>c.name==='w:tr'); return rows.length>=2 && !first(rows[0],'w:tblHeader'); })));
  let tiny = 0, low = 0;
  for (const run of descendants(root,'w:r')) {
    const size = Number(first(run,'w:sz')?.attrs['w:val']);
    if (size > 0 && size < 18 && content(xml,run,['w:t']).trim()) tiny++;
    const color = first(run,'w:color')?.attrs['w:val'];
    const bg = shade(run) ?? first(root,'w:background')?.attrs['w:color'] ?? 'FFFFFF';
    if (color && /^[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{6}$/i.test(bg)) {
      const bold = !!first(run,'w:b');
      if (contrastRatio(color,bg) < (size >= 36 || (bold && size >= 28) ? 3 : 4.5)) low++;
    }
  }
  if (tiny) issues.push(issue('docx_tiny_text','moderate','Tiny text',`${tiny} run(s) are under 9 pt.`,'Increase font size.','manual',tiny));
  if (low) issues.push(issue('docx_low_contrast','serious','Low text contrast',`${low} run(s) have insufficient contrast.`,'Choose higher contrast colors.','manual',low));
  return { issues, document: { pages: 1, hasText: sections.some(s=>s.text.length>0), images: pictures.length, tagged: null }, text: { title, sections }, elements };
}

function slidePaths(presentation: string, rels: string, zip: JSZip): string[] {
  const p = parseXml(presentation), r = parseXml(rels);
  const byId = new Map(descendants(r,'Relationship').map(n=>[n.attrs.Id,n.attrs.Target]));
  const paths = descendants(p,'p:sldId').map(n=>byId.get(n.attrs['r:id'])).filter((v):v is string=>!!v).map(target => {
    const path = target.replace(/^\//,'').replace(/^\.\.\//,'');
    return path.startsWith('ppt/') ? path : `ppt/${path}`;
  });
  return paths.length ? paths : Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
}
function slideText(xml: string, shape: XmlNode): string { return content(xml,shape,['a:t']).trim(); }
function shapeFill(shape: XmlNode): string | undefined {
  const spPr = shape.children.find(c=>c.name==='p:spPr');
  return spPr ? first(spPr,'a:solidFill')?.children.find(c=>c.name==='a:srgbClr')?.attrs.val : undefined;
}
export async function checkPptx(bytes: ArrayBuffer): Promise<DocumentCheck> {
  const zip = await JSZip.loadAsync(bytes);
  const [presentation, rels, core] = await Promise.all(['ppt/presentation.xml','ppt/_rels/presentation.xml.rels','docProps/core.xml'].map(n=>read(zip,n)));
  const paths = slidePaths(presentation,rels,zip), pres = parseXml(presentation);
  const size = first(pres,'p:sldSz')?.attrs ?? {};
  const width = Number(size.cx)||9144000, height=Number(size.cy)||6858000;
  const issues: DocumentCheck['issues']=[], elements: Element[]=[], sections: DocumentCheck['text']['sections']=[];
  let untitled=0, missing=0, emptyNotes=0, small=0, low=0, imageIndex=0;
  for (const [i,path] of paths.entries()) {
    const xml=await read(zip,path), root=parseXml(xml), shapes=descendants(root,'p:sp');
    const titleShape=shapes.find(s=>{ const type=first(s,'p:ph')?.attrs.type; return type==='title'||type==='ctrTitle'; });
    const title=titleShape ? slideText(xml,titleShape) : '';
    if (!title) untitled++;
    const body=shapes.filter(s=>s!==titleShape).map(s=>slideText(xml,s)).filter(Boolean).join('\n');
    const n=path.match(/slide(\d+)\.xml$/)?.[1] ?? String(i+1);
    const noteXml=await read(zip,`ppt/notesSlides/notesSlide${n}.xml`);
    const noteRoot=parseXml(noteXml);
    const notes=descendants(noteRoot,'p:sp').filter(s=>first(s,'p:ph')?.attrs.type==='body').map(s=>slideText(noteXml,s)).join('\n');
    if (!notes.trim()) emptyNotes++;
    sections.push({ heading:title, level:1, text:[body,notes].filter(Boolean).join('\n'), page:i+1 });
    for (const shape of shapes) {
      const bg=shapeFill(shape);
      for (const run of descendants(shape,'a:r')) {
        const pr=first(run,'a:rPr');
        const sz=Number(pr?.attrs.sz);
        if (sz>0&&sz<1800&&content(xml,run,['a:t']).trim()) small++;
        const color=pr ? first(pr,'a:solidFill')?.children.find(c=>c.name==='a:srgbClr')?.attrs.val : undefined;
        if (color && bg && /^[0-9a-f]{6}$/i.test(color) && /^[0-9a-f]{6}$/i.test(bg) && contrastRatio(color,bg)<(sz>=2400&&pr?.attrs.b==='1'?3:sz>=3600?3:4.5)) low++;
      }
    }
    for (const pic of descendants(root,'p:pic')) {
      const nv=first(pic,'p:cNvPr'); const descr=nv?.attrs.descr ?? '';
      const off=first(pic,'a:off')?.attrs ?? {}, ext=first(pic,'a:ext')?.attrs ?? {};
      const bbox={ x:Number(off.x||0)/width,y:Number(off.y||0)/height,w:Number(ext.cx||0)/width,h:Number(ext.cy||0)/height };
      elements.push({ index:imageIndex++, page:i+1,kind:'image',bbox,label:nv?.attrs.name??`Image ${imageIndex}` });
      if (!meaningful(descr) && !(nv?.attrs.descr === '' && nv?.attrs.title === '')) missing++;
    }
  }
  if (untitled) issues.push(issue('pptx_slide_no_title','serious','Slides lack titles',`${untitled} slide(s) have no title placeholder text.`,'Add a title to each slide.','manual',untitled));
  if (missing) issues.push(issue('pptx_images_no_alt','serious','Images lack alt text',`${missing} image(s) have no meaningful description.`,'Add alt text or mark decorative.','alt-text',missing,elements[0]?.page,elements[0]?.index));
  if (paths.length && emptyNotes/paths.length>0.7) issues.push(issue('pptx_no_speaker_notes','minor','Speaker notes missing',`${emptyNotes} slide(s) have no notes.`,'Add speaker notes.','manual',emptyNotes));
  if (small) issues.push(issue('pptx_small_font','moderate','Small slide text',`${small} run(s) are under 18 pt.`,'Increase font size.','manual',small));
  if (low) issues.push(issue('pptx_low_contrast','serious','Low slide contrast',`${low} run(s) have insufficient contrast.`,'Choose higher contrast colors.','manual',low));
  const title=first(parseXml(core),'dc:title');
  return { issues,document:{pages:paths.length,hasText:sections.some(s=>!!s.heading||!!s.text),images:imageIndex,tagged:null},text:{title:title?decodeXml(core.slice(title.openEnd,title.closeStart)):'',sections},elements };
}

export async function fixOffice(kind: 'docx'|'pptx', bytes: ArrayBuffer, fix: Fix): Promise<ArrayBuffer> {
  const zip=await JSZip.loadAsync(bytes);
  const change=async(name:string,update:(xml:string)=>string)=>{ const old=await read(zip,name); zip.file(name,update(old)); };
  if (kind==='docx') {
    if (fix.kind==='alt-text') await change('word/document.xml',xml=>{ const pics=descendants(parseXml(xml),'wp:docPr'); const node=pics[fix.element]; if(!node) throw new RangeError('Image index not found'); return patch(xml,[setAttr(xml,node,'descr',fix.decorative?'':fix.alt),...(fix.decorative?[setAttr(xml,node,'title','')]:[])]); });
    else if (fix.kind==='table-header') await change('word/document.xml',xml=>{ const tables=descendants(parseXml(xml),'w:tbl'), row=tables[fix.element]?.children.find(c=>c.name==='w:tr'); if(!row) throw new RangeError('Table index not found'); const pr=row.children.find(c=>c.name==='w:trPr'); if (pr) return patch(xml,[pr.openEnd===pr.end ? {start:pr.start,end:pr.end,value:'<w:trPr><w:tblHeader/></w:trPr>'} : {start:pr.openEnd,end:pr.openEnd,value:'<w:tblHeader/>'}]); return patch(xml,[{start:row.openEnd,end:row.openEnd,value:'<w:trPr><w:tblHeader/></w:trPr>'}]); });
    else if (fix.kind==='metadata') {
      if (fix.title!==undefined) await change('docProps/core.xml',xml=>replaceOrInsert(xml,parseXml(xml),'dc:title',fix.title!));
      if (fix.language!==undefined) { await change('docProps/core.xml',xml=>replaceOrInsert(xml,parseXml(xml),'dc:language',fix.language!)); await change('word/styles.xml',xml=>{ const root=parseXml(xml), lang=first(root,'w:lang'); if(lang) return patch(xml,[setAttr(xml,lang,'w:val',fix.language!)]); const defaults=first(root,'w:rPrDefault'); if(defaults) { const props=first(defaults,'w:rPr'); const langXml=`<w:lang w:val="${escapeXml(fix.language!)}"/>`; if(props) return patch(xml,[props.openEnd===props.end ? {start:props.start,end:props.end,value:`<w:rPr>${langXml}</w:rPr>`} : {start:props.openEnd,end:props.openEnd,value:langXml}]); return patch(xml,[{start:defaults.openEnd,end:defaults.openEnd,value:`<w:rPr>${langXml}</w:rPr>`}]); } const styles=root.children[0]; return styles?patch(xml,[{start:styles.openEnd,end:styles.openEnd,value:`<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="${escapeXml(fix.language!)}"/></w:rPr></w:rPrDefault></w:docDefaults>`}]):xml; }); }
    }
  } else {
    if (fix.kind==='alt-text') {
      const paths=slidePaths(await read(zip,'ppt/presentation.xml'),await read(zip,'ppt/_rels/presentation.xml.rels'),zip);
      let remaining=fix.element;
      for (const path of paths) { const xml=await read(zip,path), pics=descendants(parseXml(xml),'p:pic'); if(remaining<pics.length){ const node=first(pics[remaining],'p:cNvPr'); if(!node) throw new Error('Picture lacks p:cNvPr'); zip.file(path,patch(xml,[setAttr(xml,node,'descr',fix.decorative?'':fix.alt),...(fix.decorative?[setAttr(xml,node,'title','')]:[])])); remaining=-1; break; } remaining-=pics.length; }
      if(remaining!==-1) throw new RangeError('Image index not found');
    } else if (fix.kind==='metadata') {
      if(fix.title!==undefined) await change('docProps/core.xml',xml=>replaceOrInsert(xml,parseXml(xml),'dc:title',fix.title!));
      if(fix.language!==undefined) await change('docProps/core.xml',xml=>replaceOrInsert(xml,parseXml(xml),'dc:language',fix.language!));
    } else throw new Error('PPTX table-header fix is unsupported');
  }
  return buffer(await zip.generateAsync({type:'uint8array'}));
}
export async function extractOfficeImage(kind:'docx'|'pptx', bytes:ArrayBuffer, elementIndex:number):Promise<{mime:string;bytes:ArrayBuffer}|null> {
  const zip=await JSZip.loadAsync(bytes);
  if(kind==='docx') {
    const xml=await read(zip,'word/document.xml'), node=descendants(parseXml(xml),'wp:docPr')[elementIndex];
    if(!node) return null;
    let parent=node.parent; while(parent&&parent.name!=='wp:inline'&&parent.name!=='wp:anchor') parent=parent.parent;
    const id=parent?first(parent,'a:blip')?.attrs['r:embed']:undefined;
    const rels=parseXml(await read(zip,'word/_rels/document.xml.rels'));
    const target=descendants(rels,'Relationship').find(n=>n.attrs.Id===id)?.attrs.Target;
    if(!target) return null;
    return media(zip,target.startsWith('/')?target.slice(1):`word/${target.replace(/^\.\.\//,'')}`);
  }
  const paths=slidePaths(await read(zip,'ppt/presentation.xml'),await read(zip,'ppt/_rels/presentation.xml.rels'),zip);
  let left=elementIndex;
  for(const path of paths){ const xml=await read(zip,path),pics=descendants(parseXml(xml),'p:pic'); if(left<pics.length){ const id=first(pics[left],'a:blip')?.attrs['r:embed']; const relPath=path.replace(/([^/]+)$/,'_rels/$1.rels'); const rels=parseXml(await read(zip,relPath)); const target=descendants(rels,'Relationship').find(n=>n.attrs.Id===id)?.attrs.Target; if(!target)return null; return media(zip,target.startsWith('/')?target.slice(1):`ppt/slides/${target}`); } left-=pics.length; }
  return null;
}
async function media(zip:JSZip,path:string):Promise<{mime:string;bytes:ArrayBuffer}|null>{
  const normalized=path.split('/').reduce<string[]>((parts,p)=>{if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);return parts},[]).join('/');
  const file=zip.file(normalized); if(!file)return null;
  const ext=normalized.split('.').pop()?.toLowerCase(); const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp'} as Record<string,string>)[ext??'']??'application/octet-stream';
  return {mime,bytes:buffer(await file.async('uint8array'))};
}
