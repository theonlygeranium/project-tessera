#!/usr/bin/env node
// Keeps the Mintlify docs in step with what ships: screenshots every screen,
// prototype state, and Storybook story from the built site, and generates the
// "Screens" and "Components" pages from the same lists the site and Storybook use.
// New screens (docs/screens.json) and new stories (docs/storybook/index.json)
// appear in the docs automatically.
//
//   npm run docs:sync      # builds first, then runs this, then regenerates the tokens page
//
// Output (committed, because Mintlify builds from the repo):
//   mintlify/images/generated/{screens,prototype,components}/*.jpg
//   mintlify/screens.mdx, mintlify/components.mdx
// Images are only rewritten when their bytes change, so unchanged screens don't churn git.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const MINT = join(ROOT, 'mintlify');
const IMG = join(MINT, 'images', 'generated');
const SITE = 'https://tessera.edstratumlabs.ai';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

for (const p of ['screens.json', 'storybook/index.json', 'app/index.html']) {
  if (!existsSync(join(DOCS, p))) { console.error(`docs/${p} is missing: run \`npm run build\` first (or use npm run docs:sync).`); process.exit(1); }
}

// ---- static server for docs/ (same as the a11y audit) ------------------------
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(DOCS, path));
  if (!file.startsWith(DOCS) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

const written = new Set();
async function save(dir, name, buf) {
  const folder = join(IMG, dir);
  await mkdir(folder, { recursive: true });
  const file = join(folder, name);
  written.add(file);
  if (existsSync(file) && Buffer.compare(await readFile(file), buf) === 0) return false;
  await writeFile(file, buf);
  if (process.env.DOCS_SYNC_VERBOSE) console.log('changed:', dir + '/' + name);
  return true;
}
const jpg = { type: 'jpeg', quality: 82 };
// Wait for web fonts, so a slow font load can't change a screenshot between runs.
const settle = async (page, ms) => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
let changed = 0;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// ---- screens ------------------------------------------------------------------
const screens = JSON.parse(await readFile(join(DOCS, 'screens.json'), 'utf8'));
for (const s of screens) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.goto(`${BASE}${s.file}?embed=1`, { waitUntil: 'networkidle' });
  await settle(page, 500);
  if (await save('screens', `${s.slug}.jpg`, await page.screenshot(jpg))) changed++;
  await page.close();
}

// ---- prototype states -----------------------------------------------------------
const PROTO = [
  { slug: 'today', title: 'Today', text: 'The learner\'s cross-course "Do next" list, weekly time budget, review queue, and mastery.' },
  { slug: 'lesson-tutor', title: 'Lesson with the hint-first tutor', text: 'A wrong answer on the knowledge check, then the tutor giving a hint and declining to give the answer.',
    steps: async (p) => { await p.click('#task-resume'); await p.check('input[name=kc][value=c]'); await p.click('#kc-form button[type=submit]');
      await p.click('[data-act=toggle-tutor]'); await p.waitForTimeout(700); await p.click('[data-act=hint]'); await p.click('[data-act=answer]'); await p.waitForTimeout(1500); } },
  { slug: 'result', title: 'Module check result', text: 'What changed after the check: mastery, new review cards, time logged, and what the instructor sees.',
    steps: async (p) => { await p.click('#task-resume'); await p.check('input[name=kc][value=b]'); await p.click('#kc-form button[type=submit]');
      await p.click('[data-act=next-chunk]'); await p.click('[data-act=to-check]');
      for (const v of ['b', 'b', 'b']) { await p.check(`input[name=quiz][value=${v}]`); await p.click('#quiz-form button[type=submit]'); await p.click('[data-act=next-q]'); }
      await p.waitForTimeout(400); } },
];
for (const st of PROTO) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}prototype/#today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (st.steps) await st.steps(page);
  await settle(page, 200);
  if (await save('prototype', `${st.slug}.jpg`, await page.screenshot(jpg))) changed++;
  await page.close();
}

