import { useId, type FieldsetHTMLAttributes } from 'react';
import styles from './SegmentedControl.module.css';
export type SegmentedControlProps = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> & {
  legend: string; hideLegend?: boolean; name: string;
  options: { value: string; label: string; locked?: string }[];
  value: string; onChange: (value: string) => void;
  density?: 'learner' | 'compact';
};
export function SegmentedControl({ legend, hideLegend, name, options, value, onChange, density = 'learner', className, ...props }: SegmentedControlProps) {
  const id = useId();
  return <fieldset {...props} className={[styles.group, styles[density], className].filter(Boolean).join(' ')}>
    <legend className={hideLegend ? styles.visuallyHidden : styles.legend}>{legend}</legend>
    <div className={styles.segments}>{options.map((option, index) => <label key={option.value} className={[styles.segment, option.locked && styles.locked].filter(Boolean).join(' ')}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={!!option.locked} aria-describedby={option.locked ? `${id}-reason-${index}` : undefined} onChange={() => onChange(option.value)} />
      <span className={styles.label}>{option.locked && <span aria-hidden="true">🔒 </span>}{option.label}</span>
      {option.locked && <span className={styles.reason} id={`${id}-reason-${index}`}>Locked: {option.locked}</span>}
    </label>)}</div>
  </fieldset>;
}
