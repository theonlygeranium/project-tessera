#!/usr/bin/env node
// Night 1 acceptance journeys (handoff/NIGHT-1-PLAN.md §4), run against the app's
// in-browser mock backend (?data=mock&as=<persona>) the way the owner's own
// walkthrough works: each journey opens one fresh page (state resets on a full page
// load) and, after that first navigation, moves only by clicking links.
//
//   npm run e2e                      # builds docs/app and docs/storybook, then runs this
//   CHROMIUM=/path/to/chrome npm run e2e
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const SHOTS = join(ROOT, 'reports', 'e2e');
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

// ---- static server for docs/, with the same SPA fallback the Worker uses in
// production (D-014) and tools/a11y_audit.mjs already relies on: /app/<route> → /app/index.html.
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = normalize(join(DOCS, path));
  if (!existsSync(file) && path.startsWith('/app/') && !extname(path)) file = join(DOCS, 'app', 'index.html');
  if (!file.startsWith(DOCS) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const BASE = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failures = 0;

// ---- reporting ----------------------------------------------------------------------
async function step(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    console.log(`  ✗ ${label}`);
    console.log(`    ${String(error?.message ?? error).split('\n')[0]}`);
    throw error;
  }
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function journey(name, fn) {
  console.log(`\n${name}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    await fn(page);
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`✗ ${name}: ${String(error?.message ?? error).split('\n')[0]}`);
    try {
      await mkdir(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${slug(name)}.png`), fullPage: true });
    } catch { /* best effort */ }
  } finally {
    await context.close();
  }
}

// ---- shared helpers -------------------------------------------------------------------
async function runAxe(page, label) {
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async (tags) => {
    const out = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return out.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  }, AXE_TAGS);
  if (violations.length) throw new Error(`axe violations at ${label}: ${violations.map((v) => `${v.id}×${v.nodes}`).join(', ')}`);
}

/** Polls a locator's text content until it includes `text`, since mutations settle async. */
async function waitForIncludes(locator, text, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    last = (await locator.first().textContent().catch(() => null)) ?? '';
    if (last.includes(text)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Expected text to include "${text}", last saw "${last.slice(0, 300)}"`);
}

async function waitForEnabled(page, buttonName, timeout = 8000) {
  await page.waitForFunction((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
    return Boolean(btn && !btn.disabled);
  }, buttonName, { timeout });
}

/** Clicks every visible "Keep" button on an AI review lesson until none remain (D-003:
 * nothing AI-drafted publishes until a person keeps it). A stray double-click on an
 * already-kept block just fails server-side and is retried next loop, since the mutation
 * only clears the button on success. */
async function keepAllAiBlocks(page, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const keepButtons = page.getByRole('button', { name: 'Keep', exact: true });
    if ((await keepButtons.count()) === 0) return;
    await keepButtons.first().click();
    await page.waitForTimeout(250);
  }
  throw new Error('Timed out keeping every AI block.');
}

const readinessSection = (page) => page.locator('section', { has: page.getByRole('heading', { name: 'Publish readiness' }) });

// =======================================================================================
// Journey 1 — Administrator: setup, create a course, assign instructor, enroll a student.
// =======================================================================================
await journey('Journey 1 · Administrator sets up the institution and a course', async (page) => {
  await step('Sign in as the administrator and land on Setup', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-admin`);
    await page.getByRole('heading', { level: 1, name: 'Setup' }).waitFor();
  });
  await runAxe(page, 'Journey 1 · Setup');
  await step('Choose the Blue accent', async () => {
    await page.getByRole('radio', { name: 'Blue' }).check();
  });
  await step('Finish setup and land on the overview', async () => {
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
  });
  await step('Go to Courses and create DATA 101', async () => {
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Courses' }).click();
    await page.getByRole('heading', { level: 2, name: 'Create a course' }).waitFor();
    await page.getByLabel('Code').fill('DATA 101');
    await page.getByLabel('Title', { exact: false }).fill('Data Literacy 101');
    await page.getByLabel('Term').fill('Spring 2027');
    await page.getByRole('button', { name: 'Create course' }).click();
    await page.getByRole('heading', { level: 1, name: 'Data Literacy 101' }).waitFor();
  });
  await step('Assign Dr. Amara Okafor and save instructors', async () => {
    await page.getByRole('checkbox', { name: 'Dr. Amara Okafor' }).check();
    await page.getByRole('button', { name: 'Save instructors' }).click();
    await waitForIncludes(page.getByText('Instructors saved', { exact: true }), 'Instructors saved');
  });
  await step('Enroll Priya Natarajan and save students', async () => {
    await page.getByRole('checkbox', { name: 'Priya Natarajan' }).check();
    await page.getByRole('button', { name: 'Save students' }).click();
    await waitForIncludes(page.getByText('Students saved', { exact: true }), 'Students saved');
  });
  await step('DATA 101 shows the instructor and one student on Courses', async () => {
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Courses' }).click();
    const card = page.getByRole('link').filter({ hasText: 'Data Literacy 101' });
    await card.waitFor();
    await waitForIncludes(card, 'Dr. Amara Okafor');
    await waitForIncludes(card, '1 student');
  });
});

