import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FileRecord } from '../../../../shared/domain';
import { refusal } from './refusal';
import { Button, FormField, StatusNotice } from '../../components';
import { dataMode } from '../../data/client';
import { uploadUrl } from './utils';

export function UploadFile({ courseId, onUploaded, visibility = 'course', accept = '.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp,.vtt,.srt', hint = 'PDF, Word, PowerPoint, images, or captions (VTT, SRT); up to 25 MB. Word, PowerPoint, and PDF files get an accessibility scan.' }: { courseId: string; onUploaded?: (file: FileRecord) => void; visibility?: 'course' | 'staff'; accept?: string; hint?: string }) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (dataMode === 'mock') return <StatusNotice tone="info">File upload is unavailable in demo mode.</StatusNotice>;
  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) { setError('Choose a file first.'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('Files can be up to 25 MB.'); return; }
    const refused = refusal(file.name, accept);
    if (refused) { setError(refused); return; }
    setBusy(true); setError(''); setMessage(`Uploading ${file.name}…`);
    try {
      const body = new FormData(); body.set('file', file);
      const response = await fetch(`${uploadUrl(courseId)}?visibility=${visibility}`, { method: 'POST', credentials: 'include', body });
      const result = await response.json() as FileRecord | { error?: { message?: string } };
      if (!response.ok) throw new Error('error' in result ? result.error?.message || 'Upload failed.' : 'Upload failed.');
      const uploaded = result as FileRecord;
      await client.invalidateQueries();
      if (input.current) input.current.value = '';
      setMessage(`${uploaded.name} uploaded.`); onUploaded?.(uploaded);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); setMessage(''); }
    finally { setBusy(false); }
  }
  return <div><FormField label="Choose a file" hint={hint} error={error || undefined}>{control => <input {...control} ref={input} type="file" accept={accept} />}</FormField><Button disabled={busy} onClick={() => void upload()}>Upload file</Button>{message && <p role="status">{message}</p>}</div>;
}
