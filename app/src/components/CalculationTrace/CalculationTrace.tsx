import type { ReactNode } from 'react';
import type { CalculationTrace as Trace } from '../../../../shared/grading/types';
import { arithmeticLine, explain } from '../../../../shared/grading/explain';
import styles from './CalculationTrace.module.css';

export function CalculationTrace({ trace, lines, arithmetic, name, audience = 'staff', provenance }: {
  trace: Trace; lines?: string[]; arithmetic?: string; name: string; audience?: 'staff' | 'student'; provenance?: ReactNode;
}) {
  const descriptions = lines ?? explain(trace, audience, name);
  const categoryLines = (categoryId: string) => trace.steps.flatMap((step, index) => {
    const category = trace.categories.find(c => c.categoryId === categoryId);
    return step.target.categoryId === categoryId || category?.items.some(i => i.assignmentId === step.target.assignmentId)
      ? [descriptions[index]] : [];
  }).filter(Boolean);
  return <section className={styles.root} aria-label={audience === 'student' ? 'How your grade was calculated' : `How ${name}'s grade was calculated`}>
    <h3>How this grade was calculated</h3>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={audience === 'student' ? 'Category contributions for your grade' : `Category contributions for ${name}`}><table><caption className={styles.sr}>Category contributions for {audience === 'student' ? 'your grade' : name}</caption><thead><tr><th scope="col">Category</th><th scope="col">Weight</th><th scope="col">Earned / possible</th><th scope="col">Percent</th><th scope="col">Contribution</th></tr></thead><tbody>
      {trace.categories.map(category => <tr key={category.categoryId}><th scope="row">{category.name}{categoryLines(category.categoryId).length > 0 && <ul className={styles.reasons}>{categoryLines(category.categoryId).map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ul>}</th><td>{category.weight}%</td><td>{category.earned.toFixed(2)} / {category.possible.toFixed(2)}</td><td>{category.percent === null ? '—' : `${category.percent.toFixed(1)}%`}</td><td>{category.contribution === null ? '—' : category.contribution.toFixed(2)}</td></tr>)}
    </tbody></table></div>
    <p className={styles.arithmetic}>{arithmetic ?? arithmeticLine(trace, audience)}</p>
    {provenance && <p className={styles.provenance}>{provenance}</p>}
  </section>;
}