// =======================================================================================
// Journey 2 — Instructor builds a lesson with AI, then publishes once every block is kept.
// =======================================================================================
await journey('Journey 2 · Instructor builds and publishes with AI', async (page) => {
  await step('Sign in as the instructor and open Reasoning with Data', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'My courses' }).waitFor();
    await page.getByRole('link').filter({ hasText: 'Reasoning with Data' }).click();
    await page.getByRole('heading', { level: 1, name: 'Reasoning with Data' }).waitFor();
  });
  await step('Open Build with AI', async () => {
    // The rail also has a "Build with AI" nav item while inside a course; the course
    // bar's own action link is the one this step means, so scope to the page header.
    await page.getByRole('navigation', { name: 'Instructor navigation' }).getByRole('link', { name: 'Build with AI' }).click();
    await page.getByRole('heading', { level: 1, name: 'Build with AI' }).waitFor();
  });
  await step('Fill the prompt, add a pasted source, and draft the brief', async () => {
    await page.getByLabel('What should this course or unit cover, and for whom?').fill(
      'An introduction to statistical thinking for first-year undergraduates, built around short, concrete examples.',
    );
    await page.getByLabel('Source name').fill('Course notes');
    await page.getByLabel('Paste source text').fill('Statistics is the study of variability: how to describe it, and how to reason from it carefully.');
    await page.getByRole('button', { name: 'Add pasted source' }).click();
    await page.getByRole('button', { name: 'Draft the brief' }).click();
    await page.locator('#brief-heading').waitFor();
  });
  await step('The session shows an AI-labeled brief', async () => {
    await waitForIncludes(page.locator('.ai-who', { hasText: 'AI course brief' }), 'AI course brief');
  });
  await step('Draft the outline', async () => {
    await page.getByRole('button', { name: 'Draft the outline' }).click();
    await page.locator('#outline-heading').waitFor();
  });
  await step('Draft the lessons', async () => {
    await page.getByRole('button', { name: 'Draft the lessons' }).click();
    await page.locator('#review-heading').waitFor({ timeout: 20000 });
  });
  await step('The review list shows 4 lessons', async () => {
    const lessonLinks = page.locator('#review-heading').locator('xpath=following-sibling::*//a[contains(@href, "/lessons/")]');
    await lessonLinks.first().waitFor();
    const count = await lessonLinks.count();
    if (count !== 4) throw new Error(`Expected 4 draft lessons in the review list, found ${count}.`);
  });
  await step('Open the first lesson: Publish is disabled with draft issues listed', async () => {
    await page.locator('#review-heading').locator('xpath=following-sibling::*//a[contains(@href, "/lessons/")]').first().click();
    await readinessSection(page).getByRole('heading', { name: 'Publish readiness' }).waitFor();
    const publishBtn = page.getByRole('button', { name: 'Publish', exact: true });
    if (!(await publishBtn.isDisabled())) throw new Error('Expected Publish to be disabled before every AI block is kept.');
    await waitForIncludes(readinessSection(page), "Review this AI draft");
  });
  await step('Keep every AI block; Publish becomes enabled', async () => {
    await keepAllAiBlocks(page);
    await waitForEnabled(page, 'Publish');
  });
  await step('Publish the lesson; the status chip shows Published', async () => {
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('button', { name: 'Unpublish' }).waitFor();
    await waitForIncludes(readinessSection(page), 'Published');
  });
  await runAxe(page, 'Journey 2 · Lesson editor after publishing');
});

