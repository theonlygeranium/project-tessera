import type { HTMLAttributes } from 'react';
import styles from './ProgressMeter.module.css';
export type ProgressMeterProps = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
  label: string; value: number; max?: number; valueText?: string; variant?: 'bar' | 'thin' | 'ring';
};
export function ProgressMeter({ label, value, max = 100, valueText, variant = 'bar', className, ...props }: ProgressMeterProps) {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  const percent = (safeValue / safeMax) * 100;
  const display = valueText ?? `${Math.round(percent)}%`;
  return <div {...props} className={[styles.meter, styles[variant], className].filter(Boolean).join(' ')}>
    {variant === 'ring'
      ? <div className={styles.ringRow}>
          <div className={styles.ringWrap}>
            <svg className={styles.ringSvg} viewBox="0 0 100 100" aria-hidden="true"><circle className={styles.ringTrack} cx="50" cy="50" r="42" />{percent > 0 && <circle className={styles.ringFill} cx="50" cy="50" r="42" pathLength="100" strokeDasharray={`${percent} 100`} />}</svg>
            <span className={styles.ringValue} aria-hidden="true">{Math.round(percent)}%</span>
          </div>
          <div className={styles.ringText}><span className={styles.ringLabel}>{label}</span><span>{display}</span></div>
        </div>
      : <><div className={styles.heading}><span>{label}</span><span>{display}</span></div><div className={styles.track}><div className={styles.fill} style={{ width: `${percent}%` }} /></div></>}
    <div className={styles.srOnly} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} aria-valuetext={display} />
  </div>;
}
