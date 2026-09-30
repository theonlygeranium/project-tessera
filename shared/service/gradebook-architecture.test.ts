import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function sourceFiles(root: string): string[] {
  return readdirSync(root, {
    withFileTypes: true
  }).flatMap(entry => entry.isDirectory() ? sourceFiles(join(root, entry.name)) : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [join(root, entry.name)] : []);
}
it('keeps grade arithmetic and AI out of gradebook services', () => {
  const root = new URL('../..', import.meta.url).pathname;
  const services = [...sourceFiles(join(root, 'shared/service')), ...sourceFiles(join(root, 'worker'))];
  for (const path of services) {
    const text = readFileSync(path, 'utf8');
    expect(text, `${path} sums grade points`).not.toMatch(/\+=\s*[^;\n]*(?:\.points|\.score)\b|\.reduce\([^\n]*\+[^\n]*(?:\.points|\.score)\b/);
  }
  for (const path of [
    ...sourceFiles(join(root, 'shared/grading')),
    join(root, 'shared/service/gradebook.ts'),
    join(root, 'shared/service/validate-gradebook.ts')
  ]) {
    expect(readFileSync(path, 'utf8'), `${path} imports AI`)
      .not.toMatch(/(?:import|require)\s*(?:[^\n]*\sfrom\s*)?['"][^'"]*\/ai(?:['"/]|$)/);
  }
});
