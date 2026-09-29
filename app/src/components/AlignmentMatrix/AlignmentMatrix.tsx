import type { ExtractedAssessment, ExtractedOutcome, InstructionalRead } from '../../../../shared/domain';
import styles from './AlignmentMatrix.module.css';

type State = InstructionalRead['alignment'][number]['state'];
const labels: Record<State, string> = { assessed: 'Assessed', 'verb-mismatch': 'Verb mismatch', none: 'Not assessed' };
const marks: Record<State, string> = { assessed: '●', 'verb-mismatch': '◆', none: '○' };
export function AlignmentMatrix({ outcomes, assessments, alignment }: { outcomes: ExtractedOutcome[]; assessments: ExtractedAssessment[]; alignment: InstructionalRead['alignment'] }) {
  const map = new Map(alignment.map(item => [`${item.outcomeId}:${item.assessmentId}`, item.state]));
  return <div className={styles.wrap} role="region" aria-label="Outcomes and assessments" tabIndex={0}><table className={styles.table}><caption>How syllabus outcomes relate to graded assessments</caption><thead><tr><th scope="col">Outcome</th>{assessments.map(item => <th scope="col" key={item.id}>{item.title}</th>)}</tr></thead><tbody>{outcomes.map((outcome, index) => <tr key={outcome.id}><th scope="row">O{index + 1} · {outcome.text}</th>{assessments.map(assessment => { const state = map.get(`${outcome.id}:${assessment.id}`) ?? 'none'; return <td key={assessment.id}><span className={styles[state]} aria-label={labels[state]}><span aria-hidden="true">{marks[state]}</span><span className={styles.cellText}>{labels[state]}</span></span></td>; })}</tr>)}</tbody></table><p className={styles.legend}>Key: ● Assessed · ◆ Verb mismatch · ○ Not assessed</p></div>;
}
