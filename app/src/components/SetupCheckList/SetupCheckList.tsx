import type { GradebookSetup, SetupCheck } from '../../../../shared/grading/types';
import styles from './SetupCheckList.module.css';

type Patch = SetupCheck['fixes'][number]['patch'];
const titles: Record<SetupCheck['code'], string> = {
  'weights-not-100': 'Weights must total 100%', 'weight-invalid': 'Check category weight', 'category-empty': 'Category has no graded work',
  'drop-exceeds-items': 'Too many scores would be dropped', 'drop-before-complete': 'Drop rule is waiting for more work',
  'keep-at-least-invalid': 'Keep at least one score', 'drop-count-invalid': 'Check drop count', 'scheme-gap': 'Letter scheme needs a zero band',
  'scheme-overlap': 'Letter bands share a threshold', 'scheme-order': 'Put letter bands in order', 'late-no-cap': 'Late penalty has no limit',
  'extra-credit-uncapped': 'Extra credit has no course cap', 'item-no-category': 'Item needs a category', 'item-zero-points': 'Item has zero points',
  'missing-droppable': 'Missing scores can be dropped', 'mode-switch-extra-credit': 'Check extra credit after mode change',
};
export function checkSentence(check: SetupCheck, setup?: GradebookSetup): string {
  const category = setup?.categories.find(c => c.id === check.target)?.name;
  const subject = category ?? (check.target ? `Item ${check.target}` : 'This setup');
  switch (check.code) {
    case 'weights-not-100': return `The categories total ${check.params.total}% instead of 100%.`;
    case 'category-empty': return `${subject} has no graded work; its ${check.params.weight}% is shared until work is graded.`;
    case 'drop-exceeds-items': return `${subject} would drop ${check.params.requested} of ${check.params.items} items.`;
    case 'drop-before-complete': return `${subject} has ${check.params.remaining} of ${check.params.total} items still to come.`;
    case 'late-no-cap': return 'The late deduction has no maximum number of periods.';
    case 'extra-credit-uncapped': return 'Extra credit can raise the course grade without a course cap.';
    case 'missing-droppable': return 'A missing zero may be removed by a drop rule.';
    case 'mode-switch-extra-credit': return 'Extra credit may count differently after changing the calculation mode.';
    case 'item-zero-points': return `${subject} counts toward the grade but has zero possible points.`;
    case 'item-no-category': return `${subject} must be assigned to a category before saving.`;
    case 'scheme-gap': return 'The lowest letter band must begin at zero.';
    case 'scheme-overlap': return 'Two letter bands have the same minimum.';
    case 'scheme-order': return 'Letter thresholds must be in descending order.';
    case 'weight-invalid': return `${subject} needs a weight between 0 and 100%.`;
    case 'drop-count-invalid': return `${subject} needs whole, nonnegative drop counts.`;
    case 'keep-at-least-invalid': return `${subject} must keep at least one score.`;
  }
}
export function SetupCheckList({ checks, setup, onApplyFix, onDismiss }: {
  checks: SetupCheck[]; setup?: GradebookSetup; onApplyFix: (patch: Patch) => void; onDismiss?: (check: SetupCheck) => void;
}) {
  const groups = [{ key: 'fix', label: 'To fix' }, { key: 'review', label: 'To review' }, { key: 'pass', label: 'Passed' }] as const;
  return <section className={styles.root} aria-label="Setup check"><h2>Setup check</h2>{groups.map(group => {
    const entries = checks.filter(c => c.severity === group.key);
    return <div key={group.key}><h3>{group.label} <span>{entries.length}</span></h3><div role="list" aria-label={group.label} className={group.key === 'pass' ? styles.compact : styles.list}>
      {entries.length ? entries.map((check, i) => <div role="listitem" key={`${check.code}-${check.target}-${i}`} className={styles.item}><strong>{titles[check.code]}{check.target && setup?.categories.find(c => c.id === check.target) ? ` · ${setup.categories.find(c => c.id === check.target)!.name}` : ''}</strong>{group.key !== 'pass' && <><p>{checkSentence(check, setup)}</p>{check.fixes.map((fix, j) => <button key={j} type="button" onClick={() => onApplyFix(fix.patch)}>{fix.label}</button>)}{group.key === 'review' && onDismiss && <button type="button" onClick={() => onDismiss(check)}>Dismiss review</button>}</>}</div>) : <div role="listitem" className={styles.empty}>None</div>}
    </div></div>;
  })}</section>;
}
