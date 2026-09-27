import { FormField, Select, TextArea, TextInput } from '../../../components';
import { LIMITS, minutesLabel, videoHasCaptionsOrTranscript, videoProviderFromUrl, videoUrlError, type VideoContent } from '../model';
import styles from './editors.module.css';

export function VideoEditor({ value, onChange }: { value: VideoContent; onChange: (value: VideoContent) => void }) {
  const upload = value.provider === 'upload';
  const access = videoHasCaptionsOrTranscript(value);
  const sourceOk = upload ? value.src.trim().length > 0 : value.src.trim().length > 0 && !videoUrlError(value.src, value.provider);
  const readiness = !access
    ? 'Add a transcript or a captions file before publishing.'
    : !sourceOk
      ? (upload ? 'Add a video file id before publishing.' : 'Add a YouTube or Vimeo URL before publishing.')
      : 'Ready to publish.';
  const setMinutes = (raw: string) => {
    if (raw.trim() === '') {
      onChange({ ...value, minutes: 0 });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > LIMITS.minutes) return;
    onChange({ ...value, minutes: parsed });
  };
  return <div className={styles.editor}>
    <FormField label="Title" required>{control => <TextInput {...control} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} />}</FormField>
    <FormField label="Provider">{control => <Select {...control} value={value.provider} onChange={e => onChange({ ...value, provider: e.target.value as VideoContent['provider'] })}>
      <option value="youtube">YouTube</option>
      <option value="vimeo">Vimeo</option>
      <option value="upload">Upload</option>
    </Select>}</FormField>
    <FormField
      label={upload ? 'Video file id' : 'Video URL'}
      required
      hint={upload ? 'The id of a video that has already been uploaded.' : 'Paste a YouTube or Vimeo link.'}
      error={videoUrlError(value.src, value.provider)}
    >{control => <TextInput {...control} type={upload ? 'text' : 'url'} value={value.src} onChange={e => {
      const src = e.target.value;
      const detected = videoProviderFromUrl(src.trim());
      onChange({ ...value, src, provider: detected ?? value.provider });
    }} />}</FormField>
    <FormField label="Captions file" hint="The id of a captions file. Leave this blank if you paste a transcript instead.">{control => <TextInput {...control} value={value.captionsFileId ?? ''} onChange={e => onChange({ ...value, captionsFileId: e.target.value.trim() ? e.target.value : null })} />}</FormField>
    <FormField label="Transcript" hint="The full spoken text. Required unless a captions file is set.">{control => <TextArea {...control} value={value.transcript} onChange={e => onChange({ ...value, transcript: e.target.value })} />}</FormField>
    <FormField label="Length in minutes" hint="Shown to students next to the video.">{control => <TextInput {...control} type="number" min={0} max={LIMITS.minutes} step={1} value={String(value.minutes)} onChange={e => setMinutes(e.target.value)} />}</FormField>
    <p className={styles.status} role="status">{minutesLabel(value.minutes)}. {readiness}</p>
  </div>;
}
