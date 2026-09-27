import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { AccessIssue, AccessPolicy, AccessReport, AccessSeverity, FileRecord } from '../../../../shared/domain';
import { Button, DataTable, FormField, Select, StatusChip, StatusNotice, TextInput, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { useSession } from '../../shell/session';
import { usePageTitle } from '../../shell/usePageTitle';
import { AccessibleFormats } from './AccessibleFormats';
import { Suggestion } from './Suggestion';
import { UploadFile } from './UploadFile';
import {contentUrl, scoreText, severities, severityTone, sizeText} from './utils';
import { errorText } from './errors';
import styles from './access.module.css';

function Summary({ summary }: { summary: { score: number; grade: string; bySeverity: Record<AccessSeverity, number> } }) {
  return <div className={styles.summary}><p className={styles.score}>{scoreText(summary)} accessibility score</p><ul className={styles.counts}>{severities.map(severity => <li key={severity}><StatusChip tone={severityTone(severity)}>{severity}</StatusChip> {summary.bySeverity[severity]}</li>)}</ul></div>;
}
function Trend({ rows }: { rows: { at: string; score: number; issueCount: number }[] }) {
  return <DataTable caption="Accessibility trend" density="compact" rows={rows} rowKey={row => row.at} empty="No trend yet." columns={[{ key: 'at', header: 'Date', render: row => new Date(row.at).toLocaleDateString() }, { key: 'score', header: 'Score', render: row => `${row.score} out of 100` }, { key: 'issueCount', header: 'Issues' }]} />;
}
function Issues({ issues }: { issues: { code: string; title: string; count: number; wcag: AccessIssue['wcag'] }[] }) {
  return <DataTable caption="Top accessibility issues" density="compact" rows={issues} rowKey={row => row.code} empty="No issues found." columns={[{ key: 'title', header: 'Issue' }, { key: 'wcag', header: 'WCAG', render: row => `${row.wcag.sc} ${row.wcag.title}` }, { key: 'count', header: 'Count' }]} />;
}
export function CourseAccessPage() {
  const { courseId = '' } = useParams();
  const report = useApiQuery('getCourseAccess', { courseId }, { enabled: !!courseId });
  usePageTitle('Course accessibility');
  return <div className={styles.page}><TopBar title="Course accessibility" breadcrumbs={[{ label: 'Course', href: paths.teach.course(courseId) }, { label: 'Accessibility' }]} renderLink={renderRouterLink} actions={<Link to={paths.teach.files(courseId)}>File library</Link>} />
    {report.isPending ? <Loading label="Loading course accessibility" /> : report.error ? <ErrorNotice error={report.error} onRetry={() => void report.refetch()} /> : report.data && <>
      <section><h2>Overview</h2><Summary summary={report.data.summary} /></section>
      <section><h2>Lessons</h2><DataTable caption="Lessons ranked by accessibility score" density="compact" rows={[...report.data.lessons].sort((a,b) => (a.summary?.score ?? 101) - (b.summary?.score ?? 101))} rowKey={row => row.lessonId} columns={[{ key: 'title', header: 'Lesson', render: row => <Link to={paths.teach.lesson(courseId, row.lessonId)}>{row.title}</Link> }, { key: 'status', header: 'Status' }, { key: 'score', header: 'Accessibility', render: row => scoreText(row.summary) }]} /></section>
      <section><h2>Files</h2><DataTable caption="Files ranked by accessibility score" density="compact" rows={[...report.data.files].sort((a,b) => (a.summary?.score ?? 101) - (b.summary?.score ?? 101))} rowKey={row => row.fileId} columns={[{ key: 'name', header: 'File', render: row => <Link to={paths.teach.file(courseId, row.fileId)}>{row.name}</Link> }, { key: 'kind', header: 'Type' }, { key: 'score', header: 'Accessibility', render: row => scoreText(row.summary) }]} /></section>
      <section><h2>Top issues</h2><Issues issues={report.data.topIssues} /></section><section><h2>Trend</h2><Trend rows={report.data.trend} /></section>
    </>}
  </div>;
}
export function FileLibraryPage() {
  const { courseId = '' } = useParams();
  const files = useApiQuery('listFiles', { courseId, limit: 200 }, { enabled: !!courseId });
  const scan = useApiMutation('scanFile'); const remove = useApiMutation('deleteFile');
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  usePageTitle('File library');
  async function run(task: () => Promise<unknown>, success: string) { try { setError(''); await task(); setMessage(success); } catch (cause) { setError(errorText(cause)); } }
  return <div className={styles.page}><TopBar title="File library" breadcrumbs={[{ label: 'Course', href: paths.teach.course(courseId) }, { label: 'Files' }]} renderLink={renderRouterLink} actions={<Link to={paths.teach.access(courseId)}>Course accessibility</Link>} />
    {message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}{error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
    <section><h2>Upload a file</h2><UploadFile courseId={courseId} onUploaded={file => setMessage(`${file.name} uploaded.`)} /></section>
    <section><h2>Course files</h2>{files.isPending ? <Loading label="Loading files" /> : files.error ? <ErrorNotice error={files.error} onRetry={() => void files.refetch()} /> : <DataTable caption="Course files" density="compact" rows={files.data?.items ?? []} rowKey={row => row.id} empty="No files yet." columns={[{ key: 'name', header: 'Name', render: row => <Link to={paths.teach.file(courseId, row.id)}>{row.name}</Link> }, { key: 'kind', header: 'Type', render: row => row.kind.toUpperCase() }, { key: 'size', header: 'Size', render: row => sizeText(row.size) }, { key: 'uploadedAt', header: 'Uploaded', render: row => new Date(row.uploadedAt).toLocaleDateString() }, { key: 'scan', header: 'Accessibility', render: row => scoreText(row.scan) }, { key: 'actions', header: 'Actions', render: row => <div className={styles.row}><Button density="compact" disabled={scan.isPending} onClick={() => void run(() => scan.mutateAsync({ fileId: row.id }), `${row.name} scanned.`)}>Scan</Button><Button density="compact" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${row.name}?`)) void run(() => remove.mutateAsync({ fileId: row.id }), `${row.name} deleted.`); }}>Delete</Button></div> }]} />}</section>
  </div>;
}

function FileIssue({ issue, index, report, file, onFixed }: { issue: AccessIssue; index: number; report: AccessReport; file: FileRecord; onFixed: () => void }) {
  const fix = useApiMutation('fixFileIssue');
  const [error, setError] = useState(''); const [title, setTitle] = useState(file.name.replace(/\.[^.]+$/, '')); const [language, setLanguage] = useState('en');
  const [element, setElement] = useState(issue.location.element ?? 0); const [alt, setAlt] = useState(''); const [editingAlt, setEditingAlt] = useState(false);
  const images = report.document?.images ?? 0;
  async function apply(value: Parameters<typeof fix.mutateAsync>[0]['fix']) { try { setError(''); await fix.mutateAsync({ fileId: file.id, issueIndex: index, fix: value }); onFixed(); } catch (cause) { setError(errorText(cause)); throw cause; } }
  const location = [issue.location.label, issue.location.page ? `page ${issue.location.page}` : null, issue.location.element !== undefined ? `image ${issue.location.element + 1}` : null].filter(Boolean).join(' · ');
  return <li className={styles.issue}><h3>{issue.title}</h3><p><StatusChip tone={severityTone(issue.severity)}>{issue.severity}</StatusChip> · WCAG {issue.wcag.sc} {issue.wcag.title}{location ? ` · ${location}` : ''}</p><p>{issue.description}</p>
    {issue.fix === 'alt-text' && <><FormField label={`Image element for ${issue.title}`} hint={`Choose image 1 through ${images}.`}>{control => <Select {...control} value={element} onChange={event => setElement(Number(event.target.value))}>{Array.from({ length: images }, (_, n) => <option key={n} value={n}>Image {n + 1}</option>)}</Select>}</FormField><Suggestion key={element} target={{ fileId: file.id, element }} kind="alt-text" onUse={text => apply({ kind: 'alt-text', element, alt: text, decorative: false })} onEdit={text => { setAlt(text); setEditingAlt(true); }} onDecorative={() => apply({ kind: 'alt-text', element, alt: '', decorative: true })} />{editingAlt && <form className={styles.stack} onSubmit={event => { event.preventDefault(); void apply({ kind: 'alt-text', element, alt, decorative: false }).then(() => setEditingAlt(false)).catch(() => undefined); }}><FormField label="Edit alt text" required>{control => <TextInput {...control} value={alt} onChange={event => setAlt(event.target.value)} />}</FormField><Button density="compact" type="submit" disabled={fix.isPending}>Save alt text</Button></form>}</>}
    {issue.fix === 'table-header' && <Button density="compact" disabled={fix.isPending} onClick={() => void apply({ kind: 'table-header', element: issue.location.element ?? 0 }).catch(() => undefined)}>Mark first row as header</Button>}
    {issue.fix === 'metadata' && <form className={styles.stack} onSubmit={event => { event.preventDefault(); void apply({ kind: 'metadata', title, language }).catch(() => undefined); }}><FormField label="Document title">{control => <TextInput {...control} value={title} onChange={event => setTitle(event.target.value)} />}</FormField><FormField label="Language">{control => <Select {...control} value={language} onChange={event => setLanguage(event.target.value)}><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="zh">Chinese</option><option value="ar">Arabic</option></Select>}</FormField><Button type="submit" density="compact" disabled={fix.isPending}>Save metadata</Button></form>}
    {(issue.fix === 'manual' || issue.fix === 'captions' || issue.fix === 'rewrite' || issue.fix === 'link-text') && <p>{issue.fixHint}</p>}
    {error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
  </li>;
}
export function FileRemediationPage() {
  const { courseId = '', fileId = '' } = useParams();
  const file = useApiQuery('getFile', { fileId }, { enabled: !!fileId });
  const report = useApiQuery('getFileAccess', { fileId }, { enabled: !!fileId });
  const scan = useApiMutation('scanFile'); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [initial, setInitial] = useState<number | null>(null); const [fixed, setFixed] = useState(0); const progressRef = useRef<HTMLParagraphElement>(null);
  usePageTitle(file.data?.name ?? 'File accessibility');
  useEffect(() => { if (initial === null && report.data) setInitial(report.data.issueCount); }, [report.data, initial]);
  useEffect(() => { setInitial(null); setFixed(0); }, [fileId]);
  const onFixed = () => { setFixed(n => n + 1); setMessage('Fix saved as a new version. Report refreshed.'); requestAnimationFrame(() => progressRef.current?.focus()); };
  return <div className={styles.page}><TopBar title={file.data?.name ?? 'File accessibility'} breadcrumbs={[{ label: 'Files', href: paths.teach.files(courseId) }, { label: file.data?.name ?? 'File' }]} renderLink={renderRouterLink} />
    {file.isPending ? <Loading label="Loading file" /> : file.error ? <ErrorNotice error={file.error} onRetry={() => void file.refetch()} /> : file.data && <>
      <section><h2>File details</h2><p>{file.data.kind.toUpperCase()} · {sizeText(file.data.size)} · Version {file.data.version} · Uploaded {new Date(file.data.uploadedAt).toLocaleDateString()}</p><a href={contentUrl(fileId)} download>Download original file</a></section>
      {message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}{error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
      <section><h2>Accessibility report</h2><Button density="compact" disabled={scan.isPending} onClick={() => { setError(''); scan.mutate({ fileId }, { onSuccess: () => setMessage('Scan complete.'), onError: cause => setError(errorText(cause)) }); }}>Scan file again</Button>
        {report.isPending ? <Loading label="Loading scan report" /> : report.error ? <ErrorNotice error={report.error} onRetry={() => void report.refetch()} /> : report.data && <><Summary summary={report.data} /><p ref={progressRef} role="status" tabIndex={-1}>{fixed} of {initial ?? report.data.issueCount} fixed this visit</p><p>Report for version {report.data.target.kind === 'file' ? report.data.target.version : file.data.version}</p>{report.data.document && <p>{report.data.document.pages} pages or slides · {report.data.document.images} images · {report.data.document.hasText ? 'Text available' : 'No extractable text'}</p>}
          {report.data.issues.length ? <ol className={styles.issues}>{report.data.issues.map((issue, index) => <FileIssue key={`${issue.code}-${index}-${report.data.target.kind === 'file' ? report.data.target.version : 0}`} issue={issue} index={index} report={report.data} file={file.data} onFixed={onFixed} />)}</ol> : <p>No accessibility issues found.</p>}</>}
      </section><AccessibleFormats fileId={fileId} />
    </>}
  </div>;
}
export function InstitutionAccessPage() {
  const { institution } = useSession();
  const report = useApiQuery('getInstitutionAccess', undefined);
  const exporting = useApiMutation('exportInstitutionAccess'); const update = useApiMutation('updateAccessPolicy');
  const [policy, setPolicy] = useState<AccessPolicy>(institution.accessPolicy); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  usePageTitle('Institution accessibility');
  async function download() { try { setError(''); const { csv } = await exporting.mutateAsync(undefined); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'institution-accessibility.csv'; link.click(); URL.revokeObjectURL(url); setMessage('CSV downloaded.'); } catch (cause) { setError(errorText(cause)); } }
  async function savePolicy() { try { setError(''); await update.mutateAsync(policy); setMessage('Accessibility policy saved.'); } catch (cause) { setError(errorText(cause)); } }
  return <div className={styles.page}><TopBar title="Institution accessibility" />
    {message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}{error && <StatusNotice tone="error" live="assertive">{error}</StatusNotice>}
    {report.isPending ? <Loading label="Loading institution accessibility" /> : report.error ? <ErrorNotice error={report.error} onRetry={() => void report.refetch()} /> : report.data && <><section><h2>Overview</h2><Summary summary={report.data.summary} /><Button density="compact" disabled={exporting.isPending} onClick={() => void download()}>Download CSV</Button></section>
      <section><h2>Courses</h2><DataTable caption="Courses ranked by accessibility score" density="compact" rows={[...report.data.courses].sort((a,b) => (a.summary?.score ?? 101) - (b.summary?.score ?? 101))} rowKey={row => row.courseId} columns={[{ key: 'code', header: 'Code' }, { key: 'title', header: 'Course', render: row => <Link to={paths.admin.course(row.courseId)}>{row.title}</Link> }, { key: 'instructorNames', header: 'Instructors', render: row => row.instructorNames.join(', ') || 'None assigned' }, { key: 'summary', header: 'Accessibility', render: row => scoreText(row.summary) }]} /></section><section><h2>Top issues</h2><Issues issues={report.data.topIssues} /></section><section><h2>Trend</h2><Trend rows={report.data.trend} /></section>
    </>}
    <section><h2>Publishing policy</h2><p>Publishing is blocked below the minimum score or when a lesson has an issue at a checked severity.</p><form className={styles.stack} onSubmit={event => { event.preventDefault(); void savePolicy(); }}><FormField label="Minimum score" required error={Number.isInteger(policy.minimumScore) && policy.minimumScore >= 0 && policy.minimumScore <= 100 ? undefined : 'Enter a whole number from 0 to 100.'}>{control => <TextInput {...control} type="number" min={0} max={100} step={1} value={policy.minimumScore} onChange={event => setPolicy({ ...policy, minimumScore: Number(event.target.value) })} />}</FormField><fieldset><legend>Blocking severities</legend><div className={styles.row}>{severities.map(severity => <label key={severity} className={styles.checkbox}><input type="checkbox" checked={policy.blockingSeverities.includes(severity)} onChange={event => setPolicy({ ...policy, blockingSeverities: event.target.checked ? [...policy.blockingSeverities, severity] : policy.blockingSeverities.filter(item => item !== severity) })} />{severity}</label>)}</div></fieldset><Button variant="primary" type="submit" disabled={update.isPending || !Number.isInteger(policy.minimumScore) || policy.minimumScore < 0 || policy.minimumScore > 100}>Save policy</Button></form></section>
  </div>;
}
