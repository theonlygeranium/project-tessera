import type { AccessIssue, AccessSummary, AccessSeverity, WcagLevel } from '../../shared/domain';
export const WCAG: Record<string, { sc: string; level: WcagLevel; title: string }> = {
  pdf_no_text: { sc: '1.1.1', level: 'A', title: 'Non-text Content' },
  pdf_untagged: { sc: '1.3.1', level: 'A', title: 'Info and Relationships' },
  pdf_no_title: { sc: '2.4.2', level: 'A', title: 'Page Titled' },
  pdf_no_language: { sc: '3.1.1', level: 'A', title: 'Language of Page' },
  pdf_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text Content' },
  pdf_no_headings: { sc: '1.3.1', level: 'A', title: 'Info and Relationships' },
  pdf_reading_order: { sc: '1.3.2', level: 'A', title: 'Meaningful Sequence' },
  docx_no_language: { sc: '3.1.1', level: 'A', title: 'Language of Page' },
  docx_no_headings: { sc: '1.3.1', level: 'A', title: 'Info and Relationships' },
  docx_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text Content' },
  docx_table_no_header: { sc: '1.3.1', level: 'A', title: 'Info and Relationships' },
  docx_no_title: { sc: '2.4.2', level: 'A', title: 'Page Titled' },
  docx_tiny_text: { sc: '1.4.4', level: 'AA', title: 'Resize Text' },
  docx_low_contrast: { sc: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' },
  pptx_slide_no_title: { sc: '2.4.6', level: 'AA', title: 'Headings and Labels' },
  pptx_images_no_alt: { sc: '1.1.1', level: 'A', title: 'Non-text Content' },
  pptx_no_speaker_notes: { sc: '1.3.1', level: 'A', title: 'Info and Relationships' },
  pptx_small_font: { sc: '1.4.4', level: 'AA', title: 'Resize Text' },
  pptx_low_contrast: { sc: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' },
};
export function scoreIssues(issues: AccessIssue[]): AccessSummary {
  const bySeverity: Record<AccessSeverity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const issue of issues) bySeverity[issue.severity] += issue.count;
  const score = Math.max(0, 100 - bySeverity.critical * 25 - bySeverity.serious * 10 - bySeverity.moderate * 5 - bySeverity.minor * 2);
  const grade = score === 100 ? 'Perfect' : score >= 85 ? 'Good' : score >= 70 ? 'Moderate' : score >= 50 ? 'Low' : 'Very low';
  return { score, grade, issueCount: issues.reduce((sum, issue) => sum + issue.count, 0), bySeverity, scannedAt: new Date().toISOString() };
}
