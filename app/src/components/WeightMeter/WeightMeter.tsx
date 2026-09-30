import type { GradeCategory } from '../../../../shared/grading/types';
import styles from './WeightMeter.module.css';
export function WeightMeter({ categories }: { categories: GradeCategory[] }) {
  const total = categories.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const valid = Math.abs(total - 100) <= 0.01;
  return <div className={styles.root}><div className={styles.track} role="img" aria-label={`${categories.map(c => `${c.name} ${c.weight}%`).join(', ')}. Total ${total}%${valid ? '' : ', weights must total 100%'}`}>
    {categories.map((c, i) => <span key={c.id} className={i % 2 ? styles.alt : styles.segment} style={{ width: `${Math.max(0, Math.min(100, c.weight))}%` }} title={`${c.name} ${c.weight}%`} />)}
  </div><p>{categories.map(c => `${c.name} ${c.weight}%`).join(' · ')}</p><strong className={valid ? styles.valid : styles.invalid}>{valid ? '✓ Total 100%' : `Total ${total}% · ${total < 100 ? `${100 - total}% short` : `${total - 100}% over`}`}</strong></div>;
}
