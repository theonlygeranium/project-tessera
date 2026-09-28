#!/usr/bin/env node
// Scores "Start from a syllabus" against answer keys (handoff/SYLLABUS-EVAL-RUBRIC.md).
//   node tools/syllabus_eval.mjs [--ai palmyra|fixture] [--runs N] [--only NAME] [--dirs a,b] [--keep]
// Palmyra needs WRITER_API_KEY in the environment. Real syllabi and their keys live in the
// gitignored tests/fixtures/syllabus/private/ and must never be committed.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bundled = resolve(root, 'tools/.syllabus-eval.mjs');
try {
  await build({ entryPoints: [resolve(root, 'tools/syllabus-eval/eval.ts')], outfile: bundled, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.json': 'json' }, logLevel: 'warning' });
  const { status } = spawnSync(process.execPath, [bundled, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
  process.exitCode = status ?? 1;
} finally {
  await unlink(bundled).catch(() => {});
}