// =======================================================================================
// Journey 3 — Instructor by hand: a lesson with an image and a knowledge check, then a
// pinned, published announcement.
// =======================================================================================
await journey('Journey 3 · Instructor builds by hand and posts an announcement', async (page) => {
  await step('Sign in as the instructor and open the STAT 110 workspace', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-okafor`);
    await page.getByRole('link').filter({ hasText: 'Reasoning with Data' }).click();
    await page.getByRole('heading', { level: 1, name: 'Reasoning with Data' }).waitFor();
  });
  await step('Add a lesson to the first module', async () => {
    // The outline shows one "Add lesson" button per module; it reveals an inline row (NQ-08).
    await page.getByRole('button', { name: 'Add lesson' }).first().click();
    await page.getByLabel('Lesson title').fill('Spread: range and variability');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('link', { name: 'Spread: range and variability' }).click();
    await page.getByRole('heading', { level: 1, name: 'Spread: range and variability' }).waitFor();
  });
  await step('Add a heading, a text block, an image, and a knowledge check', async () => {
    await page.getByRole('button', { name: 'Add heading', exact: true }).click();
    await page.getByLabel('Heading text').fill('Spread tells us how values differ');

    await page.getByRole('button', { name: 'Add text', exact: true }).click();
    await page.getByLabel('Text', { exact: false }).fill('Two data sets can share the same mean but differ a lot in how spread out their values are.');

    await page.getByRole('button', { name: 'Add image', exact: true }).click();
    await page.getByLabel('Image URL').fill('/app/favicon.svg');
    await page.getByLabel('Alt text').fill('Bar chart of study hours');

    await page.getByRole('button', { name: 'Add knowledge check', exact: true }).click();
    await page.getByLabel('Question').fill('Which measure describes how spread out a data set is?');
    await page.getByLabel('Option 1').fill('Range');
    await page.getByLabel('Option 2').fill('Mode');
    await page.getByRole('radio', { name: 'Correct' }).first().check();
    await page.getByLabel('Feedback for correct answer').fill('Right: the range is the simplest measure of spread.');
    await page.getByLabel('Feedback for incorrect answer').fill('The mode is the most common value, not a measure of spread.');
  });
  await step('Save changes, then publish', async () => {
    await page.getByRole('button', { name: 'Save changes' }).click();
    await waitForIncludes(page.getByText('Blocks saved.', { exact: true }), 'Blocks saved.');
    await waitForEnabled(page, 'Publish');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('button', { name: 'Unpublish' }).waitFor();
  });
  await runAxe(page, 'Journey 3 · Lesson editor after publishing');
  await step('Back to the workspace, then Announcements', async () => {
    await page.getByRole('link', { name: 'Course workspace' }).click();
    await page.getByRole('heading', { level: 1, name: 'Reasoning with Data' }).waitFor();
    await page.getByRole('navigation', { name: 'Instructor navigation' }).getByRole('link', { name: 'Announcements' }).click();
    await page.locator('#announcement-composer').waitFor();
  });
  await step('Write a pinned announcement and publish it', async () => {
    const composer = page.locator('#announcement-composer');
    await composer.getByLabel('Title').fill('Module 2 starts this week');
    await composer.getByLabel('Body', { exact: false }).fill('We move from questions to describing distributions. Bring one example from your own week.');
    await composer.getByRole('checkbox', { name: 'Pin this announcement' }).check();
    await composer.getByRole('button', { name: 'Publish', exact: true }).click();
    await waitForIncludes(page.getByText('Announcement published.', { exact: true }), 'Announcement published.');
  });
  await step('The announcement appears as pinned and published', async () => {
    const card = page.locator('article', { has: page.getByRole('heading', { level: 3, name: 'Module 2 starts this week' }) });
    await card.waitFor();
    await waitForIncludes(card, 'Pinned');
    await waitForIncludes(card, 'Published');
  });
});

// =======================================================================================
// Journey 4 — Student: onboarding, Today, a lesson with a knowledge check, completion.
// =======================================================================================
await journey('Journey 4 · Student onboards and completes a lesson', async (page) => {
  await step('Sign in as the student and land on onboarding', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-priya`);
    await page.getByRole('heading', { level: 1, name: 'Set up your learning profile' }).waitFor();
  });
  await runAxe(page, 'Journey 4 · Onboarding');
  await step('Check a goal and save', async () => {
    await page.getByRole('checkbox', { name: 'Finish my degree' }).check();
    await page.getByRole('button', { name: 'Save and go to Today' }).click();
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
  });
  await step('Today shows a Resume task and unread announcements', async () => {
    const task = page.getByRole('link').filter({ hasText: 'What makes a question statistical?' });
    await task.waitFor();
    await waitForIncludes(task, 'Resume');
    const unread = await page.getByRole('button', { name: 'Mark as read' }).count();
    if (unread < 1) throw new Error('Expected at least one unread announcement on Today.');
  });
  await step('Resume the lesson', async () => {
    await page.getByRole('link').filter({ hasText: 'What makes a question statistical?' }).click();
    await page.getByRole('heading', { level: 1, name: 'What makes a question statistical?' }).waitFor();
  });
  await step('Answer the check wrong, see "Not quite", then try again', async () => {
    await page.getByRole('radio', { name: 'What time does the library open on Monday?' }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await waitForIncludes(page.getByRole('status').filter({ hasText: 'Not quite' }), 'Not quite');
    await page.getByRole('button', { name: 'Try again' }).click();
  });
  await step('Answer correctly and see "Correct"', async () => {
    await page.getByRole('radio', { name: 'How many hours a week do Meridian State students study?' }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await waitForIncludes(page.getByRole('status').filter({ hasText: 'Correct' }), 'Correct');
  });
  await step('Mark the lesson complete', async () => {
    await page.getByRole('button', { name: 'Mark lesson complete' }).click();
    await waitForIncludes(page.getByText('Lesson complete.', { exact: true }), 'Lesson complete.');
  });
  await runAxe(page, 'Journey 4 · Today after completion');
  await step('Back to Today via the rail: Do next now shows Cases and variables', async () => {
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Today' }).click();
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    await page.getByRole('link').filter({ hasText: 'Cases and variables' }).waitFor();
  });
});

