// Syllabus evaluation (handoff/SYLLABUS-EVAL-RUBRIC.md): runs each syllabus through the real
// design-partner service (MemoryRepo, the Worker's document parser, the chosen AI) and scores the
// result against its answer key. Bundled and run by tools/syllabus_eval.mjs.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { checkDocument } from '../../worker/access/index';
import { designDocxSections } from '../../worker/access/office';
import { palmyraClient } from '../../worker/ai/palmyra';
import { fixtureAi, type AiClient } from '../../shared/ai';
import { MemoryRepo, service } from '../../shared/service/index';
import type { ServiceContext } from '../../shared/service/context';
import { seedData } from '../../shared/seed';
import type { DesignSession, FileRecord, SourceSpan } from '../../shared/domain';

interface Key {
  file: string; code: string; title: string; credits: number | null; termWeeks: number | null; termStart: string | null; termEnd: string | null;
  modality: string; modalityAcceptable?: string[]; instructor: { name: string; email: string } | null;
  outcomes: string[]; assessments: { title: string; weightPercent: number }[]; weightsSum: number;
  schedule: { week: number; label?: string; topic: string; keywords: string[]; empty: boolean; holidayOrBreak: boolean; span?: [number, number] }[];
  /** Another defensible reading of the weights (for example points against a different total). */
  assessmentsAlt?: { title: string; weightPercent: number }[];
  workloadHoursPerWeek: number | null;
}
type Check = { id: string; pass: boolean; detail: string };
interface RunResult { file: string; run: number; ok: boolean; seconds: number; stage: string; error: string | null; checks: Check[]; session?: DesignSession }

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dirs = (opt('dirs', 'tests/fixtures/syllabus,tests/fixtures/syllabus/private') ?? '').split(',').filter(Boolean);
const runs = Number(opt('runs', '1'));
const concurrency = Number(opt('concurrency', '4'));
const stages = Number(opt('stages', '2'));
const only = opt('only');
const aiName = opt('ai', process.env.WRITER_API_KEY ? 'palmyra' : 'fixture');
const out = opt('out', 'reports/syllabus-eval.json')!;
const keepSessions = args.includes('--keep');

