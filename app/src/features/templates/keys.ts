/** Stable identity for a newly created template item. Renaming never calls this again. */
export function uniqueKey(title: string, used: string[]): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32).replace(/-$/g, '') || 'item';
  let key = base, suffix = 2;
  while (used.includes(key)) key = `${base}-${suffix++}`;
  return key;
}
