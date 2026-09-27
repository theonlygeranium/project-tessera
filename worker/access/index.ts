import type { FileKind } from '../../shared/domain';
import type { ApiSpec } from '../../shared/api';
import type { DocumentCheck, Element } from './types';
import { checkDocx, checkPptx, fixOffice, extractOfficeImage } from './office';
import { checkPdf, fixPdf } from './pdf';
export type { DocumentCheck, Element } from './types';
export { contrastRatio } from './types';
export async function checkDocument(kind: FileKind, bytes: ArrayBuffer): Promise<DocumentCheck> {
  if(kind==='pdf') return checkPdf(bytes);
  if(kind==='docx') return checkDocx(bytes);
  if(kind==='pptx') return checkPptx(bytes);
  throw new Error(`Unsupported document kind: ${kind}`);
}
export async function applyFix(kind: FileKind, bytes: ArrayBuffer, fix: ApiSpec['fixFileIssue']['input']['fix']): Promise<ArrayBuffer> {
  if(kind==='pdf') return fixPdf(bytes,fix);
  if(kind==='docx'||kind==='pptx') return fixOffice(kind,bytes,fix);
  throw new Error(`Unsupported document kind: ${kind}`);
}
export async function extractImage(kind: FileKind,bytes:ArrayBuffer,elementIndex:number):Promise<{mime:string;bytes:ArrayBuffer}|null>{
  if(kind==='pdf') return null;
  if(kind==='docx'||kind==='pptx') return extractOfficeImage(kind,bytes,elementIndex);
  return null;
}
