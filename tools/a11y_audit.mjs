#!/usr/bin/env node
// Accessibility audit for the Project Tessera site (docs/).
//
// Runs axe-core (WCAG 2.0 / 2.1 / 2.2, levels A and AA) against every page,
// every screen in each AI style, and each state of the clickable prototype.
// Writes reports/a11y.md and exits non-zero if any WCAG violation is found.
//
//   npm install              # once (set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if Chromium is preinstalled)
//   npm run a11y             # serves docs/ on a free port and audits it
//   CHROMIUM=/path/to/chrome npm run a11y
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const STYLES = ['marginalia', 'tabs', 'perforated', 'tiles'];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

// ---- static server for docs/ ------------------------------------------------
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = normalize(join(DOCS, path));
  // Single-page app fallback, as the Worker does in production (D-014): /app/<route> → /app/index.html.
  if (!existsSync(file) && path.startsWith('/app/') && !extname(path)) file = join(DOCS, 'app', 'index.html');
  if (!file.startsWith(DOCS) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

// ---- targets -----------------------------------------------------------------
const screens = JSON.parse(await readFile(join(DOCS, 'screens.json'), 'utf8'));
const AI_SCREENS = new Set(['lesson-player', 'course-builder', 'instructor-command', 'tutor-settings', 'learning-profile']);
const targets = [
  { name: 'Gallery', url: 'index.html' },
  { name: 'Research report', url: 'research.html' },
  { name: 'AI style exploration', url: 'explorations/ai-voice.html' },
  { name: 'Not found page', url: '404.html' },
];
// The Night 1 app (D-014), on the in-memory mock (?data=mock) since there's no API here.
// `as` signs in as a seed persona. Lane H adds every route.
const APP = [
  { name: 'App · Choose a persona', url: 'app/sign-in?data=mock' },
  { name: 'App · Design tokens', url: 'app/tokens?data=mock' },
  { name: 'App · Administrator home', url: 'app/?data=mock&as=u-admin' },
  { name: 'App · Instructor home', url: 'app/?data=mock&as=u-okafor' },
  { name: 'App · Student home', url: 'app/?data=mock&as=u-priya' },
  // Instructor (lane E) and the AI builder (lane F)
  { name: 'App · Instructor · My courses', url: 'app/teach?data=mock&as=u-okafor' },
  { name: 'App · Instructor · Course workspace', url: 'app/teach/courses/c-stat110?data=mock&as=u-okafor' },
  { name: 'App · Instructor · Lesson with an AI draft', url: 'app/teach/courses/c-stat110/lessons/l-stat-3?data=mock&as=u-okafor' },
  { name: 'App · Instructor · Published lesson', url: 'app/teach/courses/c-stat110/lessons/l-stat-1?data=mock&as=u-okafor' },
  { name: 'App · Instructor · Announcements', url: 'app/teach/courses/c-stat110/announcements?data=mock&as=u-okafor' },
  { name: 'App · Instructor · Roster', url: 'app/teach/courses/c-stat110/roster?data=mock&as=u-okafor' },
  { name: 'App · Builder · Start', url: 'app/teach/courses/c-stat110/build?data=mock&as=u-okafor' },
  // Student (lane G): Priya has no profile yet (onboarding); Marcus has one
  { name: 'App · Student · Onboarding', url: 'app/onboarding?data=mock&as=u-priya' },
  { name: 'App · Student · Today', url: 'app/today?data=mock&as=u-marcus' },
  { name: 'App · Student · Courses', url: 'app/courses?data=mock&as=u-marcus' },
  { name: 'App · Student · Course home', url: 'app/courses/c-stat110?data=mock&as=u-marcus' },
  { name: 'App · Student · Lesson', url: 'app/courses/c-stat110/lessons/l-stat-1?data=mock&as=u-marcus' },
  { name: 'App · Student · Announcements', url: 'app/announcements?data=mock&as=u-marcus' },
  { name: 'App · Student · Profile', url: 'app/profile?data=mock&as=u-marcus' },
];
for (const a of APP) targets.push({ ...a, settle: 900 });
for (const s of screens) {
  const styles = AI_SCREENS.has(s.slug) ? STYLES : ['marginalia'];
  for (const st of styles) targets.push({ name: `Screen · ${s.title}${styles.length > 1 ? ` · ${st}` : ''}`, url: `${s.file}?ai=${st}` });
}
// Storybook (D-011, #17): every story, in the default AI style, from the built index.
const sbIndex = join(DOCS, 'storybook', 'index.json');
if (existsSync(sbIndex)) {
  const { entries } = JSON.parse(await readFile(sbIndex, 'utf8'));
  for (const e of Object.values(entries)) {
    if (e.type === 'story') targets.push({ name: `Story · ${e.title} · ${e.name}`, url: `storybook/iframe.html?id=${e.id}&viewMode=story`, settle: 900 });
  }
}
const proto = (st) => [
  { name: `Prototype · Today · ${st}`, url: `prototype/?ai=${st}#today` },
  { name: `Prototype · Lesson + tutor · ${st}`, url: `prototype/?ai=${st}#today`, steps: async (p) => {
      await p.click('#task-resume'); await p.check('input[name=kc][value=c]'); await p.click('#kc-form button[type=submit]');
      await p.click('[data-act=toggle-tutor]'); await p.waitForTimeout(700); await p.click('[data-act=hint]'); await p.click('[data-act=answer]'); await p.waitForTimeout(1500); } },
  { name: `Prototype · Result · ${st}`, url: `prototype/?ai=${st}#today`, steps: async (p) => {
      await p.click('#task-resume'); await p.check('input[name=kc][value=b]'); await p.click('#kc-form button[type=submit]');
      await p.click('[data-act=next-chunk]'); await p.click('[data-act=to-check]');
      for (const v of ['b', 'b', 'b']) { await p.check(`input[name=quiz][value=${v}]`); await p.click('#quiz-form button[type=submit]'); await p.click('[data-act=next-q]'); }
      await p.waitForTimeout(300); } },
];
targets.push(...proto('marginalia'));
for (const st of STYLES.slice(1)) targets.push(...proto(st).slice(1));
targets.push({ name: 'Prototype · Reflect step', url: 'prototype/#today', steps: async (p) => {
  await p.click('#task-resume'); await p.check('input[name=kc][value=b]'); await p.click('#kc-form button[type=submit]'); await p.click('[data-act=next-chunk]'); } });
targets.push({ name: 'Prototype · Phone width + tutor', url: 'prototype/#today', viewport: { width: 390, height: 844 }, steps: async (p) => {
  await p.click('#task-resume'); await p.click('[data-act=toggle-tutor]'); await p.waitForTimeout(700); } });

// ---- run -------------------------------------------------------------------
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const results = [];
for (const t of targets) {
  const page = await browser.newPage({ viewport: t.viewport || { width: 1600, height: 1000 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + t.url);
  await page.waitForTimeout(t.settle || 400);
  if (t.steps) await t.steps(page);
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async (tags) => {
    const out = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })) }));
  }, TAGS);
  results.push({ ...t, violations: r });
  process.stdout.write(`${r.length ? '✗' : '✓'} ${t.name}${r.length ? `  (${r.map((v) => `${v.id}×${v.nodes.length}`).join(', ')})` : ''}\n`);
  await page.close();
}
// ---- reflow: WCAG 1.4.10 (content usable at 320 CSS px without horizontal scrolling) ----
// Screens under docs/screens/ are fixed-size design artboards and are exempt; site pages and the prototype are not.
const REFLOW = ['index.html', 'research.html', 'explorations/ai-voice.html', '404.html', 'app/sign-in?data=mock', 'app/?data=mock&as=u-okafor', 'app/teach/courses/c-stat110/lessons/l-stat-3?data=mock&as=u-okafor', 'app/teach/courses/c-stat110/build?data=mock&as=u-okafor', 'app/today?data=mock&as=u-marcus', 'app/courses/c-stat110/lessons/l-stat-1?data=mock&as=u-marcus', 'app/onboarding?data=mock&as=u-priya', 'prototype/#today', 'prototype/#lesson', 'prototype/#result'];
for (const u of REFLOW) {
  const page = await browser.newPage({ viewport: { width: 320, height: 256 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + u);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const iw = innerWidth;
    const off = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > iw + 1 && !e.closest('pre,iframe,.viewport,table'); });
    return { overflow: document.documentElement.scrollWidth > iw + 1, nodes: off.slice(0, 5).map((e) => ({ target: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''), summary: 'extends past 320px' })) };
  });
  const v = r.overflow ? [{ id: 'reflow-320', impact: 'serious', help: 'Content must reflow at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', nodes: r.nodes }] : [];
  results.push({ name: `Reflow 320px · ${u}`, url: u, violations: v });
  process.stdout.write(`${v.length ? '✗' : '✓'} Reflow 320px · ${u}\n`);
  await page.close();
}

