import { colors } from '../tokens';
import { usePageTitle } from '../shell/usePageTitle';
import './TokensPage.css';

// The token showcase (D-011 skeleton), kept at /app/tokens: every color and typeface
// is read live from the design tokens.
export function TokensPage() {
  usePageTitle('Design tokens');
  return (
    <>
      <header className="hero">
        <div className="wrap">
          <a href="/">← Project Tessera</a>
          <p className="eyebrow">Phase 2 · component app</p>
          <h1>The component app starts here.</h1>
          <p className="lede">
            Phase 2 builds Tessera's screens from shared React components instead of one-off mockups. This page is
            the first step: every color and typeface below is read live from the design tokens, so a token change
            shows up everywhere at once.
          </p>
        </div>
      </header>
      <main className="wrap">
        <section aria-labelledby="colors-h">
          <h2 id="colors-h">Color tokens</h2>
          <p className="muted">
            {colors.length} colors from <code>design/tokens.json</code>. Warning text uses <code>warning-text</code>;
            violet is reserved for AI.
          </p>
          <ul className="swatches">
            {colors.map((c) => (
              <li key={c.name} className="swatch">
                <span className="chip" style={{ background: `var(--${c.name})` }} aria-hidden="true" />
                <span className="name">
                  <code>{c.name}</code>
                  <span className="value">{c.value.toUpperCase()}</span>
                </span>
                {c.description && <span className="desc">{c.description}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="type-h">
          <h2 id="type-h">Typefaces</h2>
          <p className="sample serif">Fraunces · titles, lesson reading, and all AI text</p>
          <p className="sample sans">IBM Plex Sans · all human interface text</p>
          <p className="sample mono">IBM Plex Mono · shortcuts and footnote numerals</p>
        </section>
      </main>
    </>
  );
}