// =======================================================================================
// Journey 5 — Rules the server enforces (each check needs its own persona, so each is its
// own fresh page; there is no single continuous user flow across three different signed-in
// personas).
// =======================================================================================
await journey("Journey 5a · A student can't reach a draft lesson", async (page) => {
  await step('The draft lesson shows a not-found error, not its content', async () => {
    // u-priya has no learning profile yet, so the shell always redirects her to
    // onboarding before this check could run (by design, D-004); u-marcus is the seed
    // student who already has a profile and is enrolled in c-stat110, so he is the one
    // who actually reaches this route (see tools/a11y_audit.mjs's own comment on this).
    await page.goto(`${BASE}app/courses/c-stat110/lessons/l-stat-3?data=mock&as=u-marcus`);
    await waitForIncludes(page.locator('main'), 'Lesson not found.');
    const leaked = await page.getByRole('heading', { name: 'Two ways to describe the middle' }).count();
    if (leaked > 0) throw new Error('The draft lesson\'s content rendered for a student.');
  });
});

await journey("Journey 5b · A student can't reach instructor pages", async (page) => {
  await step('/teach redirects a student away', async () => {
    await page.goto(`${BASE}app/teach?data=mock&as=u-marcus`);
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    if (!page.url().endsWith('/app/today')) throw new Error(`Expected to land on /app/today, saw ${page.url()}`);
  });
});

await journey("Journey 5c · An instructor can't reach admin pages", async (page) => {
  await step('/admin redirects an instructor away', async () => {
    await page.goto(`${BASE}app/admin?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'My courses' }).waitFor();
    if (!page.url().endsWith('/app/teach')) throw new Error(`Expected to land on /app/teach, saw ${page.url()}`);
  });
});

// ---- summary --------------------------------------------------------------------------
await browser.close();
server.close();
console.log(failures ? `\n${failures} journey(s) failed. Screenshots: reports/e2e/` : '\nAll journeys passed.');
process.exit(failures ? 1 : 0);
