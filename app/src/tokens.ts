// Design tokens for the app, read straight from design/tokens.json (D-007, D-011).
// App code never hard-codes a color: it uses the CSS custom properties that
// applyTokens() sets, e.g. var(--accent) or var(--font-serif).
import tokens from '../../design/tokens.json';

type Token = { $value: string | string[]; $description?: string };

export type ColorToken = { name: string; value: string; description: string };

export const colors: ColorToken[] = Object.entries(tokens.color as Record<string, Token>).map(
  ([name, t]) => ({ name, value: String(t.$value), description: t.$description ?? '' }),
);

const fontStack = (families: string[]) =>
  families.map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ');

export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const c of colors) root.style.setProperty(`--${c.name}`, c.value);
  for (const [name, t] of Object.entries(tokens.font as Record<string, Token>)) {
    root.style.setProperty(`--font-${name}`, fontStack(t.$value as string[]));
  }
  for (const [name, t] of Object.entries(tokens.radius as Record<string, Token>)) {
    if (name.startsWith('$')) continue;
    root.style.setProperty(`--radius-${name}`, String(t.$value));
  }
}
