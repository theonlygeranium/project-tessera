/** Older Office formats can't be read; say how to convert them instead of failing later. */
export function refusal(name: string, accept: string): string | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  const legacy: Record<string, string> = { doc: 'Word 97–2003 (.doc)', ppt: 'PowerPoint 97–2003 (.ppt)', rtf: 'Rich Text (.rtf)' };
  const allowed = accept.split(',').map(item => item.trim().replace(/^\./, '').toLowerCase());
  if (allowed.includes(ext)) return null;
  const wanted = allowed.map(item => item.toUpperCase()).join(', ').replace(/, ([^,]*)$/, ' or $1');
  if (legacy[ext]) return `${name} is a ${legacy[ext]} file, which Tessera can't read. Open it, choose File › Save As, save it as ${ext === 'ppt' ? 'PowerPoint (.pptx) or PDF' : 'Word Document (.docx) or PDF'}, and upload that file.`;
  return `Tessera can't read ${ext ? `.${ext}` : 'this kind of'} files here. Upload ${wanted}.`;
}
