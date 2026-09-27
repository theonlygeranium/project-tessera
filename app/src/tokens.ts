// Design tokens for the app, read straight from design/tokens.json (D-007, D-011).
// App code never hard-codes a color: it uses the generated CSS custom properties,
// e.g. var(--accent) or var(--font-serif). This module supplies swatch metadata.
import tokens from '../../design/tokens.json';

type Token = { $value: string | string[]; $description?: string };

export type ColorToken = { name: string; value: string; description: string };

export const colors: ColorToken[] = Object.entries(tokens.color as Record<string, Token>).map(
  ([name, t]) => ({ name, value: String(t.$value), description: t.$description ?? '' }),
);
