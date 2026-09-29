import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('grading module purity', () => {
  it('has no forbidden imports or ambient effects in non-test source files', () => {
    const root = join(process.cwd(), 'shared/grading');
    for (const file of readdirSync(root).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source, file).not.toMatch(/(?:from\s*['"]|import\s*\(['"])[^'"]*(?:\/ai|\/service|\/repo|worker\/|app\/)/);
      expect(source, file).not.toMatch(/Date\.now\s*\(|new\s+Date\s*\(\s*\)|Math\.random\s*\(|fetch\s*\(/);
    }
  });
});