// ---- Storybook stories ------------------------------------------------------------
const { entries } = JSON.parse(await readFile(join(DOCS, 'storybook', 'index.json'), 'utf8'));
const stories = Object.values(entries).filter((e) => e.type === 'story');
for (const e of stories) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}storybook/iframe.html?id=${e.id}&viewMode=story`, { waitUntil: 'networkidle' });
  await settle(page, 600);
  const root = page.locator('#storybook-root');
  const shot = await root.screenshot({ type: 'png', omitBackground: false });
  if (await save('components', `${e.id}.png`, shot)) changed++;
  await page.close();
}
await browser.close();
server.close();

// Remove images for screens or stories that no longer exist.
for (const dir of ['screens', 'prototype', 'components']) {
  const folder = join(IMG, dir);
  if (!existsSync(folder)) continue;
  for (const f of await readdir(folder)) if (!written.has(join(folder, f))) { await rm(join(folder, f)); changed++; }
}

// ---- pages ------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[{}<>]/g, (c) => ({ '{': '&#123;', '}': '&#125;', '<': '&lt;', '>': '&gt;' }[c]));
const header = (title, description) => ['---', `title: "${title}"`, `description: "${description}"`, '---', '',
  '{/* Generated by tools/docs_sync.mjs from the built site. Do not edit by hand; run `npm run docs:sync`. */}', ''];

const groups = [...new Set(screens.map((s) => s.group))];
const screensMdx = [
  ...header('Screens', 'Every prototype screen and the clickable learner flow, captured from the live build.'),
  `Tessera has ${screens.length} prototype screens across ${groups.length} roles, plus a clickable learner prototype. These images are captured automatically from each build, so they always match the [live site](${SITE}/).`,
  '',
  ...groups.flatMap((g) => [`## ${g}`, '', ...screens.filter((s) => s.group === g).flatMap((s) => [
    `### ${esc(s.title.replace(/^[A-G] · /, ''))}`, '', esc(s.description), '',
    `<Frame caption="${esc(s.w)}×${esc(s.h)} · [open the live screen](${SITE}/${s.file})">`, `  <img src="/images/generated/screens/${s.slug}.jpg" alt="${esc(s.title)} screen" />`, '</Frame>', '',
  ])]),
  '## Clickable prototype', '', `Try it yourself: [the learner flow](${SITE}/prototype/).`, '',
  ...PROTO.flatMap((st) => [`### ${st.title}`, '', st.text, '', '<Frame>', `  <img src="/images/generated/prototype/${st.slug}.jpg" alt="Prototype: ${st.title}" />`, '</Frame>', '']),
];

const byComponent = new Map();
for (const e of stories) {
  const name = e.title.split('/').pop();
  if (!byComponent.has(name)) byComponent.set(name, []);
  byComponent.get(name).push(e);
}
let purposes = {};
try {
  const inv = await readFile(join(ROOT, 'design', 'COMPONENTS.md'), 'utf8');
  for (const m of inv.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)) purposes[m[1]] = m[2].trim();
} catch { /* inventory optional */ }
const componentsMdx = [
  ...header('Components', 'The shared React component library, with every story, captured from the live Storybook.'),
  `Tessera's screens are being rebuilt from shared React components (D-011). There are ${byComponent.size} components with ${stories.length} stories so far. Each image is captured automatically from the [live Storybook](${SITE}/storybook/), where you can change props and switch the AI style.`,
  '',
  '<Note>Components use design tokens only, and every story is checked by the automated accessibility audit (WCAG 2.2 AA).</Note>',
  '',
  ...[...byComponent.keys()].sort().flatMap((name) => [
    `## ${name}`, '', purposes[name] ? `${esc(purposes[name])}` : '', '',
    `[Open ${name} in Storybook](${SITE}/storybook/?path=/docs/${byComponent.get(name)[0].id.replace(/--.*$/, '')}--docs)`, '',
    '<CardGroup cols={2}>',
    ...byComponent.get(name).flatMap((e) => [
      `  <Card title="${esc(e.name)}" href="${SITE}/storybook/?path=/story/${e.id}">`,
      `    <img src="/images/generated/components/${e.id}.png" alt="${esc(name)}: ${esc(e.name)}" />`, '  </Card>']),
    '</CardGroup>', '',
  ]),
];

await writeFile(join(MINT, 'screens.mdx'), screensMdx.join('\n'));
await writeFile(join(MINT, 'components.mdx'), componentsMdx.join('\n'));
console.log(`docs sync: ${screens.length} screens, ${PROTO.length} prototype states, ${stories.length} stories (${byComponent.size} components); ${changed} image(s) changed`);
