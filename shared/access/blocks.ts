// Tessera Access: checks on Tessera's own block model (D-022). Runs in the editor
// (instantly, in the browser) and on the server (publish gate, reports). Lessons and
// assignment instructions are lists of blocks, so no parsing is needed: every issue
// points at a block id and names the fix the product can offer.
import type { AccessIssue, AccessReport, AccessSeverity, Block, Id, Timestamp } from '../domain';
import { summarize } from './score';
import { wcagFor } from './wcag';

const VAGUE_LINK_TEXT = new Set(['click here', 'here', 'more', 'read more', 'learn more', 'link', 'this link', 'details', 'view', 'open', 'this', 'this page']);
const COLOR_ONLY = /\b(?:in|marked|shown|highlighted|colou?red|items? in|the) (red|green|blue|yellow|orange|purple|pink)\b(?! (?:text|button|box|chip|badge|line|border|arrow|dot|circle) (?:labell?ed|with|marked|next to))/i;

function issue(code: string, severity: AccessSeverity, title: string, description: string, fixHint: string, fix: AccessIssue['fix'], blockId: Id | null, count = 1, label?: string): AccessIssue {
  return { code, severity, wcag: wcagFor(code), title, description, fixHint, location: { ...(blockId ? { blockId } : {}), ...(label ? { label } : {}) }, count, fix };
}

/** A rough Flesch–Kincaid grade level; good enough to flag dense text, not to judge it. */
export function readingGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 40) return 0;
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.toLowerCase().replace(/e\b/, '').match(/[aeiouy]+/g) ?? []).length), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
}

function textOf(b: Block): string {
  switch (b.type) {
    case 'text': return b.text;
    case 'callout': return `${b.title}. ${b.text}`;
    case 'document': return b.sections.map((s) => `${s.heading}. ${s.text}`).join('\n\n');
    case 'scenario': return [b.setting, ...b.nodes.map((n) => n.text)].join('\n\n');
    default: return '';
  }
}

/** Every accessibility issue in a list of blocks, in block order. */
export function checkBlocks(blocks: Block[]): AccessIssue[] {
  const issues: AccessIssue[] = [];
  if (blocks.length === 0) {
    issues.push(issue('block_empty_lesson', 'minor', 'No content yet', 'The lesson has no blocks.', 'Add at least one block.', 'manual', null));
    return issues;
  }
  let lastLevel = 1; // the page title is the h1
  for (const b of blocks) {
    const id = b.id;
    if (b.origin === 'ai' && b.aiState !== 'kept') {
      issues.push(issue('block_ai_draft', 'serious', 'AI draft not yet reviewed', 'An AI-written block hasn\'t been kept by a person, so it can\'t be published.', 'Read it, then keep, edit, or revert it.', 'manual', id));
    }
    switch (b.type) {
      case 'heading': {
        if (!b.text.trim()) issues.push(issue('block_empty_heading', 'moderate', 'Empty heading', 'An empty heading is a confusing stop for screen-reader users.', 'Give the heading text, or remove it.', 'manual', id));
        if (b.level > lastLevel + 1) issues.push(issue('block_heading_skip', 'moderate', 'Heading level skipped', `A level ${b.level} heading follows a level ${lastLevel} heading.`, `Use level ${lastLevel + 1} here, so the outline reads in order.`, 'manual', id));
        lastLevel = b.level;
        break;
      }
      case 'image': {
        if (!b.decorative && !b.alt.trim()) issues.push(issue('block_image_no_alt', 'serious', 'Image without alt text', 'Screen-reader users get nothing from this image.', 'Describe what the image shows, or mark it decorative if it carries no information.', 'alt-text', id));
        else if (!b.decorative && /^(image|picture|photo|screenshot|img)(\s*\d+)?(\.\w{3,4})?$/i.test(b.alt.trim())) issues.push(issue('block_image_no_alt', 'moderate', 'Alt text is a placeholder', `"${b.alt}" doesn't describe the image.`, 'Describe what the image shows and why it\'s here.', 'alt-text', id));
        break;
      }
      case 'link': {
        const t = b.text.trim().toLowerCase();
        if (!t || VAGUE_LINK_TEXT.has(t) || t === b.href.trim().toLowerCase()) issues.push(issue('block_vague_link', 'moderate', 'Link text doesn\'t say where it goes', `"${b.text || b.href}" is read out of context by screen readers.`, 'Use the page or document name as the link text.', 'link-text', id));
        break;
      }
      case 'table': {
        const first = b.rows[0] ?? [];
        if (!b.headerRow || first.every((c) => !c.trim())) issues.push(issue('block_table_no_header', 'moderate', 'Table without a header row', 'Assistive technology can\'t announce which column a cell belongs to.', 'Mark the first row as the header and give each column a name.', 'table-header', id));
        break;
      }
      case 'video': {
        if (!b.captionsFileId && !b.transcript.trim()) issues.push(issue('block_video_no_captions', 'critical', 'Video without captions or a transcript', 'Deaf and hard-of-hearing students can\'t follow this video.', 'Add a captions file, or paste a transcript.', 'captions', id));
        break;
      }
      case 'check': {
        const filled = b.options.filter((o) => o.text.trim());
        if (!b.question.trim() || filled.length < 2 || !b.options.some((o) => o.id === b.correctOptionId && o.text.trim())) issues.push(issue('block_check_incomplete', 'serious', 'Knowledge check is incomplete', 'It needs a question, at least two answers, and a correct answer.', 'Fill in the question, the answers, and choose the correct one.', 'manual', id));
        break;
      }
      case 'scenario': {
        for (const n of b.nodes) if (n.choices.length === 0 && !n.outcome.trim()) issues.push(issue('block_check_incomplete', 'moderate', 'Scenario ending without an outcome', `The ending "${n.text.slice(0, 40)}…" doesn't tell the student what happened.`, 'Write the outcome for this ending.', 'manual', id, 1, n.id));
        break;
      }
      default: break;
    }
    // Text-level checks for anything with prose.
    const prose = textOf(b);
    if (prose) {
      if (COLOR_ONLY.test(prose)) issues.push(issue('block_color_only', 'minor', 'Information given by color alone', 'Color-blind and screen-reader users can\'t tell which items are meant.', 'Say it in words too (for example "required, marked with an asterisk").', 'rewrite', id));
      const longParagraphs = prose.split(/\n\s*\n/).filter((p) => p.split(/\s+/).length > 200).length;
      if (longParagraphs) issues.push(issue('block_long_paragraph', 'minor', 'Very long paragraph', 'Paragraphs over 200 words are hard to read, especially with a screen magnifier.', 'Split it, or add a heading.', 'rewrite', id, longParagraphs));
      const grade = readingGrade(prose);
      if (grade > 14) issues.push(issue('block_reading_level', 'minor', 'Dense reading level', `This reads at about grade ${Math.round(grade)}; introductory material aims for grade 8–10.`, 'Shorter sentences and plainer words help every reader. Ask for a plain-language rewrite.', 'rewrite', id));
    }
  }
  return issues;
}

export function lessonAccessReport(lessonId: Id, blocks: Block[], scannedAt: Timestamp): AccessReport {
  const issues = checkBlocks(blocks);
  return { ...summarize(issues, scannedAt), target: { kind: 'lesson', lessonId }, issues, document: null };
}
