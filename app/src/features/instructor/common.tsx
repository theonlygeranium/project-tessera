import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, FormField, StatusNotice, TextArea, TextInput, TopBar } from '../../components';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import styles from './instructor.module.css';

export function CourseBar({ title, courseId, courseTitle, actions }: { title: string; courseId: string; courseTitle?: string; actions?: ReactNode }) {
  return <TopBar title={title} breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: courseTitle ?? title, href: title === courseTitle ? undefined : paths.teach.course(courseId) }, ...(title !== courseTitle ? [{ label: title }] : [])]} renderLink={renderRouterLink} actions={actions} />;
}
export function Message({ text, error }: { text: string; error?: boolean }) {
  return text ? <StatusNotice tone={error ? 'error' : 'success'} live="polite">{text}</StatusNotice> : null;
}
export function Field({ label, value, onChange, error, multiline = false, type = 'text', required = false, hint }: { label: string; value: string; onChange: (value: string) => void; error?: string; multiline?: boolean; type?: 'text' | 'number' | 'url'; required?: boolean; hint?: string }) {
  return <FormField label={label} error={error} required={required} hint={hint}>{control => multiline ? <TextArea {...control} value={value} onChange={e => onChange(e.target.value)} /> : <TextInput {...control} type={type} value={value} onChange={e => onChange(e.target.value)} />}</FormField>;
}
export function ActionLink({ to, children }: { to: string; children: ReactNode }) { return <Link className={styles.actionLink} to={to}>{children}</Link>; }
export function SaveButton({ children, pending, disabled }: { children: ReactNode; pending?: boolean; disabled?: boolean }) { return <Button variant="primary" density="compact" type="submit" disabled={pending || disabled}>{children}</Button>; }
export function dateText(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : 'No activity yet'; }
