import type { StructureOption } from '../../../../shared/domain';
import { Citation } from '../Citation/Citation';
import { AiContent } from '../AiContent/AiContent';
import styles from './OptionCard.module.css';

export function OptionCard({ option, letter, selected, onChange }: { option: StructureOption; letter: string; selected: boolean; onChange: (selected: boolean) => void }) {
  return <AiContent kind="note" who="Design partner" source="from your syllabus and confirmed outcomes"><section className={`${styles.card} ${selected ? styles.selected : ''}`} aria-labelledby={`option-${letter}`}>
    <div className={styles.top}><div><span className={styles.tag}>{letter} · {option.tag}</span><h2 id={`option-${letter}`}>{option.label}</h2></div><label className={styles.use}><input type="checkbox" checked={selected} onChange={event => onChange(event.target.checked)} aria-label={`Use approach ${letter}: ${option.label}`} />Use</label></div>
    <p>{option.description}</p>
    <div><h3>Fits because</h3><ul>{option.fits.map((fit, index) => <li key={index}>{fit.text} {fit.span && <Citation span={fit.span} />}</li>)}</ul></div>
    <div><h3>Changes versus your syllabus</h3><p>{option.changes}</p></div>
    <div><h3>Trade-offs</h3><p>{option.tradeoffs}</p></div>
    <div><h3>Evidence, in one line</h3><p>{option.evidence}</p></div>
    <div><h3>Module outline</h3><ol className={styles.modules}>{option.modules.map((module, index) => <li key={index}><strong>{module.title}</strong> · {module.weeks.map(week => `week ${week}`).join(', ')} · {module.hours} h</li>)}</ol></div>
    <div className={styles.bottom}><p>{option.modules.length} modules · average {option.workload.averageHours} h/week · peak {option.workload.peakHours} h in module {option.workload.peakModule}</p><p>Draws on: {option.frameworks.join(' · ')}</p></div>
  </section></AiContent>;
}
