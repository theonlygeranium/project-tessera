import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { checkDocument, applyFix, extractImage, contrastRatio } from './index';
const ab=(bytes:Uint8Array)=>Uint8Array.from(bytes).buffer;
const core='<cp:coreProperties xmlns:cp="x" xmlns:dc="x"><dc:title></dc:title></cp:coreProperties>';
async function docx(){
  const z=new JSZip();
  z.file('word/document.xml',`<w:document xmlns:w="x" xmlns:wp="x" xmlns:a="x" xmlns:r="x"><w:body><w:p><w:r><w:t>Hello world</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="CCCCCC"/><w:shd w:fill="FFFFFF"/></w:rPr><w:t>Small pale text</w:t></w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"/><a:blip r:embed="rId5"/></wp:inline></w:drawing></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
  z.file('word/styles.xml','<w:styles xmlns:w="x"><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults></w:styles>');
  z.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="rId5" Target="media/image1.png"/></Relationships>');
  z.file('word/media/image1.png',new Uint8Array([137,80,78,71]));
  z.file('docProps/core.xml',core);
  return ab(await z.generateAsync({type:'uint8array'}));
}
async function pptx(){
  const z=new JSZip();
  z.file('ppt/presentation.xml','<p:presentation xmlns:p="x" xmlns:r="x"><p:sldIdLst><p:sldId r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>');
  z.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/></Relationships>');
  z.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="x" xmlns:a="x" xmlns:r="x"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="1200"><a:solidFill><a:srgbClr val="DDDDDD"/></a:solidFill></a:rPr><a:t>Body text</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture 3"/><p:cNvPicPr><a:blip r:embed="rId9"/></p:cNvPicPr></p:nvPicPr><p:spPr><a:xfrm><a:off x="914400" y="685800"/><a:ext cx="4572000" cy="3429000"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>`);
  z.file('ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="rId9" Target="../media/image1.png"/></Relationships>');
  z.file('ppt/media/image1.png',new Uint8Array([137,80,78,71]));
  z.file('docProps/core.xml',core);
  return ab(await z.generateAsync({type:'uint8array'}));
}
async function pdf(withMetadata:boolean,pages=1){
  const d=await PDFDocument.create(); const font=await d.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<pages;i++){ const p=d.addPage([300,400]);p.drawText(`Page ${i+1} heading and paragraph`,{x:30,y:350,font,size:12}); }
  if(withMetadata){d.setTitle('Example');d.setLanguage('en-US');}
  return ab(await d.save());
}
const codes=(r:Awaited<ReturnType<typeof checkDocument>>)=>r.issues.map(i=>i.code);

