import { describe, expect, it } from 'vitest';
import { contentUrl, sizeText, uploadUrl } from './utils';
describe('file helpers', () => {
  it('encodes ids and format parameters', () => {
    expect(uploadUrl('c/a')).toBe('/api/v1/courses/c%2Fa/files/upload');
    expect(contentUrl('f/a', 'reading')).toBe('/api/v1/files/f%2Fa/content?format=reading');
  });
  it('shows sizes in words', () => {
    expect(sizeText(1)).toBe('1 byte');
    expect(sizeText(1024)).toBe('1.0 KB');
    expect(sizeText(1048576)).toBe('1.0 MB');
  });
});
