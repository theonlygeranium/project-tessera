import { useRef, useState } from 'react';
import type { ActivityKind, TutorMessage, TutorSession } from '../../../../shared/domain';
import { AiContent, Button, FormField } from '../../components';
import { useApiMutation } from '../../data/hooks';
import { ErrorNotice, Loading } from '../../shell/Status';
import styles from './tutor.module.css';

const label = (message: TutorMessage, maxHints: number) => message.kind === 'hint' ? `Hint ${message.hintNumber} of ${maxHints}`
  : message.kind === 'explain' ? 'Explanation' : message.kind === 'answer' ? 'Answer'
  : message.kind === 'refusal' ? 'Tutor policy' : 'Conversation';

export function TutorPanel({ activityKind, activityId }: { activityKind: ActivityKind; activityId: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<TutorSession | null>(null);
  const [text, setText] = useState('');
  const [latest, setLatest] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const start = useApiMutation('startTutorSession');
  const send = useApiMutation('sendTutorMessage');
  const begin = () => {
    setError(null);
    void start.mutateAsync({ activityKind, activityId }).then(result => {
      setSession(result);
      requestAnimationFrame(() => (result.mode === 'off' ? regionRef : fieldRef).current?.focus());
    }).catch(e => setError(e));
  };
  const toggle = () => {
    if (open) { setOpen(false); buttonRef.current?.focus(); return; }
    setOpen(true); begin();
  };
  const submit = (intent: 'hint' | 'explain' | 'answer' | 'chat', question: string) => {
    if (!session || send.isPending) return;
    setError(null);
    void send.mutateAsync({ sessionId:session.id, intent, text:question }).then(result => {
      setSession(result.session); setText(''); setLatest(result.reply.text);
      requestAnimationFrame(() => fieldRef.current?.focus());
    }).catch(e => setError(e));
  };
  return <section className={styles.panel} aria-label="Tutor">
    <button type="button" className={styles.toggle} ref={buttonRef} aria-expanded={open} aria-controls={`tutor-${activityId}`} onClick={toggle}>Ask the tutor</button>
    {open && <div id={`tutor-${activityId}`} className={styles.stack} ref={regionRef} tabIndex={-1}>
      {start.isPending && <Loading label="Starting tutor" />}
      <ErrorNotice error={error} onRetry={!session ? begin : undefined} />
      {session && <>
        {session.mode === 'off' ? <p>{session.visibility.replace('. Your instructor sees','; your instructor sees')}</p> : <>
          <p>{session.visibility}</p>
          <p><strong>Mode: {session.mode[0].toUpperCase() + session.mode.slice(1)}</strong> · {session.hintsUsed} of {session.maxHints} hints used</p>
          <div className={styles.messages}>{session.messages.map(message => message.role === 'student'
            ? <p className={styles.student} key={message.id}><strong>You:</strong> {message.text}</p>
            : <AiContent key={message.id} kind="chat" who="Tutor" source={[label(message,session.maxHints),...message.cites.map(c => c.name)].join(' · ')} cites={message.cites.map(c => c.name)}><p>{message.text}</p></AiContent>)}</div>
          <div className={styles.actions}>
            <Button disabled={send.isPending} onClick={() => submit('hint','Please give me a hint.')}>Give me a hint</Button>
            <Button disabled={send.isPending} onClick={() => submit('explain','Please explain the idea.')}>Explain the idea</Button>
            <Button disabled={send.isPending} onClick={() => submit('answer','Please show me the answer.')}>Show me the answer</Button>
          </div>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); submit('chat',text); }}>
            <FormField label="Your message">{props => <input {...props} ref={fieldRef} type="text" value={text} maxLength={2000} onChange={event => setText(event.target.value)} />}</FormField>
            <Button type="submit" variant="primary" disabled={send.isPending || !text.trim()}>Send</Button>
          </form>
          <div className={styles.srOnly} aria-live="polite" aria-atomic="true">{latest}</div>
        </>}
      </>}
    </div>}
  </section>;
}
