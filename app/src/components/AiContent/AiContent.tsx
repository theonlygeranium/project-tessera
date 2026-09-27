import type { ReactNode } from 'react';

// Renders the AI markup contract (design/DESIGN-NOTES.md, D-003, D-006).
// The look comes from docs/assets/ai-voice.css and the page's data-ai-style
// (marginalia by default), so this component never styles AI content itself.

type Common = {
  /** What the AI is: "Course tutor", "Co-author", "AI draft", "Summary". Always shown. */
  who: string;
  /** What it's working from, or where it is in a sequence: "hint 1 of 2", "from Week3_slides.pdf p. 4–7". */
  source?: string;
  /** Numbered sources, rendered as footnotes. Mark references in the body with <AiRef n={…} />. */
  cites?: string[];
  /** Buttons or links acting on this content. */
  actions?: ReactNode;
  /** The AI's text. */
  children: ReactNode;
};

export type AiContentProps =
  | (Common & {
      /** A tutor or co-author message. */
      kind: 'chat';
    })
  | (Common & {
      /** A summary, AI-drafted feedback, or an insight card. */
      kind: 'note';
    })
  | (Common & {
      /** An authored content block. Drafts never reach learners until a person keeps them (D-003). */
      kind: 'block';
      state: 'draft' | 'kept';
    });

export function AiContent(props: AiContentProps) {
  const { kind, who, source, cites, actions, children } = props;
  const state = kind === 'block' ? props.state : undefined;
  // Review state must be legible without color (D-006). Kept blocks get "· kept" from ai-voice.css.
  const srcText = [source, state === 'draft' ? 'not yet reviewed' : null].filter(Boolean).join(' · ');

  return (
    <div className={`ai ai--${kind}`} data-state={state}>
      <div className="ai-who">
        {who}
        {srcText && (
          <>
            {' '}
            <span className="ai-src">· {srcText}</span>
          </>
        )}
      </div>
      <div className="ai-body">{children}</div>
      {cites && cites.length > 0 && (
        <div className="ai-cites">
          {cites.map((c, i) => (
            <span className="ai-cite" data-n={i + 1} key={c}>
              {c}
            </span>
          ))}
        </div>
      )}
      {actions && <div className="ai-actions">{actions}</div>}
    </div>
  );
}

/** A footnote marker in AI text, pointing at the nth entry of `cites`. */
export function AiRef({ n }: { n: number }) {
  return <sup className="ai-ref">{n}</sup>;
}
