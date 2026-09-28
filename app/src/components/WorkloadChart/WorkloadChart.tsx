import { useId } from 'react';
import type { WorkloadEstimate } from '../../../../shared/domain';
import styles from './WorkloadChart.module.css';

export function WorkloadChart({ estimate }: { estimate: WorkloadEstimate }) {
  const dataId = useId();
  const max = Math.max(estimate.weeklyBudgetHours, ...estimate.weeks.map(item => item.hours), 1);
  return <div className={styles.wrap}><div className={styles.chart} role="img" aria-label={`Estimated hours per week; ${estimate.weeklyBudgetHours} hour budget`} aria-describedby={dataId}><div className={styles.budget} style={{ bottom: `${estimate.weeklyBudgetHours / max * 100}%` }}><span>{estimate.weeklyBudgetHours} h budget</span></div>{estimate.weeks.map(item => <div key={item.week} className={styles.column}><div className={`${styles.bar} ${item.overBudget ? styles.over : ''}`} style={{ height: `${Math.max(item.hours / max * 100, 2)}%` }} title={`Week ${item.week}: ${item.hours} hours${item.overBudget ? ', over budget' : ''}`} /><span>{item.week}</span></div>)}</div><details id={dataId}><summary>View weekly hours as a table</summary><table><caption>Estimated workload by week</caption><thead><tr><th scope="col">Week</th><th scope="col">Hours</th><th scope="col">Budget</th><th scope="col">Drivers</th></tr></thead><tbody>{estimate.weeks.map(item => <tr key={item.week}><th scope="row">{item.week}</th><td>{item.hours}{item.overBudget ? ' · over budget' : ''}</td><td>{estimate.weeklyBudgetHours}</td><td>{item.drivers.join(', ') || 'No listed activity'}</td></tr>)}</tbody></table></details></div>;
}
