import { describe, expect, it } from 'vitest';
import type { DesignSource, SourceSpan } from '../domain';
import { groundSpans } from './ground-spans';

const source: DesignSource = { kind: 'syllabus', fileId: 'f', version: 1, name: 'Test', chars: 100, ocr: false, sections: [
  { page: 1, heading: '', level: 0, text: 'Students read the first chapter.', lines: ['Students read the first chapter.'] },
  { page: 2, heading: '', level: 0, text: 'Well-designed studies explain the result. Independent practice follows.', lines: ['Well-designed studies explain the result.', 'Independent practice follows.'] },
] };
const quote = (text: string, page: number | null = 1, section?: string): { span: SourceSpan } => ({ span: { page, text, ...(section ? { section } : {}) } });

describe('groundSpans', () => {
  it('matches exact text and corrects the page', () => {
    const result = groundSpans(quote('Students read the first chapter.'), source);
    expect(result).toMatchObject({ value: { span: { page: 1, section: null } }, unmatched: 0 });
    expect(groundSpans(quote('Independent practice follows.', 1), source).value.span.page).toBe(2);
  });
  it('accepts whitespace, curly punctuation, and line-break hyphens', () => {
    const hyphenSource = { ...source, sections: [{ ...source.sections[0], lines: ['Well-\n designed studies explain the result.'], text: 'Well-\n designed studies explain the result.' }] };
    const result = groundSpans(quote('Welldesigned   studies explain the result.'), hyphenSource);
    expect(result.unmatched).toBe(0);
  });
  it('requires each substantial ellipsis fragment', () => {
    expect(groundSpans(quote('Well-designed studies…Independent practice follows.'), source).unmatched).toBe(0);
    expect(groundSpans(quote('Well-designed studies…An invented second passage'), source).unmatched).toBe(1);
  });
  it('anchors DOCX quotes to a heading and keeps a real model label on an unmatched quote', () => {
    const docx = { ...source, sections: [{ page: null, heading: 'Grading', level: 2, text: 'Quizzes count for fifteen percent.', lines: ['Quizzes count for fifteen percent.'] }] };
    expect(groundSpans(quote('Quizzes count for fifteen percent.', null), docx).value.span.section).toBe('Grading');
    expect(groundSpans(quote('Fabricated syllabus passage.', null, '[§ Grading]'), docx)).toMatchObject({ value: { span: { page: null, section: 'Grading' } }, unmatched: 1 });
  });
  it('anchors DOCX preamble text as start', () => {
    const docx = { ...source, sections: [{ page: null, heading: '', level: 0, text: 'An opening course statement.', lines: ['An opening course statement.'] }] };
    expect(groundSpans(quote('An opening course statement.', null), docx).value.span.section).toBe('start');
  });
  it('keeps the model page and clears an invented section for fabricated text', () => {
    expect(groundSpans(quote('Fabricated syllabus passage.', 2, 'Unknown'), source)).toMatchObject({ value: { span: { page: 2, section: null } }, unmatched: 1 });
  });
});
