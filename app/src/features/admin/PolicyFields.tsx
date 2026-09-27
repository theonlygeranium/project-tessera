// Shared AI policy controls for first-run setup and the AI policy page.
import { ChoiceGroup } from '../../components';
import { TUTOR_MODES } from '../../../../shared/policy';
import styles from './Admin.module.css';
import { AI_DRAFT_NOTE, modesFrom, tutorChoice, type PolicyValue } from './form';

const AUTHORING = [
  { value: 'on', label: 'On', description: 'Instructors can ask for AI drafts.' },
  { value: 'off', label: 'Off', description: 'Instructors write without AI drafts.' },
];

export function PolicyFields({
  value,
  onChange,
  headings = false,
}: {
  value: PolicyValue;
  onChange: (value: PolicyValue) => void;
  /** On the policy page, section headings wrap the same controls. Setup leaves them as legends. */
  headings?: boolean;
}) {
  const authoring = (
    <>
      <ChoiceGroup
        legend={headings ? 'Turn AI authoring on or off' : 'AI authoring for instructors'}
        hideLegend={headings}
        type="radio"
        name="ai-authoring"
        options={AUTHORING}
        value={value.aiAuthoring ? 'on' : 'off'}
        onChange={(next) => {
          if (next === 'on' || next === 'off') onChange({ ...value, aiAuthoring: next === 'on' });
        }}
      />
      <p className={styles.note}>{AI_DRAFT_NOTE}</p>
    </>
  );

  const tutors = (
    <>
      <ChoiceGroup
        legend="Graded work"
        type="checkbox"
        name="tutor-graded"
        options={TUTOR_MODES.map((mode) => tutorChoice(mode, 'graded'))}
        value={value.graded}
        onChange={(next) => {
          if (Array.isArray(next)) onChange({ ...value, graded: modesFrom(next, 'graded') });
        }}
      />
      <ChoiceGroup
        legend="Practice"
        type="checkbox"
        name="tutor-practice"
        options={TUTOR_MODES.map((mode) => tutorChoice(mode, 'practice'))}
        value={value.practice}
        onChange={(next) => {
          if (Array.isArray(next)) onChange({ ...value, practice: modesFrom(next, 'practice') });
        }}
      />
    </>
  );

  if (headings) {
    return (
      <>
        <section className={styles.section}>
          <h2>AI authoring for instructors</h2>
          {authoring}
        </section>
        <section className={styles.section}>
          <h2>Tutor modes allowed</h2>
          {tutors}
        </section>
      </>
    );
  }

  return (
    <div className={styles.stack}>
      {authoring}
      <h3>Tutor modes allowed</h3>
      {tutors}
    </div>
  );
}