// ---- text helpers -------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—‑]/g, '-').replace(/-\s+(?=[a-z])/g, '-').replace(/\s+/g, ' ').trim();
const loose = (s: string) => norm(s).replace(/[^a-z0-9%]+/g, ' ').trim();
function similarity(a: string, b: string): number {
  const ta = new Set(loose(a).split(' ').filter(Boolean)), tb = new Set(loose(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let both = 0; for (const t of ta) if (tb.has(t)) both++;
  return (2 * both) / (ta.size + tb.size);
}
function grounded(span: SourceSpan, source: DesignSession['source']): { found: boolean; pageOk: boolean | null } {
  const pieces = span.text.split(/\.\.\.|…/).map(loose).filter(p => p.length >= 12);
  if (!pieces.length) return { found: loose(span.text).length > 0 && loose(source.sections.map(s => [s.heading, ...s.lines].join(' ')).join(' ')).includes(loose(span.text)), pageOk: null };
  const all = loose(source.sections.map(s => [s.heading, ...s.lines].join(' ')).join(' '));
  const found = pieces.every(p => all.includes(p));
  if (span.page == null) return { found, pageOk: null };
  const page = loose(source.sections.filter(s => s.page === span.page).map(s => [s.heading, ...s.lines].join(' ')).join(' '));
  return { found, pageOk: pieces.every(p => page.includes(p)) };
}
function spansOf(session: DesignSession): SourceSpan[] {
  const ex = session.extraction; if (!ex) return [];
  const out: SourceSpan[] = [];
  for (const field of Object.values(ex.profile)) if (field && typeof field === 'object' && 'spans' in field) out.push(...(field.spans as SourceSpan[]));
  for (const o of ex.outcomes) if (o.span) out.push(o.span);
  for (const a of ex.assessments) if (a.span) out.push(a.span);
  for (const r of ex.schedule) if (r.span) out.push(r.span);
  for (const p of ex.policies) out.push(p.span);
  if (session.read) out.push(...session.read.cites);
  return out.filter(s => s && s.text);
}

// ---- scoring --------------------------------------------------------------------------------
function score(session: DesignSession, key: Key): Check[] {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  const ex = session.extraction;
  if (!ex) { add('E10', false, 'no extraction'); return checks; }
  const p = ex.profile;
  const code = String(p.code.value ?? '').replace(/\s+/g, '').toLowerCase();
  // A value the syllabus doesn't state may come back missing, or inferred (it becomes a question).
  const same = <T,>(field: { value: T | null; origin: string }, want: T | null) => want == null ? field.value == null || field.origin !== 'extracted' : field.value === want;
  add('E1', code === key.code.replace(/\s+/g, '').toLowerCase() && similarity(String(p.title.value ?? ''), key.title) >= 0.9 && same(p.credits, key.credits),
    `code ${p.code.value} / title ${p.title.value} / credits ${p.credits.value} (key ${key.code} / ${key.title} / ${key.credits})`);
  // Dates the syllabus implies but doesn't state may come back derived from the schedule.
  const alt = (field: { value: unknown }, ok?: string[]) => !!ok && ok.includes(String(field.value));
  const k2 = key as Key & { termStartAcceptable?: string[]; termEndAcceptable?: string[] };
  add('E2', same(p.termWeeks, key.termWeeks) && (same(p.termStart, key.termStart) || alt(p.termStart, k2.termStartAcceptable)) && (same(p.termEnd, key.termEnd) || alt(p.termEnd, k2.termEndAcceptable)),
    `weeks ${p.termWeeks.value} ${p.termStart.value}–${p.termEnd.value} (key ${key.termWeeks} ${key.termStart}–${key.termEnd})`);
  const instructor = p.instructor.value;
  const surname = (key.instructor?.name ?? '').replace(/,.*$/, '').trim().split(/\s+/).pop()?.toLowerCase() ?? '';
  add('E3', !key.instructor || (!!instructor && (!key.instructor.email || (instructor.email ?? '').toLowerCase() === key.instructor.email.toLowerCase()) && (instructor.name ?? '').toLowerCase().includes(surname)),
    `${instructor?.name ?? 'none'} <${instructor?.email ?? ''}> (key ${key.instructor?.name} <${key.instructor?.email}>)`);
  add('E4', [key.modality, ...(key.modalityAcceptable ?? [])].includes(String(p.modality.value)), `${p.modality.value} (key ${key.modality})`);
  const matched = key.outcomes.map(k => Math.max(0, ...ex.outcomes.map(o => similarity(o.text, k))));
  add('E5', ex.outcomes.length === key.outcomes.length && matched.every(m => m >= 0.9),
    `${ex.outcomes.length}/${key.outcomes.length} outcomes; weakest match ${Math.min(...matched).toFixed(2)}`);
  const titled = (a: string, b: string) => similarity(a, b) >= 0.5 || loose(b).startsWith(loose(a)) || loose(a).startsWith(loose(b));
  const missing = (want: { title: string; weightPercent: number }[]) => want.filter(k => !ex.assessments.some(a => a.weightPercent != null && Math.abs(a.weightPercent - k.weightPercent) <= 0.5 && titled(a.title, k.title)));
  const total = ex.assessments.reduce((n, a) => n + (a.weightPercent ?? 0), 0);
  const altOk = !!key.assessmentsAlt && !missing(key.assessmentsAlt).length && Math.abs(total - key.assessmentsAlt.reduce((n, a) => n + a.weightPercent, 0)) < 1;
  const missingWeights = altOk ? [] : missing(key.assessments);
  add('E6', altOk || (!missingWeights.length && Math.abs(total - key.weightsSum) < 1),
    `${ex.assessments.length}/${key.assessments.length} components, total ${total} (key ${key.weightsSum})${missingWeights.length ? `; missing ${missingWeights.map(m => `${m.title} ${m.weightPercent}%`).join(', ')}` : ''}`);
  for (const k of key.schedule) if (!k.span) { const m = /weeks?\s*(\d+)\s*(?:-|–|—|and|to)\s*(\d+)/i.exec(k.label ?? ''); if (m) k.span = [Number(m[1]), Number(m[2])]; }
  const rows = new Map(ex.schedule.map(r => [r.week, r]));
  // A row covering several weeks ("Weeks 4 and 5") may come back once, as its first week.
  const rowFor = (k: Key['schedule'][number]) => rows.get(k.week) ?? (k.span ? rows.get(k.span[0]) : undefined);
  const topicHits = key.schedule.filter(k => { const r = rowFor(k); if (!r) return false; if (k.holidayOrBreak && (r.empty || !r.topic.trim())) return true; return k.keywords.every(w => loose(`${r.topic} ${r.reading} ${r.due}`).includes(loose(w))); });
  const falseEmpty = key.schedule.filter(k => !k.empty && !k.holidayOrBreak && rowFor(k)?.empty);
  const pct = key.schedule.length ? topicHits.length / key.schedule.length : 1;
  // A holiday or break week with nothing in it may be left out.
  const distinctRows = new Set(key.schedule.filter(k => !(k.holidayOrBreak && !k.keywords.length)).map(k => k.span ? k.span.join('-') : String(k.week))).size;
  if ((key as Key & { scheduleArtifact?: string }).scheduleArtifact) { add('E7', true, `not scored: ${(key as Key & { scheduleArtifact?: string }).scheduleArtifact}`); } else
  add('E7', ex.schedule.length >= distinctRows && ex.schedule.length <= key.schedule.length + ((key as Key & { extraRows?: number }).extraRows ?? 0) && pct >= 0.9 && !falseEmpty.length,
    `${ex.schedule.length}/${key.schedule.length} rows; topics ${topicHits.length}/${key.schedule.length}${falseEmpty.length ? `; wrongly empty: weeks ${falseEmpty.map(k => k.week).join(', ')}` : ''}${pct < 1 ? `; missed weeks ${key.schedule.filter(k => !topicHits.includes(k)).map(k => k.week).join(', ')}` : ''}`);
  const spans = spansOf(session).map(s => ({ s, g: grounded(s, session.source) }));
  const found = spans.filter(x => x.g.found).length, pageBad = spans.filter(x => x.g.pageOk === false).length;
  const docxUnanchored = session.source.sections.every(s => s.page == null) ? spans.filter(x => !(x.s as SourceSpan & { section?: string }).section).length : 0;
  add('E8', spans.length > 0 && found / spans.length >= 0.95 && pageBad === 0 && docxUnanchored === 0,
    `${found}/${spans.length} spans found in the source; ${pageBad} on the wrong page${docxUnanchored ? `; ${docxUnanchored} DOCX spans without a section` : ''}${spans.filter(x => !x.g.found).slice(0, 2).map(x => `; e.g. "${x.s.text.slice(0, 60)}"`).join('')}`);
  const falseQs: string[] = [];
  for (const prob of ex.problems) {
    if (prob.code === 'weights-not-100' && Math.abs(key.weightsSum - 100) < 0.5) falseQs.push(prob.code);
    if (prob.code === 'empty-week' && !key.schedule.some(k => k.empty && prob.message.includes(`${k.week}`))) falseQs.push(`${prob.code}: ${prob.message.slice(0, 60)}`);
    if (prob.code === 'week-count-mismatch' && key.termWeeks && key.schedule.length === key.termWeeks) falseQs.push(prob.code);
    if (prob.code === 'due-outside-term') falseQs.push(`${prob.code}: ${prob.message.slice(0, 80)}`);
  }
  add('E9', !falseQs.length && session.questions.length <= 6, `${session.questions.length} questions; false: ${falseQs.join(' | ') || 'none'}`);
  add('E11', !/learning style/i.test(JSON.stringify(ex)), 'no "learning style"');
  if (session.read) {
    const r = session.read;
    add('R1', r.outcomeAudits.length === ex.outcomes.length, `${r.outcomeAudits.length} audits for ${ex.outcomes.length} outcomes`);
    const cites = r.cites.map(c => grounded(c, session.source));
    add('R2', /^here is what i understood/i.test(r.summary.trim()) && r.cites.length >= 3 && cites.every(c => c.found), `summary "${r.summary.slice(0, 50)}…"; ${cites.filter(c => c.found).length}/${r.cites.length} cites found`);
    const assessedOutcomes = new Set(r.alignment.filter(a => a.state !== 'none').map(a => a.outcomeId));
    add('R3', ex.outcomes.filter(o => assessedOutcomes.has(o.id)).length / Math.max(1, ex.outcomes.length) >= 0.9, `${assessedOutcomes.size}/${ex.outcomes.length} outcomes aligned`);
    const budget = (key.credits ?? 0) * 3;
    const avg = r.workload.averageHours;
    const stated = key.workloadHoursPerWeek;
    add('R4', (!key.credits || Math.abs(r.workload.weeklyBudgetHours - budget) < 0.5 || (stated != null && Math.abs(r.workload.weeklyBudgetHours - stated) < 0.5)) && r.workload.weeks.length === (key.termWeeks ?? r.workload.weeks.length),
      `budget ${r.workload.weeklyBudgetHours} h (credits×3 = ${budget}${stated != null ? `, stated ${stated}` : ''}); ${r.workload.weeks.length} weeks; average ${avg.toFixed(1)} h`);
    add('R6', !/learning style/i.test(JSON.stringify(r)) && !r.deficiencies.some(d => d.rubricRefs.some(x => x.rubric === 'qm')), 'no QM refs, no learning styles');
  }
  return checks;
}

// ---- running ---------------------------------------------------------------------------------
async function ai(): Promise<AiClient> {
  if (aiName === 'fixture') return fixtureAi;
  const key = process.env.WRITER_API_KEY; if (!key) throw new Error('WRITER_API_KEY is not set');
  return palmyraClient({ apiKey: key, url: process.env.AI_GATEWAY_URL ?? 'https://gateway.ai.cloudflare.com/v1/f69a6a0cad6e417b182bac1559292bf6/tessera/custom-writer/v1/chat/completions' });
}

async function runOne(path: string, key: Key, run: number, client: AiClient): Promise<RunResult> {
  const bytes = await readFile(path);
  const kind = path.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
  const repo = new MemoryRepo(seedData()); let n = 0;
  const file: FileRecord = { id: 'f-eval', courseId: 'c-stat110', name: basename(path), kind, mime: kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: bytes.length, key: 'eval', version: 1, uploadedBy: 'u-okafor', uploadedAt: new Date().toISOString(), scan: null };
  await repo.putFile(file);
  const documents = {
    extract: async () => { const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const check = await checkDocument(kind, buffer); return { sections: kind === 'docx' ? await designDocxSections(buffer) : check.text.sections, ocr: false }; },
    scan: async () => { throw new Error('not used'); }, fix: async () => { throw new Error('not used'); }, suggest: async () => { throw new Error('not used'); },
  } as unknown as ServiceContext['documents'];
  const ctx: ServiceContext = { repo, ai: client, user: await repo.getUser('u-okafor'), now: () => new Date().toISOString(), newId: prefix => `${prefix}-${++n}`, documents };
  const t0 = Date.now();
  let session = await service.createDesignSession(ctx, { courseId: 'c-stat110', sourceKind: 'syllabus', fileId: file.id, consent: { syllabusOnly: true, rememberProfile: false } });
  let extractedAt = 0;
  while (Date.now() - t0 < 600_000) {
    session = await service.advanceDesignSession(ctx, { sessionId: session.id });
    if (!extractedAt && session.extraction) extractedAt = Date.now();
    if (session.stage !== 'start' || session.provisioning?.error) break;
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  const error = session.provisioning?.error ?? null;
  const checks = score(session, key);
  const readStage = session.stage, readAt = Date.now();
  // Stage 3 (--stages 3): confirm the outcomes (or accept suggestions when there are none),
  // wait for the approaches, and score them.
  if (stages >= 3 && !error && session.stage === 'read' && session.extraction) {
    const t1 = Date.now();
    try {
      let outcomes = session.extraction.outcomes.map((o, i) => ({ code: `O${i + 1}`, text: o.text, originalText: o.text, source: 'syllabus' as const }));
      if (!outcomes.length) {
        const { suggestions } = await service.suggestDesignOutcomes(ctx, { sessionId: session.id });
        outcomes = suggestions.map((s, i) => ({ code: `O${i + 1}`, text: s.text, originalText: '', source: 'suggested' as const, suggestedText: s.text })) as never;
      }
      session = await service.confirmOutcomes(ctx, { sessionId: session.id, outcomes });
      while (Date.now() - t1 < 400_000 && !session.options && !session.provisioning?.error) session = await service.advanceDesignSession(ctx, { sessionId: session.id });
      const options = session.options ?? [];
      const confirmed = session.confirmedOutcomes ?? [];
      checks.push({ id: 'P1', pass: options.length === 3 && options.every(o => o.fits.some(f => f.span) && o.evidence.trim() && o.modules.length), detail: `${options.length} options (${options.map(o => o.id).join(', ')}) in ${Math.round((Date.now() - t1) / 1000)} s${session.provisioning?.error ? `; error: ${session.provisioning.error}` : ''}; cited: ${options.map(o => o.fits.filter(f => f.span).length).join('/')}` });
      const weekly = options.find(o => o.id === 'weekly');
      const rows = session.extraction.schedule.filter(r => !r.empty).length;
      const covered = options.every(o => confirmed.every(c => o.modules.some(m => m.outcomeIds.includes(c.code))));
      checks.push({ id: 'P2', pass: covered && (!weekly || !rows || weekly.modules.length === rows), detail: `${weekly ? `weekly ${weekly.modules.length} modules for ${rows} schedule rows; ` : 'no weekly option; '}every outcome in every option: ${covered}; modules ${options.map(o => o.modules.length).join('/')}` });
      if (options.length) session = await service.selectApproach(ctx, { sessionId: session.id, optionIds: [options[0].id], overlays: ['bookends'], rationale: 'Closest to how I already teach it.' });
    } catch (e) { checks.push({ id: 'P1', pass: false, detail: `stage 3 failed: ${String(e).slice(0, 200)}` }); }
  }
  // Stage 4 (--stages 4): preview the plan, apply it, let scaffolding finish, inspect the draft
  // course, then undo and check that everything the plan created is gone.
  if (stages >= 4 && session.stage === 'preview' && session.selection) {
    const t2 = Date.now();
    try {
      const before = { modules: (await repo.listModules('c-stat110')).length, outcomes: (await repo.listOutcomes('c-stat110')).length };
      // Answer the points the Preview asks for, as an instructor would (the key's weight when it has one).
      const unresolved = session.extraction!.assessments.filter(a => a.weightPercent === null);
      if (unresolved.length) session = await service.confirmDesignPoints(ctx, { sessionId: session.id, points: Object.fromEntries(unresolved.map(a => [a.id, Math.round(key.assessments.find(k => similarity(k.title, a.title) >= 0.5)?.weightPercent ?? 10)])) });
      const plan = await service.previewProvisionPlan(ctx, { sessionId: session.id });
      const components = session.extraction!.assessments.filter(a => (a.weightPercent ?? 0) > 0);
      const placed = components.filter(a => plan.modules.some(m => [...((m as { assignments?: { replaces: string | null }[] }).assignments ?? []), ...(m.assignment ? [m.assignment] : [])].some(item => item.replaces === a.title)));
      const readingsCited = plan.readings.every(r => r.span && r.span.text);
      checks.push({ id: 'P3', pass: plan.outcomes.length === (session.confirmedOutcomes ?? []).length && placed.length === components.length && readingsCited,
        detail: `${plan.modules.length} modules, ${plan.counts.lessons} lessons, ${plan.counts.assignments} assignments; outcomes ${plan.outcomes.length}/${(session.confirmedOutcomes ?? []).length}; graded components placed ${placed.length}/${components.length}; readings ${plan.readings.length} (all cited: ${readingsCited}); placeholders ${plan.placeholders}` });
      // P7: graded work lands where the syllabus puts it, not all in the last module.
      const graded = plan.modules.map(m => ({ m, items: [...((m as { assignments?: { replaces: string | null; points: number }[] }).assignments ?? []), ...(m.assignment ? [m.assignment] : [])].filter(a => a.replaces) }));
      const totalPoints = graded.reduce((n, g) => n + g.items.reduce((k, a) => k + a.points, 0), 0);
      const content = graded.filter(g => !/^(start here|wrap-up)$/i.test(g.m.title));
      const lastShare = totalPoints ? (content.at(-1)?.items.reduce((k, a) => k + a.points, 0) ?? 0) / totalPoints : 0;
      const recurring = components.filter(a => /\(\s*\d+\s*\)|\d+\s*@\s*\d+|weekly|each week|labs?\b|checkpoints|discussions|quizzes|homework/i.test(a.title));
      const split = recurring.filter(a => graded.flatMap(g => g.items).filter(i => i.replaces === a.title).length >= 2);
      checks.push({ id: 'P7', pass: lastShare <= 0.5 && split.length === recurring.length,
        detail: `last content module holds ${Math.round(lastShare * 100)}% of graded points; recurring components split ${split.length}/${recurring.length}; graded assignments ${graded.flatMap(g => g.items).length}` });
      session = await service.applyProvisionPlan(ctx, { sessionId: session.id, hash: plan.hash });
      // A failed lesson is recorded and the job goes on: poll until provisioning ends.
      while (Date.now() - t2 < 1_800_000 && session.stage === 'provisioning') session = await service.advanceDesignSession(ctx, { sessionId: session.id });
      const modules = (await repo.listModules('c-stat110')).length - before.modules;
      const lessons = await Promise.all(session.created.lessonIds.map(id => repo.getLesson(id)));
      const blocks = (await Promise.all(session.created.lessonIds.map(id => repo.listBlocks(id)))).flat();
      const readiness = await service.getCourseReadiness(ctx, { courseId: 'c-stat110' });
      const rubric = await repo.getRubric(readiness.rubricId);
      const itemFor = new Map((rubric?.standards ?? []).flatMap(st => st.items).filter(item => item.check).map(item => [item.check as string, item.id]));
      const statusOf = new Map(readiness.standards.flatMap(st => st.items).map(item => [item.itemId, item.status]));
      const mismatched = plan.readinessForecast.filter(f => { const id = itemFor.get(f.check); const status = id ? statusOf.get(id) : undefined; return status !== undefined && (status === 'met') !== (f.expected === 'met'); });
      const forecastOk = mismatched.length === 0;
      checks.push({ id: 'P4', pass: session.stage === 'review' && modules === plan.counts.modules && lessons.filter(Boolean).length === plan.counts.lessons && forecastOk,
        detail: `stage ${session.stage} in ${Math.round((Date.now() - t2) / 1000)} s${session.provisioning?.error ? ` (error: ${session.provisioning.error})` : ''}; modules ${modules}/${plan.counts.modules}; lessons ${lessons.filter(Boolean).length}/${plan.counts.lessons}; forecast matches readiness: ${forecastOk}${mismatched.length ? ` (${mismatched.map(f => f.check).join(', ')})` : ''}` });
      const texts = blocks.filter(b => b.type === 'text');
      const drafts = blocks.every(b => b.aiState === 'draft' || b.origin !== 'ai');
      const slots = texts.filter(b => /\[Your /.test((b as { text?: string }).text ?? '')).length;
      checks.push({ id: 'P6', pass: drafts && lessons.every(l => l?.status === 'draft') && slots === texts.length && blocks.length > 0,
        detail: `${blocks.length} blocks in ${lessons.length} lessons; all AI drafts: ${drafts}; text blocks with [Your …] slots ${slots}/${texts.length}; lessons all draft: ${lessons.every(l => l?.status === 'draft')}` });
      const undone = await service.undoProvisionPlan(ctx, { sessionId: session.id });
      const after = { modules: (await repo.listModules('c-stat110')).length, outcomes: (await repo.listOutcomes('c-stat110')).length };
      checks.push({ id: 'P5', pass: undone.kept.length === 0 && after.modules === before.modules && after.outcomes === before.outcomes,
        detail: `kept ${undone.kept.length}; modules back to ${after.modules}/${before.modules}; outcomes back to ${after.outcomes}/${before.outcomes}` });
    } catch (e) { checks.push({ id: 'P4', pass: false, detail: `stage 4 failed: ${String(e).slice(0, 200)}` }); }
  }

  checks.push({ id: 'E10', pass: !error && readStage === 'read' && seconds <= 180, detail: `${readStage} in ${seconds} s${extractedAt ? ` (extraction ${Math.round((extractedAt - t0) / 1000)} s, read ${Math.round((readAt - extractedAt) / 1000)} s)` : ''}${error ? `; error: ${error}` : ''}` });
  return { file: basename(path), run, ok: !error, seconds, stage: session.stage, error, checks, ...(keepSessions ? { session } : {}) };
}

const label = (file: string) => file.length <= 33 ? file : `${file.slice(0, 26)}….${file.split('.').pop()}`;

async function main() {
  const client = await ai();
  const jobs: { path: string; key: Key }[] = [];
  for (const dir of dirs) {
    let names: string[] = []; try { names = await readdir(dir); } catch { continue; }
    for (const name of names.filter(n => n.endsWith('.expected.json'))) {
      const key = JSON.parse(await readFile(join(dir, name), 'utf8')) as Key;
      if (only && !only.split(',').some(part => key.file.includes(part))) continue;
      jobs.push({ path: join(dir, key.file), key });
    }
  }
  if (!jobs.length) throw new Error(`No answer keys found in ${dirs.join(', ')}`);
  console.log(`Evaluating ${jobs.length} syllabi × ${runs} run(s) with ${aiName}…`);
  // Limited concurrency: a real upload runs alone, and dozens of parallel calls inflate latency.
  const tasks = jobs.flatMap(job => Array.from({ length: runs }, (_, i) => () => runOne(job.path, job.key, i + 1, client).catch(e => ({ file: basename(job.path), run: i + 1, ok: false, seconds: 0, stage: 'crash', error: String(e), checks: [] } as RunResult))));
  const done: RunResult[] = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => { for (let task = tasks.shift(); task; task = tasks.shift()) done.push(await task()); }));
  const results = done.sort((a, b) => a.file.localeCompare(b.file) || a.run - b.run);
  const ids = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'R1', 'R2', 'R3', 'R4', 'R6', ...(stages >= 3 ? ['P1', 'P2'] : []), ...(stages >= 4 ? ['P3', 'P4', 'P5', 'P6', 'P7'] : [])];
  console.log(`\n${'syllabus'.padEnd(34)} run ${ids.map(i => i.padEnd(4)).join('')} pass`);
  let passed = 0;
  for (const r of results) {
    const by = new Map(r.checks.map(c => [c.id, c]));
    const must = ['E1', 'E2', 'E3', 'E5', 'E6', 'E7', 'E9', 'E10'].every(id => by.get(id)?.pass);
    const soft = ['E4', 'E8', 'E11'].filter(id => by.get(id) && !by.get(id)!.pass).length <= 1;
    const pass = must && soft; if (pass) passed++;
    console.log(`${label(r.file).padEnd(34)} ${String(r.run).padEnd(4)}${ids.map(id => (by.get(id) ? (by.get(id)!.pass ? 'ok' : 'NO') : '·').padEnd(4)).join('')} ${pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n${passed}/${results.length} runs pass extraction.\n`);
  for (const r of results) if (!r.checks.length) console.log(`${label(r.file)} #${r.run} crashed: ${r.error}`);
  for (const r of results) for (const c of r.checks.filter(c => !c.pass)) console.log(`${label(r.file)} #${r.run} ${c.id}: ${c.detail}`);
  await mkdir('reports', { recursive: true });
  await writeFile(out, JSON.stringify(results, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
