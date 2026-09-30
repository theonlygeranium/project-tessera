/** Parse an explicitly zoned ISO timestamp without accepting normalized calendar values. */
export function parseTimestamp(value: string, label: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new RangeError(`${label} needs a valid timestamp with explicit timezone offset`);
  const [, year, month, day, hour, minute, second = '0', , zone, , offsetHour = '0', offsetMinute = '0'] = match;
  const [y, mo, d, h, mi, s, oh, om] = [year, month, day, hour, minute, second, offsetHour, offsetMinute].map(Number);
  const local = new Date(0);
  local.setUTCFullYear(y, mo - 1, d);
  local.setUTCHours(h, mi, s, 0);
  const validCalendar = local.getUTCFullYear() === y && local.getUTCMonth() === mo - 1 && local.getUTCDate() === d && local.getUTCHours() === h && local.getUTCMinutes() === mi && local.getUTCSeconds() === s;
  const validOffset = zone === 'Z' || (oh <= 14 && om <= 59 && (oh < 14 || om === 0));
  if (!validCalendar || !validOffset) throw new RangeError(`${label} is not a valid calendar timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new RangeError(`${label} is not a parseable timestamp`);
  return parsed;
}
