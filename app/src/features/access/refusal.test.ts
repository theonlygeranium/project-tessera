import { describe, expect, it } from 'vitest';
import { refusal } from './refusal';

describe('upload refusals', () => {
  it('accepts listed formats', () => {
    expect(refusal('Syllabus.PDF', '.pdf,.docx')).toBeNull();
    expect(refusal('syllabus.docx', '.pdf,.docx')).toBeNull();
  });
  it('explains how to convert older Office files', () => {
    expect(refusal('MPH530_Syllabus.doc', '.pdf,.docx')).toBe("MPH530_Syllabus.doc is a Word 97–2003 (.doc) file, which Tessera can't read. Open it, choose File › Save As, save it as Word Document (.docx) or PDF, and upload that file.");
    expect(refusal('deck.ppt', '.pdf,.pptx')).toContain('PowerPoint (.pptx) or PDF');
  });
  it('names the accepted formats for anything else', () => {
    expect(refusal('notes.txt', '.pdf,.docx')).toBe("Tessera can't read .txt files here. Upload PDF or DOCX.");
  });
});
