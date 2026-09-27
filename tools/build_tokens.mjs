// Generates docs/assets/tokens.css (CSS custom properties) from design/tokens.json.
// Runs as part of `npm run build` and before `npm run dev`; the output is gitignored.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../design/tokens.json', import.meta.url));
const output = fileURLToPath(new URL('../docs/assets/tokens.css', import.meta.url));
const tokens = JSON.parse(await readFile(source, 'utf8'));

const fontStack = (families) =>
  families.map((family) => (/\s/.test(family) ? `'${family}'` : family)).join(', ');

// A single numeric CSS length; ranges and artboard dimensions are not declarations.
const cssLength = /^(?:0|[+-]?(?:\d+|\d*\.\d+)(?:px|rem|em|ch|ex|lh|rlh|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cm|mm|Q|in|pt|pc))$/;
const declarations = [];

for (const [group, entries] of Object.entries(tokens)) {
  if (group.startsWith('$') || !['color', 'font', 'size', 'radius'].includes(group)) continue;
  for (const [name, token] of Object.entries(entries)) {
    if (name.startsWith('$')) continue;
    const value = token.$value;
    if (group === 'size' && (typeof value !== 'string' || !cssLength.test(value))) continue;
    const property = group === 'color' ? name : `${group === 'font' ? 'font' : group === 'size' ? 'size' : 'radius'}-${name}`;
    declarations.push(`  --${property}: ${group === 'font' ? fontStack(value) : value};`);
  }
}

// Institution accent choices (D-014 setup): --accent-option-<name>.
for (const [name, token] of Object.entries(tokens['accent-options'] ?? {})) {
  if (!name.startsWith('$')) declarations.push(`  --accent-option-${name}: ${token.$value};`);
}

await mkdir(fileURLToPath(new URL('../docs/assets/', import.meta.url)), { recursive: true });
await writeFile(output, `/* Generated from design/tokens.json; do not edit by hand. */\n:root {\n${declarations.join('\n')}\n}\n`);
