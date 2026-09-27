// D-017: no colored edge stripes on any element. Scans every stylesheet, CSS module,
// artboard, and page for single-edge bars: a one-sided border 2px or wider, a 1px
// one-sided border in a state color, or an offset-only inset box-shadow
// (`inset 4px 0 …`). 1px neutral dividers between panels are layout and are allowed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SCAN = ['app/src', 'docs/assets', 'docs/prototype', 'design/canvas', 'docs/index.html', 'docs/404.html', 'docs/explorations'];
const SKIP = /node_modules|docs\/app|docs\/storybook|docs\/screens/;

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    const child = join(full, name);
    if (SKIP.test(child)) return [];
    return statSync(child).isDirectory() ? files(relative(ROOT, child)) : /\.(css|html)$/.test(name) ? [child] : [];
  });
}

// State colors: a one-sided border in any of these is a stripe even at 1px.
const STATE_COLOR = /var\(--(accent|ai|warning|error|success|focus)/i;
const SIDE_BORDER = /border-(?:left|right|top|bottom|inline-start|inline-end|block-start|block-end)\s*:\s*([^;"}]+)/gi;
// `inset X Y color` with no blur or spread: a solid bar along one edge.
const INSET_BAR = /inset\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(?!-?\d)/gi;

export function stripesIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(SIDE_BORDER)) {
    const value = m[1].trim();
    if (/^(0|none)\b/.test(value)) continue;
    const width = Number(/(\d+(?:\.\d+)?)px/.exec(value)?.[1] ?? 1);
    if (width >= 2 || STATE_COLOR.test(value)) found.push(m[0]);
  }
  for (const m of text.matchAll(INSET_BAR)) {
    const [x, y] = [Math.abs(Number(m[1])), Math.abs(Number(m[2]))];
    if ((x === 0) !== (y === 0) && Math.max(x, y) >= 2) found.push(m[0].trim());
  }
  return found;
}

describe('D-017: no colored edge stripes', () => {
  it('detects the stripe patterns it guards against', () => {
    expect(stripesIn('.a { box-shadow: inset 4px 0 var(--accent); }')).toHaveLength(1);
    expect(stripesIn('.a { box-shadow: inset 0 -3px var(--accent); }')).toHaveLength(1);
    expect(stripesIn('.a { border-left: 4px solid var(--ai); }')).toHaveLength(1);
    expect(stripesIn('.a { border-inline-start: 1px solid var(--accent); }')).toHaveLength(1);
    expect(stripesIn('.a { border-left: 1px solid var(--line); box-shadow: inset 0 0 0 1px var(--line); }')).toHaveLength(0);
  });

  const all = SCAN.flatMap(files);
  it.each(all.map((f) => [relative(ROOT, f), f]))('%s has none', (_name, file) => {
    expect(stripesIn(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
