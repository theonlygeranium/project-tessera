import type { Meta, StoryObj } from '@storybook/react-vite';
import { AiContent, AiRef } from './AiContent';

// Content is fictional and taken from the prototype and artboards.
const meta = {
  title: 'Components/AiContent',
  component: AiContent,
  parameters: {
    docs: {
      description: {
        component:
          'Everything the AI produces uses this one markup contract (D-006). The look follows the AI style in the toolbar: Marginalia is current; tabs, perforated, and tiles are kept as alternatives. Every instance names what the AI is and what it is working from, and drafted blocks say "not yet reviewed" until a person keeps them (D-003).',
      },
    },
  },
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
} satisfies Meta<typeof AiContent>;

export default meta;
type Story = StoryObj<typeof AiContent>;

export const TutorHint: Story = {
  name: 'Tutor hint (chat)',
  args: {
    kind: 'chat',
    who: 'Course tutor',
    source: 'hint 1 of 2',
    cites: ['Week 3 slides, p. 4', 'Reading 3.2, §2'],
    children: (
      <>
        Think about what F1 is computed from.
        <AiRef n={1} /> If the same customers sit in both sets, which inputs to F1 are already contaminated?
        <AiRef n={2} />
      </>
    ),
  },
};

export const CoAuthor: Story = {
  name: 'Co-author reply (chat)',
  args: {
    kind: 'chat',
    who: 'Co-author',
    source: 'from your 6 sources',
    cites: ['Fairness_audit_guide.docx, §3'],
    children: (
      <>
        Drafted a 6-turn role-play: the learner is the auditor, and the AI plays a product manager defending the 94%
        number.
        <AiRef n={1} /> One gap: your sources don't define "disparate impact ratio", so I left that line as a
        placeholder for you.
      </>
    ),
  },
};

export const Summary: Story = {
  name: 'Summary (note)',
  args: {
    kind: 'note',
    who: 'Summary',
    source: 'written by the tutor from your answers and chat',
    children:
      'You were solid on reporting subgroup performance and identifying proxy features. The gap is fixing person-level leakage. Suggested next step: the 4-minute "Subgroup metrics" chunk, then the new review cards.',
  },
};

export const DraftBlock: Story = {
  name: 'Drafted block (not yet reviewed)',
  args: {
    kind: 'block',
    state: 'draft',
    who: 'AI draft',
    source: 'from Week3_slides.pdf p. 4–7 · v3',
    children:
      'Remember: a single headline metric is a claim about the average person. Fairness questions are about who the average hides.',
    actions: (
      <>
        <button type="button">Accept</button>
        <button type="button">Revert</button>
        <button type="button">Regenerate</button>
      </>
    ),
  },
};

export const KeptBlock: Story = {
  name: 'Kept block (reviewed)',
  args: {
    kind: 'block',
    state: 'kept',
    who: 'AI draft',
    source: 'from Week3_slides.pdf p. 4–7',
    children:
      'Remember: a single headline metric is a claim about the average person. Fairness questions are about who the average hides.',
  },
};
