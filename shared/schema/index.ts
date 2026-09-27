import { z } from 'zod';
import { ApiError } from '../api';
import type { Input, Operation } from '../api';
import { OPERATIONS } from './operations';
export { OPERATIONS } from './operations';

function issuePath(parts: PropertyKey[]): string {
  return parts.reduce<string>((path, part) => typeof part === 'number' ? `${path}[${part}]` : path ? `${path}.${String(part)}` : String(part), '');
}

export function validateInput<K extends Operation>(op: K, value: unknown): Input<K> {
  const result = (OPERATIONS[op].input as z.ZodType<Input<K>>).safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map(issue => ({ path: issuePath(issue.path), message: issue.message }));
  throw new ApiError('invalid', issues[0]?.message ?? 'Invalid input.', { issues });
}
