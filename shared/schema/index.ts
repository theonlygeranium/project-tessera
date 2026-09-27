import { z } from 'zod';
import { ApiError } from '../api';
import type { Input, Operation } from '../api';
import { OPERATIONS } from './operations';
export { OPERATIONS } from './operations';

function issuePath(parts: PropertyKey[]): string {
  return parts.reduce<string>((path, part) => typeof part === 'number' ? `${path}[${part}]` : path ? `${path}.${String(part)}` : String(part), '');
}

type Def = { type: string; innerType?: z.ZodType; shape?: Record<string, z.ZodType> };

/** Query strings carry GET and DELETE input, so numbers and booleans arrive as text. Coerces the fields the operation expects. */
export function coerceQuery<K extends Operation>(op: K, query: Record<string, unknown>): Record<string, unknown> {
  const shape = (OPERATIONS[op].input.def as Def).shape;
  if (!shape) return query;
  const out = { ...query };
  for (const [key, field] of Object.entries(shape)) {
    const raw = out[key];
    if (typeof raw !== 'string') continue;
    let def = field.def as Def;
    while (def.innerType) def = def.innerType.def as Def;
    if (def.type === 'number' && raw.trim() !== '' && Number.isFinite(Number(raw))) out[key] = Number(raw);
    else if (def.type === 'boolean' && (raw === 'true' || raw === 'false')) out[key] = raw === 'true';
  }
  return out;
}

export function validateInput<K extends Operation>(op: K, value: unknown): Input<K> {
  // Operations without input ignore whatever the URL carried (an app query string, for example).
  if ((OPERATIONS[op].input.def as Def).type === 'void') return undefined as Input<K>;
  const result = (OPERATIONS[op].input as z.ZodType<Input<K>>).safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map(issue => ({ path: issuePath(issue.path), message: issue.message }));
  throw new ApiError('invalid', issues[0]?.message ?? 'Invalid input.', { issues });
}
