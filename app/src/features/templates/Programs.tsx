import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { AccentId, Brand } from '../../../../shared/domain';
import { ACCENTS } from '../../../../shared/policy';
import { Button, StatusNotice, TopBar } from '../../components';
import { useApiMutation, useApiQuery } from '../../data/hooks';
import { paths } from '../../paths';
import { renderRouterLink } from '../../shell/RouterLink';
import { ErrorNotice, Loading } from '../../shell/Status';
import { usePageTitle } from '../../shell/usePageTitle';
import styles from './Templates.module.css';

export function ProgramFields({ name, description, templateId, brand, templates, onName, onDescription, onTemplate, onBrand }: {
  name: string; description: string; templateId: string; brand: Brand; templates: { id: string; name: string }[];
  onName: (value: string) => void; onDescription: (value: string) => void; onTemplate: (value: string) => void; onBrand: (value: Brand) => void;
}) {
  return <>
    <label className={styles.field}>Name<input required value={name} onChange={e => onName(e.target.value)} /></label>
    <label className={styles.field}>Description<textarea value={description} onChange={e => onDescription(e.target.value)} /></label>
    <label className={styles.field}>Template<select value={templateId} onChange={e => onTemplate(e.target.value)}><option value="">Institution template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <fieldset className={styles.swatches}><legend>Brand accent</legend>
      <label><input type="radio" name="program-accent" checked={brand.accent === null} onChange={() => onBrand({ accent: null, logo: null })} />Institution accent</label>
      {ACCENTS.map(option => <label key={option.id}><input type="radio" name="program-accent" checked={brand.accent === option.id} onChange={() => onBrand({ accent: option.id as AccentId, logo: null })} /><span className={styles.swatch} style={{ '--swatch': `var(--accent-option-${option.id})` } as React.CSSProperties} aria-hidden="true" />{option.label}</label>)}
    </fieldset>
  </>;
}

export function ProgramsPage() {
  usePageTitle('Programs');
  const navigate = useNavigate();
  const programs = useApiQuery('listPrograms', undefined), templates = useApiQuery('listTemplates', undefined), courses = useApiQuery('listCourses', undefined);
  const create = useApiMutation('createProgram');
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [templateId, setTemplateId] = useState('');
  const [brand, setBrand] = useState<Brand>({ accent: null, logo: null }), [error, setError] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); create.mutate({ name, description, templateId: templateId || null, brand }, { onSuccess: p => navigate(paths.admin.program(p.id)), onError: x => setError(x.message) }); };
  return <div className={styles.page}><TopBar title="Programs" />
    <section className={styles.section}><h2>Programs</h2>{programs.isPending || courses.isPending ? <Loading /> : programs.error || courses.error ? <ErrorNotice error={programs.error ?? courses.error} /> : <ul className={styles.list}>{programs.data?.map(p => <li key={p.id}><Link to={paths.admin.program(p.id)}>{p.name}</Link> · {courses.data?.filter(c => c.programId === p.id).length ?? 0} courses</li>)}{programs.data?.length === 0 && <li>No programs yet.</li>}</ul>}</section>
    <section className={styles.section}><h2>Create program</h2>{templates.isPending ? <Loading /> : templates.error ? <ErrorNotice error={templates.error} /> : <form className={styles.form} onSubmit={submit}>{error && <StatusNotice tone="error">{error}</StatusNotice>}<ProgramFields name={name} description={description} templateId={templateId} brand={brand} templates={templates.data ?? []} onName={setName} onDescription={setDescription} onTemplate={setTemplateId} onBrand={setBrand} /><div className={styles.actions}><Button type="submit" variant="primary" disabled={create.isPending}>Create program</Button></div></form>}</section>
  </div>;
}

export function ProgramPage() {
  const { programId = '' } = useParams(); usePageTitle('Program');
  const navigate = useNavigate(), programs = useApiQuery('listPrograms', undefined), templates = useApiQuery('listTemplates', undefined), courses = useApiQuery('listCourses', undefined);
  const update = useApiMutation('updateProgram'), remove = useApiMutation('deleteProgram');
  const program = programs.data?.find(p => p.id === programId);
  const [draft, setDraft] = useState<{ id: string; name: string; description: string; templateId: string; brand: Brand } | null>(null);
  const value = draft?.id === programId ? draft : program ? { id: program.id, name: program.name, description: program.description, templateId: program.templateId ?? '', brand: program.brand } : null;
  const edit = (patch: Partial<NonNullable<typeof value>>) => { if (value) setDraft({ ...value, ...patch }); };
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const count = courses.data?.filter(c => c.programId === programId).length ?? 0;
  return <div className={styles.page}><TopBar title={program?.name ?? 'Program'} breadcrumbs={[{ label: 'Programs', href: paths.admin.programs }, { label: program?.name ?? 'Program' }]} renderLink={renderRouterLink} />
    {programs.isPending || templates.isPending || courses.isPending ? <Loading /> : programs.error || templates.error || courses.error ? <ErrorNotice error={programs.error ?? templates.error ?? courses.error} /> : !program || !value ? <StatusNotice tone="error">Program not found.</StatusNotice> : <section className={styles.section}><h2>Edit program</h2><p className={styles.muted}>{count} courses</p>{message && <StatusNotice tone="success" live="polite">{message}</StatusNotice>}{error && <StatusNotice tone="error">{error}</StatusNotice>}
      <form className={styles.form} onSubmit={e => { e.preventDefault(); setError(''); update.mutate({ programId, name: value.name, description: value.description, templateId: value.templateId || null, brand: value.brand }, { onSuccess: () => { setDraft(null); setMessage('Program saved.'); }, onError: x => setError(x.message) }); }}><ProgramFields name={value.name} description={value.description} templateId={value.templateId} brand={value.brand} templates={templates.data ?? []} onName={name => edit({ name })} onDescription={description => edit({ description })} onTemplate={templateId => edit({ templateId })} onBrand={brand => edit({ brand })} /><div className={styles.actions}><Button type="submit" variant="primary" disabled={update.isPending}>Save program</Button></div></form>
      <div><Button onClick={() => { if (!window.confirm(`Delete program “${program.name}”?`)) return; setError(''); remove.mutate({ programId }, { onSuccess: () => navigate(paths.admin.programs), onError: x => setError(x.message) }); }} disabled={remove.isPending}>Delete program</Button></div>
    </section>}
  </div>;
}
