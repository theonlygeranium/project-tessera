#!/usr/bin/env node
// Regenerate the fictional demo source from the same Access parser used by the Worker.
import { build } from 'esbuild';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const bundled = resolve(root, 'tools/.seed-syllabus-parser.mjs');
try {
  await build({ entryPoints: [resolve(root, 'worker/access/index.ts')], outfile: bundled, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  const { checkDocument } = await import(pathToFileURL(bundled).href);
  const bytes = await readFile(resolve(root, 'tests/fixtures/syllabus/STAT110_Syllabus_Fall2026.pdf'));
  const check = await checkDocument('pdf', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const sections = check.text.sections.map(section => ({ page: section.page ?? null, heading: section.heading, level: section.level, text: section.text, lines: section.lines ?? section.text.split('\n') }));
  const source = { kind: 'syllabus', fileId: null, version: null, name: 'STAT110_Syllabus_Fall2026.pdf', sections, chars: sections.reduce((n, section) => n + section.lines.join('\n').length, 0), ocr: false };
  await writeFile(resolve(root, 'shared/seed-syllabus.json'), `${JSON.stringify(source, null, 2)}\n`);
} finally {
  await unlink(bundled).catch(() => {});
}
