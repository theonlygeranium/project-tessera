import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AiContent, Button, FormField, StatusNotice, TextArea, TopBar } from '../../components';
import { dataMode } from '../../data/client';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { UploadFile } from '../access/UploadFile';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import { useSession } from '../../shell/session';
import { DesignStepper } from './Stepper';
import { TeachingPreferences } from './TeachingPreferences';
import styles from './Design.module.css';

export function DesignStart() {
  usePageTitle('Start from a syllabus');
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { institution } = useSession();
  const designAllowed = institution.policy.aiAuthoring && (institution.policy.designPartner?.enabled ?? true);
  const course = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const files = useApiQuery('listFiles', { courseId, limit: 200 }, { enabled: !!courseId });
  const create = useApiMutation('createDesignSession');
  const [choice, setChoice] = useState('sample');
  const [text, setText] = useState('');
  const [sourceKind, setSourceKind] = useState<'syllabus' | 'brief'>('syllabus');
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [created, setCreated] = useState('');
  const [localError, setLocalError] = useState('');
  const progress = useApiQuery('advanceDesignSession', { sessionId: created }, { enabled: !!created, refetchInterval: created ? 1200 : false });
  useEffect(() => { if (progress.data?.stage === 'read') navigate(paths.teach.designSession(courseId, progress.data.id)); }, [progress.data?.stage, progress.data?.id, courseId, navigate]);
  const available = files.data?.items.filter(file => file.kind === 'pdf' || file.kind === 'docx') ?? [];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent) { setLocalError('Please confirm that I may read this source.'); return; }
    if (choice === 'paste' && !text.trim()) { setLocalError('Paste the syllabus or brief text first.'); return; }
    setLocalError('');
    try {
      const result = await create.mutateAsync({ courseId, sourceKind: choice === 'paste' ? sourceKind : 'syllabus', ...(choice === 'sample' ? { sample: true as const } : choice === 'paste' ? { text, name: sourceKind === 'brief' ? 'Pasted training brief' : 'Pasted syllabus' } : { fileId: choice }), consent: { syllabusOnly: true, rememberProfile: remember } });
      setCreated(result.id);
    } catch { /* Mutation error is rendered below. */ }
  };
  const found = progress.data?.extraction;
  const done = progress.data?.provisioning?.done ?? 0, total = progress.data?.provisioning?.total ?? 2;
  const percent = Math.round(done / Math.max(total, 1) * 100);
  return <div className={styles.page}>
    <TopBar title="Start from a syllabus" breadcrumbs={[{ label: 'My courses', href: paths.teach.courses }, { label: course.data?.course.title ?? 'Course', href: paths.teach.course(courseId) }, { label: 'Start from a syllabus' }]} renderLink={renderRouterLink} />
    <DesignStepper stage="start" />
    <p><Link to={paths.teach.build(courseId)}>Start from a prompt instead</Link></p>
    {course.isPending ? <Loading label="Loading course" /> : course.error ? <ErrorNotice error={course.error} onRetry={() => void course.refetch()} /> : <div className={styles.stack}>
      <form onSubmit={event => void submit(event)} className={styles.columns}>
      <main className={styles.stack}>
        <h2>Start from a syllabus</h2>
        <p className={styles.intro}>Upload your syllabus and I'll read it the way an instructional designer would: what it asks students to be able to do, how that is assessed, how the term is paced. Then I'll ask what I can't tell from the document, and only after that propose ways to structure the course. Nothing reaches students until you keep the drafts and publish.</p>
        <section className={`${styles.card} ${styles.uploadCard}`} aria-labelledby="upload-heading"><h2 id="upload-heading">Drop a syllabus here, or choose a file</h2><p>PDF or DOCX · up to 25 MB · scanned PDFs are read with OCR first · one syllabus per course</p>
          {dataMode === 'mock' ? <StatusNotice tone="info">Uploads aren't available in demo mode. Use the sample syllabus or paste the text.</StatusNotice> : <UploadFile courseId={courseId} visibility="staff" accept=".pdf,.docx" hint="PDF or DOCX, up to 25 MB. Only staff can see this source until you share it." onUploaded={file => setChoice(file.id)} />}
        </section>
      <section className={styles.card} aria-labelledby="choose-heading"><h2 id="choose-heading">Or use a file already in this course</h2>
            {files.isPending ? <Loading label="Loading files" /> : files.error ? <ErrorNotice error={files.error} onRetry={() => void files.refetch()} /> : <div className={styles.sourceList}>
              {available.map(file => <label key={file.id} className={styles.choice}><input type="radio" name="source" value={file.id} checked={choice === file.id} onChange={() => setChoice(file.id)} />{file.name} · {file.kind.toUpperCase()}</label>)}
              <label className={styles.choice}><input type="radio" name="source" value="sample" checked={choice === 'sample'} onChange={() => setChoice('sample')} />Sample syllabus (fictional): STAT110_Syllabus_Fall2026.pdf</label>
              <label className={styles.choice}><input type="radio" name="source" value="paste" checked={choice === 'paste'} onChange={() => setChoice('paste')} />Paste text instead</label>
            </div>}
            {choice === 'paste' && <><fieldset><legend>What kind of source is this?</legend><label className={styles.check}><input type="radio" name="source-kind" checked={sourceKind === 'syllabus'} onChange={() => setSourceKind('syllabus')} />Syllabus</label><label className={styles.check}><input type="radio" name="source-kind" checked={sourceKind === 'brief'} onChange={() => setSourceKind('brief')} />Training brief or competency list</label></fieldset><FormField label="Paste syllabus or brief text" required>{control => <TextArea {...control} rows={9} value={text} onChange={event => setText(event.target.value)} />}</FormField></>}
          </section></main>
          <aside className={styles.stack} aria-label="How we work together">
            <AiContent kind="note" who="Design partner" source="before reading anything"><p>You are the subject-matter expert and the instructor of record. I handle sequencing, alignment, scaffolding and quality checks, and I show you the evidence behind every suggestion. I won't propose a structure until you've confirmed what I understood.</p></AiContent>
            <section className={styles.card} aria-labelledby="scope-heading"><h2 id="scope-heading">What I'll use, and what I won't</h2><ul>
              <li><strong>Only this syllabus.</strong> No rosters, grades or student work. Recognizable roster rows and lines pairing a student name with an ID or student email are removed before analysis.</li>
              <li><strong>Yours.</strong> The syllabus and everything drafted from it belong to you. Nothing is used to train a model.</li>
              <li><strong>Cited.</strong> Every claim I make points to the page it came from. Readings come only from your syllabus; where one is missing I leave a placeholder, never an invented citation.</li>
              <li><strong>Drafts only.</strong> I write nothing to the course until you approve a preview, and one action undoes everything I added.</li>
            </ul>
            <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />I understand. Read this syllabus and show me what you found before proposing anything.</label>
            <label className={styles.check}><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Remember my teaching preferences for future courses (you can edit or clear them any time).</label>
            <a href="#teaching-preferences">Edit your teaching preferences</a>
            <Button type="submit" variant="primary" disabled={!consent || create.isPending || !!created || !designAllowed}>Read my syllabus</Button>
          </section>
          <section className={styles.card}><p><strong>{institution.name} {designAllowed ? 'allows' : 'has turned off'} Start from a syllabus</strong> for this program. Model: Palmyra-X6 via Tessera's gateway. Set by your administrator.</p></section>
          {localError && <StatusNotice tone="error">{localError}</StatusNotice>}
          {create.error && <StatusNotice tone="error">{create.error.message}</StatusNotice>}
          {progress.data?.provisioning?.error && <StatusNotice tone="error">{progress.data.provisioning.error}</StatusNotice>}
          </aside>
        </form>
        <TeachingPreferences />
        {created && <section className={styles.card} aria-label="Reading progress"><div className={styles.progress} role="status"><strong>Reading · {percent}%</strong><progress value={percent} max={100} aria-label="Reading the syllabus" /></div><ul>
          <li>Course profile{found ? ' · found' : ' · looking'}</li><li>Learning outcomes{found ? ` · ${found.outcomes.length} found` : ' · looking'}</li><li>Grading components{found ? ` · ${found.assessments.length} found` : ' · looking'}</li><li>Weekly schedule{found ? ` · ${found.schedule.length} rows found` : ' · looking'}</li><li>Policies{found ? ` · ${found.policies.length} found` : ' · looking'}</li>
        </ul></section>}
    </div>}
  </div>;
}
