import type { AccessSeverity, AccessibleFormat } from '../../../../shared/domain';

export function uploadUrl(courseId: string): string {
  return `/api/v1/courses/${encodeURIComponent(courseId)}/files/upload`;
}
export function contentUrl(fileId: string, format?: AccessibleFormat): string {
  const path = `/api/v1/files/${encodeURIComponent(fileId)}/content`;
  return format ? `${path}?format=${encodeURIComponent(format)}` : path;
}
export function sizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const unit = bytes < 1048576 ? 'KB' : 'MB';
  const value = bytes / (unit === 'KB' ? 1024 : 1048576);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
export const severities: AccessSeverity[] = ['critical', 'serious', 'moderate', 'minor'];
export function severityTone(severity: AccessSeverity): 'error' | 'warning' | 'neutral' {
  return severity === 'critical' || severity === 'serious' ? 'error' : severity === 'moderate' ? 'warning' : 'neutral';
}
export function scoreText(summary: { score: number; grade: string } | null): string {
  return summary ? `${summary.score} out of 100 · ${summary.grade}` : 'Not scanned';
}
