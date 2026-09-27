import { useId, type FieldsetHTMLAttributes } from 'react';
import styles from './ChoiceGroup.module.css';

export type ChoiceGroupProps = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> & {
  legend: string;
  hideLegend?: boolean;
  type: 'radio' | 'checkbox';
  name: string;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  variant?: 'plain' | 'card';
  error?: string;
};
export function ChoiceGroup({ legend, hideLegend, type, name, options, value, onChange, variant = 'plain', error, className, ...fieldsetProps }: ChoiceGroupProps) {
  const id = useId();
  const selected = Array.isArray(value) ? value : [value];
  return <fieldset {...fieldsetProps} className={[styles.group, styles[variant], className].filter(Boolean).join(' ')} aria-describedby={error ? `${id}-error` : fieldsetProps['aria-describedby']}>
    <legend className={hideLegend ? styles.visuallyHidden : styles.legend}>{legend}</legend>
    <div className={styles.options}>{options.map((option) => <label key={option.value} className={[styles.option, option.disabled && styles.disabled].filter(Boolean).join(' ')}>
      <input type={type} name={name} value={option.value} checked={selected.includes(option.value)} disabled={option.disabled} aria-invalid={error ? true : undefined} onChange={() => {
        if (type === 'radio') onChange(option.value);
        else onChange(selected.includes(option.value) ? selected.filter((item) => item !== option.value) : [...selected, option.value]);
      }} />
      <span><span className={styles.optionLabel}>{option.label}</span>{option.description && <span className={styles.description}>{option.description}</span>}</span>
    </label>)}</div>
    {error && <p className={styles.error} id={`${id}-error`}>Error: {error}</p>}
  </fieldset>;
}
