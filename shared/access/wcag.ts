// WCAG 2.2 mapping for every Tessera Access issue code (D-022). Adapted from Luma
// Access's Tier 3 table and extended with the block-level checks. Every issue an
// engine produces must have an entry here; `tools/no-stripes.test.ts`-style guard
// tests assert it.
import type { AccessSeverity, WcagLevel } from '../domain';

export interface WcagRef { sc: string; level: WcagLevel; title: string }

export const WCAG: Record<string, WcagRef> = {
  // Blocks (lessons, assignments, documents authored in Tessera)
  block_image_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text content' },
  block_heading_skip: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  block_empty_heading: { sc: '2.4.6', level: 'AA', title: 'Headings and labels' },
  block_vague_link: { sc: '2.4.4', level: 'A', title: 'Link purpose (in context)' },
  block_table_no_header: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  block_video_no_captions: { sc: '1.2.2', level: 'A', title: 'Captions (prerecorded)' },
  block_color_only: { sc: '1.4.1', level: 'A', title: 'Use of color' },
  block_check_incomplete: { sc: '3.3.2', level: 'A', title: 'Labels or instructions' },
  block_reading_level: { sc: '3.1.5', level: 'AAA', title: 'Reading level' },
  block_long_paragraph: { sc: '1.4.8', level: 'AAA', title: 'Visual presentation' },
  block_empty_lesson: { sc: '2.4.2', level: 'A', title: 'Page titled' },

  // PDF
  pdf_no_text: { sc: '1.1.1', level: 'A', title: 'Non-text content' },
  pdf_untagged: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  pdf_no_title: { sc: '2.4.2', level: 'A', title: 'Page titled' },
  pdf_no_language: { sc: '3.1.1', level: 'A', title: 'Language of page' },
  pdf_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text content' },
  pdf_no_headings: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  pdf_reading_order: { sc: '1.3.2', level: 'A', title: 'Meaningful sequence' },

  // DOCX
  docx_no_language: { sc: '3.1.1', level: 'A', title: 'Language of page' },
  docx_no_headings: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  docx_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text content' },
  docx_table_no_header: { sc: '1.3.1', level: 'A', title: 'Info and relationships' },
  docx_no_title: { sc: '2.4.2', level: 'A', title: 'Page titled' },
  docx_tiny_text: { sc: '1.4.4', level: 'AA', title: 'Resize text' },
  docx_low_contrast: { sc: '1.4.3', level: 'AA', title: 'Contrast (minimum)' },

  // PPTX
  pptx_slide_no_title: { sc: '2.4.2', level: 'A', title: 'Page titled' },
  pptx_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text content' },
  pptx_no_speaker_notes: { sc: '1.2.1', level: 'A', title: 'Audio-only and video-only (prerecorded)' },
  pptx_small_font: { sc: '1.4.4', level: 'AA', title: 'Resize text' },
  pptx_low_contrast: { sc: '1.4.3', level: 'AA', title: 'Contrast (minimum)' },

  // Media
  video_no_captions: { sc: '1.2.2', level: 'A', title: 'Captions (prerecorded)' },
  audio_no_transcript: { sc: '1.2.1', level: 'A', title: 'Audio-only and video-only (prerecorded)' },
};

export const SEVERITY_ORDER: AccessSeverity[] = ['critical', 'serious', 'moderate', 'minor'];

export function wcagFor(code: string): WcagRef {
  const ref = WCAG[code];
  if (!ref) throw new Error(`No WCAG mapping for issue code "${code}"`);
  return ref;
}
