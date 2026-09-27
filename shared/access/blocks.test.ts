import { describe, expect, it } from 'vitest';
import type { Block, BlockContent } from '../domain';
import { checkBlocks, lessonAccessReport, readingGrade } from './blocks';
import { combine, gradeOf, policyBlocks, scoreOf, summarize } from './score';
import { WCAG } from './wcag';

let n = 0;
const block = (content: BlockContent, ai = false): Block => ({
  id: `b${++n}`, lessonId: 'l', position: n, origin: ai ? 'ai' : 'human', aiState: ai ? 'draft' : null, provenance: null, previous: null, updatedAt: '2026-09-27T00:00:00.000Z', ...content,
});
const codes = (blocks: Block[]) => checkBlocks(blocks).map((i) => i.code);

describe('checkBlocks', () => {
  it('passes a well-formed lesson', () => {
    const blocks = [
      block({ type: 'heading', level: 2, text: 'Reading charts' }),
      block({ type: 'text', text: 'Charts can mislead. Check the axis first.' }),
      block({ type: 'image', src: '/x.png', alt: 'A bar chart whose y-axis starts at 50, exaggerating differences', decorative: false, caption: '' }),
      block({ type: 'table', caption: 'Study hours', headerRow: true, rows: [['Student', 'Hours'], ['Priya', '3']] }),
      block({ type: 'link', href: 'https://example.edu/guide', text: 'Chart reading guide', description: '' }),
      block({ type: 'video', src: 'https://www.youtube.com/watch?v=x', provider: 'youtube', title: 'Axes', captionsFileId: null, transcript: 'Full transcript here.', minutes: 4 }),
    ];
    expect(codes(blocks)).toEqual([]);
    expect(lessonAccessReport('l', blocks, '2026-09-27T00:00:00.000Z').score).toBe(100);
  });

  it('finds each block issue with its WCAG mapping and fix', () => {
    const blocks = [
      block({ type: 'heading', level: 3, text: '' }),
      block({ type: 'image', src: '/x.png', alt: '', decorative: false, caption: '' }),
      block({ type: 'image', src: '/y.png', alt: 'image 2', decorative: false, caption: '' }),
      block({ type: 'link', href: 'https://example.edu', text: 'click here', description: '' }),
      block({ type: 'table', caption: '', headerRow: false, rows: [['a', 'b']] }),
      block({ type: 'video', src: 'https://vimeo.com/1', provider: 'vimeo', title: 'V', captionsFileId: null, transcript: '', minutes: 2 }),
      block({ type: 'check', question: 'Q?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'zzz', feedbackCorrect: '', feedbackIncorrect: '' }),
      block({ type: 'text', text: 'Required items are shown in red on the syllabus.' }),
      block({ type: 'text', text: 'Fine.' }, true),
    ];
    const issues = checkBlocks(blocks);
    expect(issues.map((i) => i.code)).toEqual([
      'block_empty_heading', 'block_heading_skip', 'block_image_no_alt', 'block_image_no_alt', 'block_vague_link',
      'block_table_no_header', 'block_video_no_captions', 'block_check_incomplete', 'block_color_only',
    ]);
    for (const i of issues) {
      expect(WCAG[i.code]).toBeDefined();
      expect(i.wcag.sc).toBe(WCAG[i.code].sc);
      expect(i.location.blockId).toBeTruthy();
    }
    expect(issues.find((i) => i.code === 'block_video_no_captions')?.severity).toBe('critical');
    expect(issues.find((i) => i.code === 'block_image_no_alt')?.fix).toBe('alt-text');
    expect(issues.find((i) => i.code === 'block_vague_link')?.fix).toBe('link-text');
  });

  it('accepts decorative images and descriptive links', () => {
    expect(codes([block({ type: 'image', src: '/d.png', alt: '', decorative: true, caption: '' }), block({ type: 'link', href: 'https://a.b', text: 'Syllabus (PDF)', description: '' })])).toEqual([]);
  });

  it('flags dense prose and long paragraphs, not short plain text', () => {
    const dense = ('The epistemological ramifications of heteroscedasticity necessitate comprehensive reconsideration of methodological presuppositions underlying contemporary inferential frameworks. ').repeat(4);
    expect(readingGrade(dense)).toBeGreaterThan(14);
    expect(codes([block({ type: 'text', text: dense })])).toContain('block_reading_level');
    const long = Array.from({ length: 210 }, () => 'word').join(' ') + '.';
    expect(codes([block({ type: 'text', text: long })])).toContain('block_long_paragraph');
    expect(codes([block({ type: 'text', text: 'Short and plain. Easy to read.' })])).toEqual([]);
  });

  it('reports an empty lesson', () => {
    expect(codes([])).toEqual(['block_empty_lesson']);
  });
});

describe('score', () => {
  it('applies the published formula and caps repeats at three', () => {
    expect(scoreOf([])).toBe(100);
    expect(scoreOf([{ severity: 'critical', count: 1 }])).toBe(70);
    expect(scoreOf([{ severity: 'serious', count: 10 }])).toBe(55);
    expect(gradeOf(92)).toBe('Perfect');
    expect(gradeOf(10)).toBe('Very low');
  });
  it('summarizes, combines, and applies the policy', () => {
    const issues = checkBlocks([block({ type: 'image', src: '/x', alt: '', decorative: false, caption: '' })]);
    const s = summarize(issues, 't');
    expect(s.score).toBe(85);
    expect(s.bySeverity.serious).toBe(1);
    expect(combine([s, { ...s, score: 65 }], 't')?.score).toBe(75);
    expect(combine([], 't')).toBeNull();
    expect(policyBlocks(s, issues, { minimumScore: 90, blockingSeverities: ['critical'] })).toHaveLength(1);
    expect(policyBlocks(s, issues, { minimumScore: 0, blockingSeverities: ['serious'] })).toHaveLength(1);
    expect(policyBlocks(s, issues, { minimumScore: 0, blockingSeverities: ['critical'] })).toHaveLength(0);
  });
});
