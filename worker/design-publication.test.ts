import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Night 4 publication wording', () => {
  it('keeps internal agent orchestration and protected assessment terms out of public release pages', () => {
    const paths = ['mintlify/releases/night-1.mdx', 'mintlify/principles.mdx', 'mintlify/build/decisions.mdx'];
    const text = paths.map(path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).join('\n');
    expect(text).not.toMatch(/AI coding agents|orchestrated and verified by Claude|answer keys?\b/i);
  });
});
