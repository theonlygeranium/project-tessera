import { useState } from 'react';
import type { BlockContent } from '../../../../../shared/domain';
import { FormField, Select, TextArea, TextInput } from '../../../components';
import { useApiQuery } from '../../../data/hooks';
import { ErrorNotice, Loading } from '../../../shell/Status';
import { UploadFile } from '../../access/UploadFile';
import { sizeText } from '../../access/utils';
import styles from './editors.module.css';

type FileContent = Extract<BlockContent, { type: 'file' }>;
export function FileEditor({ value, onChange, courseId }: { value: FileContent; onChange: (value: FileContent) => void; courseId: string }) {
  const files = useApiQuery('listFiles', { courseId, limit: 200 }, { enabled: !!courseId });
  const [uploaded, setUploaded] = useState('');
  return <div className={styles.editor}>
    <FormField label="Course file" required>{control => <Select {...control} value={value.fileId} onChange={e => onChange({ ...value, fileId: e.target.value })}><option value="">Choose a file</option>{files.data?.items.map(file => <option value={file.id} key={file.id}>{file.name} · {sizeText(file.size)}</option>)}{uploaded && !files.data?.items.some(file => file.id === uploaded) && <option value={uploaded}>Uploaded file</option>}</Select>}</FormField>
    {files.isPending ? <Loading label="Loading course files" /> : files.error ? <ErrorNotice error={files.error} onRetry={() => void files.refetch()} /> : files.data.items.length === 0 && <p>No course files yet.</p>}
    <UploadFile courseId={courseId} onUploaded={file => { setUploaded(file.id); onChange({ ...value, fileId: file.id, title: value.title || file.name }); }} />
    <FormField label="Title" required>{control => <TextInput {...control} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} />}</FormField>
    <FormField label="Description">{control => <TextArea {...control} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} />}</FormField>
  </div>;
}
