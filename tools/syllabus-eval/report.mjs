#!/usr/bin/env node
// Review pack for the syllabus evaluation: what Tessera extracted and read for each syllabus,
// side by side with its answer key and the rubric checks.
//   node tools/syllabus-eval/report.mjs [reports/syllabus-eval.json] [out.html]
// Needs a run made with --keep. The pack contains the syllabi's content: real syllabi stay
// private, so write it outside the repo (the default is reports/, which is gitignored).
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const input = process.argv[2] ?? 'reports/syllabus-eval.json';
const out = process.argv[3] ?? 'reports/syllabus-review.html';
const results = JSON.parse(await readFile(input, 'utf8'));
const keys = {};
for (const dir of ['tests/fixtures/syllabus', 'tests/fixtures/syllabus/private']) {
  let names = []; try { names = await readdir(dir); } catch { continue; }
  for (const name of names.filter(n => n.endsWith('.expected.json'))) { const key = JSON.parse(await readFile(join(dir, name), 'utf8')); keys[key.file] = key; }
}

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cite = span => span ? `<span class="cite" title="${esc(span.text)}">${span.page ? `p. ${span.page}` : span.section ? `§ ${esc(span.section.slice(0, 28))}` : 'quote'}</span>` : '';
const show = value => value == null ? '<em>none</em>' : typeof value === 'object' ? esc(Array.isArray(value) ? value.map(v => typeof v === 'object' ? v.title ?? JSON.stringify(v) : v).join('; ') : Object.values(value).filter(Boolean).join(' · ')) : esc(value);
const MUST = ['E1', 'E2', 'E3', 'E5', 'E6', 'E7', 'E9', 'E10'];
const NAMES = { E1: 'Code, title, credits', E2: 'Term', E3: 'Instructor', E4: 'Modality', E5: 'Outcomes', E6: 'Graded components', E7: 'Schedule', E8: 'Citations', E9: 'Questions', E10: 'Finished in time', E11: 'Hygiene', R1: 'Audits', R2: 'Summary and cites', R3: 'Alignment', R4: 'Workload', R6: 'Rubric refs', P1: 'Approaches', P2: 'Modules and outcomes' };
const passed = r => MUST.every(id => r.checks.find(c => c.id === id)?.pass) && ['E4', 'E8', 'E11'].filter(id => r.checks.find(c => c.id === id)?.pass === false).length <= 1;

