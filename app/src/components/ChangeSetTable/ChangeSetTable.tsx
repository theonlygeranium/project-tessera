import type { GradeChangeSet } from '../../../../shared/domain';
import styles from './ChangeSetTable.module.css';
const grade = (x: { percent: number | null; letter: string | null }) => x.percent === null ? '—' : `${x.percent.toFixed(1)}% ${x.letter ?? ''}`;
export function ChangeSetTable({ changeSet }: { changeSet: GradeChangeSet }) {
  const changed = changeSet.changes.filter(c => c.from.percent !== c.to.percent || c.from.letter !== c.to.letter);
  return <section className={styles.root} aria-label="If you save"><h2>If you save</h2><p><strong>{changed.length} current grades change</strong> · {changeSet.letterChanges} letter changes</p>
    {changed.length ? <div className={styles.scroll}><table><caption>Largest grade moves</caption><thead><tr><th scope="col">Student</th><th scope="col">From → to</th><th scope="col">Change</th></tr></thead><tbody>{changed.slice(0, 5).map(c => <tr key={c.studentId}><th scope="row">{c.name}</th><td>{grade(c.from)} → {grade(c.to)}</td><td>{c.from.percent === null || c.to.percent === null ? '—' : `${c.to.percent - c.from.percent >= 0 ? '+' : ''}${(c.to.percent - c.from.percent).toFixed(1)} points`}</td></tr>)}</tbody></table></div> : <p>No current grades change.</p>}
    <p className={styles.reassurance}>Scores themselves don’t change. Only the setup used to calculate current grades changes.</p></section>;
}