await browser.close();
server.close();

// ---- report ------------------------------------------------------------------
const failing = results.filter((r) => r.violations.length);
const lines = [
  '# Accessibility audit', '',
  `Run: ${new Date().toISOString().slice(0, 10)} · reflow at 320px for site pages and the prototype · axe-core ${JSON.parse(await readFile(require.resolve('axe-core/package.json'), 'utf8')).version} · rules tagged ${TAGS.join(', ')}`, '',
  `**${results.length - failing.length} of ${results.length} targets pass with zero violations.**`, '',
  'Automated checks catch roughly a third to half of WCAG issues. Keyboard walkthroughs and screen-reader testing are still required (screen-reader pass tracked in issue #29).', '',
  '| Target | Result |', '|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.violations.length ? r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ') : 'Pass'} |`),
];
for (const r of failing) {
  lines.push('', `## ${r.name}`, '', `\`${r.url}\``, '');
  for (const v of r.violations) {
    lines.push(`- **${v.id}** (${v.impact}): ${v.help}`);
    for (const n of v.nodes.slice(0, 5)) lines.push(`  - \`${n.target}\``);
  }
}
await mkdir(join(ROOT, 'reports'), { recursive: true });
await writeFile(join(ROOT, 'reports', 'a11y.md'), lines.join('\n') + '\n');
console.log(`\n${results.length - failing.length}/${results.length} pass · report: reports/a11y.md`);
process.exit(failing.length ? 1 : 0);
