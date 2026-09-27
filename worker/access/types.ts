import type { AccessIssue, AccessReport, AccessSeverity } from '../../shared/domain';
import { WCAG } from './wcag';
export interface Element { index: number; page: number; kind: 'image' | 'table'; bbox: { x: number; y: number; w: number; h: number }; label: string }
export interface DocumentCheck {
  issues: AccessIssue[];
  document: AccessReport['document'];
  text: { title: string; sections: { heading: string; level: number; text: string; page?: number }[] };
  elements: Element[];
}
export function issue(code: string, severity: AccessSeverity, title: string, description: string, fixHint: string, fix: AccessIssue['fix'], count = 1, page?: number, element?: number): AccessIssue {
  return { code, severity, wcag: WCAG[code], title, description, fixHint, location: { ...(page ? { page } : {}), ...(element !== undefined ? { element } : {}) }, count, fix };
}
export const emptyBox = { x: 0, y: 0, w: 0, h: 0 };
export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const h = hex.replace('#', '');
    const channels = (h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g) ?? []).map(c => parseInt(c, 16) / 255);
    if (channels.length !== 3 || channels.some(c => !Number.isFinite(c))) return NaN;
    const linear = channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(hexA), b = luminance(hexB);
  return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
}
export function buffer(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }
