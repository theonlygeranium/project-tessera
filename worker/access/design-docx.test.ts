import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { checkDocx, designDocxSections } from './office';

async function document(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="x" xmlns:mc="x"><w:body>${body}</w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('DOCX design source', () => {
  it('groups the STAT syllabus by its seven headings and preserves table rows', async () => {
    const bytes = await readFile('tests/fixtures/syllabus/STAT110_Syllabus_Fall2026.docx');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const sections = await designDocxSections(buffer);
    expect(sections).toHaveLength(7); // The document starts with Heading1, so there is no preamble.
    expect(sections.map(section => section.heading)).toContain('Grading');
    const grading = sections.find(section => section.heading === 'Grading')!;
    expect(grading.lines.filter(line => line.includes(' | ')).length).toBeGreaterThan(3);
    expect(grading.lines.some(line => line.includes('Weekly quizzes | 15%'))).toBe(true);
    const schedule = sections.find(section => section.heading === 'Course schedule')!;
    expect(schedule.lines.some(line => /^8\s*\|/.test(line))).toBe(true);
    expect((await checkDocx(buffer)).text.sections.length).toBeGreaterThan(sections.length);
  });
  it('handles cell paragraphs, line breaks, tabs, content controls and a text box only once', async () => {
    const xml = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Overview</w:t></w:r></w:p>' +
      '<w:sdt><w:sdtContent><w:p><w:r><w:t>First</w:t><w:br/><w:t>Second</w:t><w:tab/><w:t>part</w:t></w:r></w:p></w:sdtContent></w:sdt>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A1</w:t></w:r></w:p><w:p><w:r><w:t>Cell A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>Text box content</w:t></w:r></w:p></w:txbxContent><mc:Fallback><w:txbxContent><w:p><w:r><w:t>Text box content</w:t></w:r></w:p></w:txbxContent></mc:Fallback></w:drawing></w:r></w:p>';
    const bytes = await document(xml);
    expect(await designDocxSections(bytes)).toEqual([{ heading: 'Overview', level: 1, text: 'First\nSecond part\nCell A1 / Cell A2 | Cell B\nText box content', lines: ['First', 'Second part', 'Cell A1 / Cell A2 | Cell B', 'Text box content'] }]);
  });
  it('recognizes bold, capitals and numbered titles only without heading styles', async () => {
    const para = (text: string, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${text}</w:t></w:r></w:p>`;
    const sections = await designDocxSections(await document(para('Preamble text.') + para('Course basics', true) + para('Welcome.') + para('POLICIES') + para('Read this.') + para('4. Grading') + para('Quizzes count.')));
    expect(sections.map(section => section.heading)).toEqual(['', 'Course basics', 'POLICIES', '4. Grading']);
    expect(sections[0].lines).toEqual(['Preamble text.']);
  });
});
