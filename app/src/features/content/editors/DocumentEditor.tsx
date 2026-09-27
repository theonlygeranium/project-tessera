import { Button, FormField, TextArea, TextInput } from '../../../components';
import { LIMITS, moveItem, type DocumentContent } from '../model';
import { ItemActions } from './actions';
import styles from './editors.module.css';

export function DocumentEditor({ value, onChange }: { value: DocumentContent; onChange: (value: DocumentContent) => void }) {
  const sections = value.sections;
  const write = (next: DocumentContent['sections']) => onChange({ ...value, sections: next });
  return <div className={styles.editor}>
    <FormField label="Title" required>{control => <TextInput {...control} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} />}</FormField>
    <div className={styles.stack}>
      {sections.map((section, index) => <fieldset key={index} className={styles.item}>
        <legend className={styles.legend}>Section {index + 1}</legend>
        <FormField label="Heading" required>{control => <TextInput {...control} value={section.heading} onChange={e => write(sections.map((item, i) => i === index ? { ...item, heading: e.target.value } : item))} />}</FormField>
        <FormField label="Text" required>{control => <TextArea {...control} value={section.text} onChange={e => write(sections.map((item, i) => i === index ? { ...item, text: e.target.value } : item))} />}</FormField>
        <ItemActions label={`section ${index + 1}`} index={index} count={sections.length} onMove={(i, offset) => write(moveItem(sections, i, offset))} onRemove={i => write(sections.filter((_, index) => index !== i))} />
      </fieldset>)}
      <div className={styles.toolbar}>
        <Button density="compact" disabled={sections.length >= LIMITS.sections} onClick={() => write([...sections, { heading: '', text: '' }])}>Add section</Button>
      </div>
    </div>
  </div>;
}
