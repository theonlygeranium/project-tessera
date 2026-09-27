import { useEffect, useState } from 'react';
import type { ActivityKind, TutorMode } from '../../../../shared/domain';
import { TUTOR_MODES } from '../../../../shared/policy';
import { allowedModes, effectiveMode } from '../../../../shared/tutor/policy';
import { Button, FormField, StatusNotice, TextInput } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import styles from './tutor.module.css';

export function TutorSettingsPanel({ activityKind, activityId }: { activityKind: ActivityKind; activityId: string }) {
  const { institution } = useSession();
  const setting = useApiQuery('getTutorSetting',{ activityKind, activityId });
  const lesson = useApiQuery('getLesson',{ lessonId:activityId },{ enabled:activityKind === 'lesson' });
  const assignment = useApiQuery('getAssignment',{ assignmentId:activityId },{ enabled:activityKind === 'assignment' });
  const courseId = activityKind === 'lesson' ? lesson.data?.lesson.courseId : assignment.data?.courseId;
  const files = useApiQuery('listFiles',{ courseId:courseId ?? '', limit:200 },{ enabled:!!courseId && activityKind === 'lesson' });
  const save = useApiMutation('setTutorSetting');
  const [mode,setMode] = useState<TutorMode>('hints');
  const [maxHints,setMaxHints] = useState('2');
  const [sourceIds,setSourceIds] = useState<string[]>([]);
  const [message,setMessage] = useState('');
  const [error,setError] = useState<Error | null>(null);
  const sourceBlocks = activityKind === 'lesson' ? lesson.data?.blocks.filter(b => lesson.data.lesson.status === 'published' && (b.origin !== 'ai' || b.aiState === 'kept')) ?? [] : assignment.data?.instructions ?? [];
  const sourceFiles = activityKind === 'lesson' ? files.data?.items ?? [] : [];
  const sourceKey = [...sourceBlocks.map(b => b.id),...sourceFiles.map(f => f.id)].join('|');
  useEffect(() => {
    if (setting.isPending) return;
    setMode(effectiveMode(activityKind,institution.policy,setting.data ?? null));
    setMaxHints(String(setting.data?.maxHints ?? 2));
    setSourceIds(setting.data ? setting.data.allowedSourceIds : [...sourceBlocks.map(b => b.id),...sourceFiles.map(f => f.id)]);
  },[activityId,activityKind,setting.data?.setAt,setting.isPending,sourceKey]);
  const allowed = allowedModes(activityKind,institution.policy);
  const submit = () => {
    setError(null); setMessage('');
    void save.mutateAsync({ activityKind,activityId,mode,maxHints:Number(maxHints),allowedSourceIds:sourceIds }).then(() => setMessage('Tutor settings saved.')).catch(e => setError(e));
  };
  return <section className={styles.panel} aria-labelledby={`tutor-settings-${activityId}`}>
    <h2 id={`tutor-settings-${activityId}`}>Tutor settings</h2>
    {setting.isPending || (activityKind === 'lesson' ? lesson.isPending || files.isPending : assignment.isPending) ? <Loading label="Loading tutor settings" />
      : setting.error ? <ErrorNotice error={setting.error} onRetry={() => void setting.refetch()} />
      : activityKind === 'lesson' && lesson.error ? <ErrorNotice error={lesson.error} onRetry={() => void lesson.refetch()} />
      : activityKind === 'lesson' && files.error ? <ErrorNotice error={files.error} onRetry={() => void files.refetch()} />
      : activityKind === 'assignment' && assignment.error ? <ErrorNotice error={assignment.error} onRetry={() => void assignment.refetch()} />
      : <div className={styles.stack}>
        {!setting.data && <p>Current effective mode: {TUTOR_MODES.find(x => x.id === effectiveMode(activityKind,institution.policy,null))?.label}</p>}
        <fieldset><legend>Tutor mode</legend>{TUTOR_MODES.map(option => {
          const available = allowed.includes(option.id);
          const reason = option.id === 'open' && activityKind === 'assignment' ? "Open isn't allowed on graded work." : "Your administrator hasn't allowed this mode.";
          return <label key={option.id} className={styles.option}><input type="radio" name={`tutor-mode-${activityId}`} value={option.id} checked={mode === option.id} disabled={!available} onChange={() => setMode(option.id)} /><span><strong>{option.label}</strong> — {option.description}{!available && ` Unavailable: ${reason}`}</span></label>;
        })}</fieldset>
        <FormField label="Hints allowed (0–10)" error={error && (!Number.isInteger(Number(maxHints)) || Number(maxHints)<0 || Number(maxHints)>10) ? 'Enter a whole number from 0 to 10.' : undefined}>{props => <TextInput {...props} type="number" min={0} max={10} step={1} value={maxHints} onChange={event => setMaxHints(event.target.value)} />}</FormField>
        <fieldset><legend>Sources the tutor may use</legend>{sourceBlocks.length || sourceFiles.length ? <>{sourceBlocks.map((block,index) => <label key={block.id} className={styles.option}><input type="checkbox" checked={sourceIds.includes(block.id)} onChange={event => setSourceIds(event.target.checked ? [...sourceIds,block.id] : sourceIds.filter(id => id !== block.id))} /><span>Block {index+1}: {block.type === 'check' ? 'Knowledge check' : block.type}</span></label>)}{sourceFiles.map(file => <label key={file.id} className={styles.option}><input type="checkbox" checked={sourceIds.includes(file.id)} onChange={event => setSourceIds(event.target.checked ? [...sourceIds,file.id] : sourceIds.filter(id => id !== file.id))} /><span>Course file: {file.name} (name only)</span></label>)}</> : <p>No published activity blocks or course files are available yet.</p>}</fieldset>
        <Button variant="primary" disabled={save.isPending} onClick={submit}>Save tutor settings</Button>
        {message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}
        <ErrorNotice error={error} />
      </div>}
  </section>;
}
