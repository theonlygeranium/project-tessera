import { FormField, TextArea, TextInput } from '../../../components';
import { linkUrlError, type LinkContent } from '../model';
import styles from './editors.module.css';

export function LinkEditor({ value, onChange }: { value: LinkContent; onChange: (value: LinkContent) => void }) {
  return <div className={styles.editor}>
    <FormField label="Link text" required hint="Name the page this link opens. The URL alone is not enough.">{control => <TextInput {...control} value={value.text} onChange={e => onChange({ ...value, text: e.target.value })} />}</FormField>
    <FormField label="URL" required error={linkUrlError(value.href)}>{control => <TextInput {...control} type="url" value={value.href} onChange={e => onChange({ ...value, href: e.target.value })} />}</FormField>
    <FormField label="Description" hint="Optional. Shown beside the link, not inside it.">{control => <TextArea {...control} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} />}</FormField>
  </div>;
}
