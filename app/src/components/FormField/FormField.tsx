import { useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './FormField.module.css';

type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true; required?: boolean };
export type FormFieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
  children: (control: ControlProps) => ReactNode;
};

export function FormField({ label, hint, error, required, id, children, className, ...divProps }: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const describedBy = [hint && `${controlId}-hint`, error && `${controlId}-error`].filter(Boolean).join(' ') || undefined;
  return <div {...divProps} className={[styles.field, className].filter(Boolean).join(' ')}>
    <label className={styles.label} htmlFor={controlId}>{label}{required && <span className={styles.required}> (required)</span>}</label>
    {hint && <p className={styles.hint} id={`${controlId}-hint`}>{hint}</p>}
    {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
    {error && <p className={styles.error} id={`${controlId}-error`}>Error: {error}</p>}
  </div>;
}

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { type?: 'text' | 'email' | 'number' | 'url' | 'search' };
export function TextInput({ className, type = 'text', ...props }: TextInputProps) {
  return <input {...props} type={type} className={[styles.control, className].filter(Boolean).join(' ')} />;
}
export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export function TextArea({ className, ...props }: TextAreaProps) {
  return <textarea {...props} className={[styles.control, styles.textarea, className].filter(Boolean).join(' ')} />;
}
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
export function Select({ className, children, ...props }: SelectProps) {
  return <select {...props} className={[styles.control, className].filter(Boolean).join(' ')}>{children}</select>;
}