function taggedOutOfOrderPdf():ArrayBuffer {
  const stream='/P <</MCID 0>> BDC\nBT /F1 12 Tf 30 350 Td (First) Tj ET\nEMC\n/P <</MCID 1>> BDC\nBT /F1 12 Tf 30 300 Td (Second) Tj ET\nEMC\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 8 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /StructParents 0 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /StructElem /S /P /P 8 0 R /Pg 3 0 R /K 1 >>',
    '<< /Type /StructElem /S /P /P 8 0 R /Pg 3 0 R /K 0 >>',
    '<< /Type /StructTreeRoot /K [6 0 R 7 0 R] /ParentTree 9 0 R >>',
    '<< /Nums [0 [7 0 R 6 0 R]] >>',
    '<< /Title (Ordered test) >>',
  ];
  let pdf='%PDF-1.7\n'; const offsets=[0];
  for(const [i,obj] of objects.entries()){ offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`; }
  const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const off of offsets.slice(1)) pdf+=`${String(off).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 10 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return ab(new TextEncoder().encode(pdf));
}

describe('document engine',()=>{
  it('checks and fixes DOCX without changing source',async()=>{
    const original=await docx(),before=Array.from(new Uint8Array(original)); const r=await checkDocument('docx',original);
    expect(codes(r)).toEqual(expect.arrayContaining(['docx_no_language','docx_no_title','docx_images_no_alt','docx_table_no_header','docx_tiny_text','docx_low_contrast']));
    expect(r.issues.find(i=>i.code==='docx_images_no_alt')?.count).toBe(1);
    expect(r.text.sections.some(s=>s.text.includes('Hello world'))).toBe(true);
    expect((await extractImage('docx',original,0))?.mime).toBe('image/png');
    let changed=await applyFix('docx',original,{kind:'alt-text',element:0,alt:'A useful chart',decorative:false});
    changed=await applyFix('docx',changed,{kind:'table-header',element:0});
    changed=await applyFix('docx',changed,{kind:'metadata',title:'Course notes',language:'en-US'});
    const after=await checkDocument('docx',changed);
    expect(codes(after)).not.toEqual(expect.arrayContaining(['docx_images_no_alt','docx_table_no_header','docx_no_language','docx_no_title']));
    expect(Array.from(new Uint8Array(original))).toEqual(before);
    const decorative=await applyFix('docx',original,{kind:'alt-text',element:0,alt:'',decorative:true});
    expect(codes(await checkDocument('docx',decorative))).not.toContain('docx_images_no_alt');
  });

  it('detects a long DOCX without heading styles',async()=>{
    const z=await JSZip.loadAsync(await docx());
    const xml=await z.file('word/document.xml')!.async('string');
    z.file('word/document.xml',xml.replace('</w:body>',Array.from({length:11},(_,i)=>`<w:p><w:r><w:t>Paragraph ${i+1}</w:t></w:r></w:p>`).join('')+'</w:body>'));
    const checked=await checkDocument('docx',ab(await z.generateAsync({type:'uint8array'})));
    expect(codes(checked)).toContain('docx_no_headings');
    expect(checked.text.sections.filter(s=>s.text.startsWith('Paragraph')).length).toBe(11);
  });
  it('checks PPTX slide positions, notes, contrast, and alt fix',async()=>{
    const original=await pptx(),r=await checkDocument('pptx',original);
    expect(codes(r)).toEqual(expect.arrayContaining(['pptx_slide_no_title','pptx_images_no_alt','pptx_no_speaker_notes','pptx_small_font','pptx_low_contrast']));
    expect(r.elements[0].bbox).toEqual({x:.1,y:.1,w:.5,h:.5});
    expect(r.text.sections[0].text).toContain('Body text');
    expect((await extractImage('pptx',original,0))?.mime).toBe('image/png');
    const changed=await applyFix('pptx',original,{kind:'alt-text',element:0,alt:'A diagram',decorative:false});
    expect(codes(await checkDocument('pptx',changed))).not.toContain('pptx_images_no_alt');
  });
  it('checks PDF text and fixes metadata',async()=>{
    const original=await pdf(false),r=await checkDocument('pdf',original);
    expect(codes(r)).toEqual(expect.arrayContaining(['pdf_untagged','pdf_no_title','pdf_no_language']));
    expect(r.document?.hasText).toBe(true);
    expect(r.text.sections[0].text).toContain('Page 1 heading');
    const changed=await applyFix('pdf',original,{kind:'metadata',title:'Accessible PDF',language:'en-US'});
    expect(codes(await checkDocument('pdf',changed))).not.toEqual(expect.arrayContaining(['pdf_no_title','pdf_no_language']));
    expect(await extractImage('pdf',original,0)).toBeNull();
  });
  it('detects tagged PDF reading-order mismatch',async()=>{
    const r=await checkDocument('pdf',taggedOutOfOrderPdf());
    expect(r.document?.tagged).toBe(true);
    expect(codes(r)).toContain('pdf_reading_order');
  });
  it('processes 20-page PDF within 10 seconds',async()=>{
    const start=Date.now(),r=await checkDocument('pdf',await pdf(true,20));
    expect(r.document?.pages).toBe(20);
    expect(Date.now()-start).toBeLessThan(10000);
  },15000);

  it('detects scanned-style blank and image-only PDF pages',async()=>{
    const d=await PDFDocument.create(); d.addPage([300,400]);
    const blank=await checkDocument('pdf',ab(await d.save()));
    expect(codes(blank)).toContain('pdf_no_text');
    expect(codes(blank)).toContain('pdf_no_headings');
    const image=await d.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=');
    d.getPage(0).drawImage(image,{x:40,y:60,width:100,height:80});
    const checked=await checkDocument('pdf',ab(await d.save()));
    expect(codes(checked)).toContain('pdf_images_no_alt');
    expect(checked.issues.find(i=>i.code==='pdf_images_no_alt')?.count).toBe(1);
    expect(checked.elements[0].page).toBe(1);
  });
  it('fixes PPTX core metadata and decorative alt text',async()=>{
    const original=await pptx();
    let fixed=await applyFix('pptx',original,{kind:'alt-text',element:0,alt:'',decorative:true});
    fixed=await applyFix('pptx',fixed,{kind:'metadata',title:'Teaching deck',language:'en-US'});
    expect(codes(await checkDocument('pptx',fixed))).not.toContain('pptx_images_no_alt');
    expect((await checkDocument('pptx',fixed)).text.title).toBe('Teaching deck');
    const z=await JSZip.loadAsync(fixed); expect(await z.file('docProps/core.xml')?.async('string')).toContain('<dc:language>en-US</dc:language>');
  });
  it('computes WCAG contrast',()=>{expect(contrastRatio('000000','FFFFFF')).toBeCloseTo(21);expect(contrastRatio('CCCCCC','FFFFFF')).toBeLessThan(4.5);});
});