function section(r) {
  const s = r.session ?? {}; const ex = s.extraction; const read = s.read; const key = keys[r.file] ?? {};
  const checks = `<table class="checks"><tr>${r.checks.map(c => `<th title="${esc(NAMES[c.id] ?? c.id)}">${c.id}</th>`).join('')}</tr><tr>${r.checks.map(c => `<td class="${c.pass ? 'ok' : 'no'}" title="${esc(c.detail)}">${c.pass ? '✓' : '✗'}</td>`).join('')}</tr></table>
    <ul class="details">${r.checks.filter(c => !c.pass).map(c => `<li><b>${c.id} ${esc(NAMES[c.id] ?? '')}:</b> ${esc(c.detail)}</li>`).join('')}</ul>`;
  if (!ex) return `<section><h2>${esc(r.file)} <span class="badge no">no extraction</span></h2><p>${esc(r.error)}</p>${checks}</section>`;
  const p = ex.profile;
  const fields = ['code', 'title', 'credits', 'termWeeks', 'termStart', 'termEnd', 'modality', 'level', 'instructor', 'prerequisites', 'meeting', 'materials'];
  const keyFor = { code: key.code, title: key.title, credits: key.credits, termWeeks: key.termWeeks, termStart: key.termStart, termEnd: key.termEnd, modality: key.modality, level: key.level, instructor: key.instructor };
  const profile = `<table><tr><th>Field</th><th>Tessera read</th><th>How</th><th>Answer key</th></tr>${fields.map(f => `<tr><td>${f}</td><td>${show(p[f]?.value)} ${cite(p[f]?.spans?.[0])}</td><td>${esc(p[f]?.origin)}</td><td>${f in keyFor ? show(keyFor[f]) : ''}</td></tr>`).join('')}</table>`;
  const outcomes = `<ol>${ex.outcomes.map(o => `<li>${esc(o.text)} ${cite(o.span)}</li>`).join('')}</ol>${key.outcomes ? `<details><summary>Answer key: ${key.outcomes.length} outcomes</summary><ol>${key.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ol></details>` : ''}`;
  const total = ex.assessments.reduce((n, a) => n + (a.weightPercent ?? 0), 0);
  const assessments = `<table><tr><th>Component</th><th>Weight</th><th>Due</th><th></th></tr>${ex.assessments.map(a => `<tr><td>${esc(a.title)}</td><td>${a.weightPercent ?? '—'}%</td><td>${esc(a.dueAt ?? '')}</td><td>${cite(a.span)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${Math.round(total * 100) / 100}%</b></td><td colspan="2">key: ${(key.assessments ?? []).map(a => `${esc(a.title)} ${a.weightPercent}%`).join('; ')}</td></tr></table>`;
  const byWeek = new Map((key.schedule ?? []).map(k => [k.week, k]));
  const schedule = ex.schedule.length ? `<table><tr><th>Week</th><th>Dates</th><th>Topic</th><th>Due</th><th>Key keywords</th></tr>${ex.schedule.map(row => `<tr class="${row.empty ? 'empty' : ''}"><td>${row.week}</td><td>${esc(row.dates)}</td><td>${row.empty ? '<em>empty</em> ' : ''}${esc(row.topic)} ${cite(row.span)}</td><td>${esc(row.due)}</td><td>${esc((byWeek.get(row.week)?.keywords ?? []).join(', '))}</td></tr>`).join('')}</table>` : '<p><em>No schedule in the syllabus.</em></p>';
  const questions = `<ol>${(s.questions ?? []).map(q => `<li>${esc(q.text)}${q.options?.length ? ` <span class="muted">(${q.options.map(o => esc(o.text)).join(' / ')})</span>` : ''}</li>`).join('')}</ol>`;
  const readHtml = read ? `<h3>Instructional read</h3><p class="ai">${esc(read.summary)}</p>
    <p class="muted">Budget ${read.workload.weeklyBudgetHours} h/week · estimated average ${read.workload.averageHours.toFixed(1)} h · ${read.workload.weeks.filter(w => w.overBudget).length} weeks over budget${read.learnerCenteredness ? ` · Palmer ${read.learnerCenteredness.palmer.score}/46 (${read.learnerCenteredness.palmer.band})` : ''}</p>
    <table><tr><th>Outcome</th><th>Verb · Bloom</th><th>Assessed by</th><th>Suggested rewrite</th></tr>${read.outcomeAudits.map(a => `<tr><td>${esc(a.outcomeId)}</td><td>${esc(a.verb ?? '—')} · ${esc(a.bloom ?? '—')}</td><td>${esc(a.assessedBy.map(x => ex.assessments.find(y => y.id === x.assessmentId)?.title ?? x.assessmentId).join('; ') || 'nothing found')}</td><td>${esc(a.suggestion?.text ?? '')}</td></tr>`).join('')}</table>
    <ul>${read.deficiencies.map(d => `<li>${esc(d.message)} ${d.spans.map(cite).join(' ')}</li>`).join('')}</ul>` : '<p class="muted">No read.</p>';
  const options = s.options?.length ? `<h3>Approaches proposed (${s.options.length})</h3>${s.options.map(o => `<details${o.tag === 'Closest to your syllabus' ? ' open' : ''}><summary><b>${esc(o.label)}</b> <span class="muted">${esc(o.tag)} · ${o.modules.length} modules · peak ${o.workload?.peakHours ?? '—'} h</span></summary><p>${esc(o.description)}</p><ul>${o.fits.map(f => `<li>${esc(f.text)} ${cite(f.span)}</li>`).join('')}</ul><p class="muted"><b>Changes:</b> ${esc(o.changes)}<br><b>Trade-offs:</b> ${esc(o.tradeoffs)}<br><b>Evidence:</b> ${esc(o.evidence)}</p><ol>${o.modules.map(m => `<li>${esc(m.title)} <span class="muted">weeks ${m.weeks.join(', ')} · ${m.lessons} lessons · ${esc(m.outcomeIds.join(', '))} · ${m.hours} h</span></li>`).join('')}</ol></details>`).join('')}${s.selection ? `<p class="muted">Selected: ${esc(s.selection.optionIds.join(' + '))}${s.selection.combinationNote ? ` (${esc(s.selection.combinationNote)})` : ''}</p>` : ''}` : '';
  return `<section><h2>${esc(r.file)} <span class="badge ${passed(r) ? 'ok' : 'no'}">${passed(r) ? 'passes' : 'fails'} extraction</span> <span class="muted">${r.seconds} s</span></h2>${checks}
    <div class="grid"><div><h3>Course profile</h3>${profile}<h3>Outcomes (${ex.outcomes.length})</h3>${outcomes}<h3>Graded components</h3>${assessments}</div>
    <div><h3>Schedule (${ex.schedule.length} rows)</h3>${schedule}<h3>Questions for the instructor</h3>${questions}${readHtml}${options}</div></div>
    ${key.traps ? `<details><summary>Traps in this syllabus (from the answer key)</summary><ul>${key.traps.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}</section>`;
}

const pass = results.filter(passed).length;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Syllabus review pack</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#FBF8F3;--ink:#1F2328;--muted:#5B6169;--line:#E3DDD3;--ok:#1F6B45;--okbg:#E4F2EA;--no:#9B2C2C;--nobg:#F8E4E1;--ai:#F1ECF7}
@media (prefers-color-scheme:dark){:root{--bg:#16181B;--ink:#E8E6E1;--muted:#A5A9AE;--line:#33373C;--ok:#7FD1A4;--okbg:#1C3327;--no:#F0A39B;--nobg:#3A1F1D;--ai:#28233A}}
body{background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;margin:0;padding:24px 16px;max-width:1400px;margin-inline:auto}
h1{font-size:22px}h2{font-size:18px;margin-top:40px;border-top:1px solid var(--line);padding-top:24px}h3{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
.checks{width:auto}.checks td{text-align:center;font-weight:700}.ok{color:var(--ok);background:var(--okbg)}.no{color:var(--no);background:var(--nobg)}
.badge{font-size:12px;padding:2px 8px;border-radius:10px}.muted{color:var(--muted);font-weight:400;font-size:12px}
.cite{font:11px ui-monospace,monospace;background:var(--line);padding:0 4px;border-radius:3px;cursor:help;white-space:nowrap}
.ai{background:var(--ai);padding:10px 12px;border-radius:6px}.empty td{color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}ul.details{font-size:12px;color:var(--muted)}
</style></head><body>
<h1>Syllabus review pack</h1>
<p>${results.length} runs · <b>${pass} pass extraction</b> · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} from ${esc(input)}. Hover a citation chip to see the quoted passage; hover a check to see its detail.</p>
${results.map(section).join('\n')}
</body></html>`;
await writeFile(out, html);
console.log(`Wrote ${out} (${results.length} runs, ${pass} pass).`);
