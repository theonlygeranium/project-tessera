import type { BlockContent } from '../../../../../shared/domain';
import { useApiQuery } from '../../../data/hooks';
import { ErrorNotice, Loading } from '../../../shell/Status';
import { AccessibleFormats } from '../../access/AccessibleFormats';
import { contentUrl, sizeText } from '../../access/utils';
import styles from './players.module.css';

export function FilePlayer({ value }: { value: Extract<BlockContent, { type: 'file' }> }) {
  const file = useApiQuery('getFile', { fileId: value.fileId }, { enabled: !!value.fileId });
  return <section className={styles.player}><h3>{value.title || file.data?.name || 'File'}</h3>{value.description && <p>{value.description}</p>}
    {!value.fileId ? <p>No file selected.</p> : file.isPending ? <Loading label="Loading file" /> : file.error ? <ErrorNotice error={file.error} onRetry={() => void file.refetch()} /> : file.data && <><p><a href={contentUrl(file.data.id)} download>Download {file.data.name}</a> · {file.data.kind.toUpperCase()} file · {sizeText(file.data.size)}</p><AccessibleFormats fileId={file.data.id} kind={file.data.kind} /></>}
  </section>;
}
