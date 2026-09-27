import { useEffect, useRef, useState } from 'react';
import type { AccessibleFormat, FileKind } from '../../../../shared/domain';
import { Button, StatusNotice } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import {contentUrl} from './utils';
import { errorText } from './errors';
import styles from './access.module.css';

const offered: { format: AccessibleFormat; label: string }[] = [
  { format: 'reading', label: 'reading version' },
  { format: 'audio', label: 'audio' },
  { format: 'epub', label: 'e-book' },
];
const ocrOption = { format: 'ocr' as AccessibleFormat, label: 'searchable PDF (OCR)' };
export function AccessibleFormats({ fileId, kind }: { fileId: string; kind?: FileKind }) {
  const choices = kind === 'pdf' ? [...offered, ocrOption] : offered;
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null); useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  const [working, setWorking] = useState<AccessibleFormat | null>(null);
  const [error, setError] = useState('');
  const formats = useApiQuery('getFormats', { fileId }, { enabled: open && !!fileId });
  const request = useApiMutation('requestFormat');
  async function get(format: AccessibleFormat) {
    setWorking(format); setError('');
    try { await request.mutateAsync({ fileId, format }); }
    catch (cause) { setError(errorText(cause)); }
    finally { setWorking(null); }
  }
  return <section className={styles.formats}><h3>Accessible formats</h3><div ref={trigger}><Button aria-expanded={open} onClick={() => { if (open) { setOpen(false); requestAnimationFrame(() => trigger.current?.querySelector('button')?.focus()); } else setOpen(true); }}>{open ? 'Hide formats' : 'Show formats'}</Button></div>
    {open && <div ref={panel} tabIndex={-1} className={`${styles.stack} ${styles.focusPanel}`}>{formats.isPending ? <Loading label="Loading formats" /> : formats.error ? <ErrorNotice error={formats.error} onRetry={() => void formats.refetch()} /> : <><ul className={styles.list}>{choices.map(({ format, label }) => { const state = formats.data?.find(item => item.format === format); return <li key={format}>{state?.state === 'ready' ? <a href={contentUrl(fileId, format)} download>Download {label}</a> : <Button density="compact" disabled={working !== null} onClick={() => void get(format)}>Get {label}</Button>}{working === format && <span role="status"> Generating {label}{format === 'audio' || format === 'ocr' ? ' — this may take a minute or two' : ''}…</span>}{state?.state === 'generating' && working !== format && <span> Generating…</span>}</li>; })}</ul>{kind === 'pdf' && <p>For a scanned PDF, the reading version, e-book, and audio use OCR text.</p>}</>}{error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}</div>}
  </section>;
}
