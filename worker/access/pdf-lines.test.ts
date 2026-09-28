import { describe, expect, it } from 'vitest';
import { joinPdfLine } from './pdf';

const item = (str: string, x: number, width: number, size = 12) => ({ str, width, transform: [size, 0, 0, size, x, 100] });
describe('PDF line gaps', () => {
  it('rejoins small caps and spaces ordinary words', () => {
    expect(joinPdfLine([item('C', 0, 8), item('ATALOG', 8.5, 42), item('D', 70, 8), item('ESCRIPTION', 78.4, 70)])).toBe('CATALOG DESCRIPTION');
    expect(joinPdfLine([item('Read', 0, 25), item('the', 30, 17), item('chapter.', 52, 42)])).toBe('Read the chapter.');
  });
});
