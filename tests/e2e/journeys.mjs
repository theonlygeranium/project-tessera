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

/** `ONLY="Journey 12" node tests/e2e/journeys.mjs` runs the journeys whose names contain the text. */
async function journey(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
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
    await page.getByRole('button', { name: 'Save profile' }).click();
    // Onboarding now suggests a setup (plan §5.5) before continuing; skipping it is fine.
    await page.getByRole('heading', { name: 'Suggested setup' }).waitFor();
    await page.getByRole('link', { name: 'Continue to Today' }).click();
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

// =======================================================================================
// Night 2 journeys (plan §8). Persona switches keep the in-memory demo data, so a journey
// can cross roles in one tab; navigation stays in-app because a reload resets the data.
async function switchTo(page, name) {
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByRole('button', { name: new RegExp(`^Sign in as ${name},`) }).click();
}

await journey('Journey 8 · Instructor drafts at scope; a student plays the scenario', async (page) => {
  await step('Open Generate and choose Module 2 with documents and scenarios', async () => {
    await page.goto(`${BASE}app/teach/courses/c-stat110/generate?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'Generate lesson drafts' }).waitFor();
    await page.getByRole('radio', { name: 'Pick modules and lessons' }).check();
    await page.getByRole('checkbox', { name: 'Describing distributions' }).check();
    await page.getByRole('checkbox', { name: /^Text/ }).uncheck();
    await page.getByRole('checkbox', { name: /^Knowledge check/ }).uncheck();
    await page.getByRole('checkbox', { name: /^Document/ }).check();
    await page.getByRole('checkbox', { name: /^Scenario/ }).check();
    await waitForIncludes(page.locator('main'), '2 elements across 1 lesson');
  });
  await runAxe(page, 'Journey 8 · Generate');
  await step('Generate; drafts land and nothing is published', async () => {
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await waitForIncludes(page.locator('main'), 'Nothing was published.', 20000);
  });
  await step('Review the lesson: keep every AI draft and publish', async () => {
    await page.getByRole('link', { name: 'Center: mean and median' }).click();
    await page.getByRole('heading', { level: 1, name: 'Center: mean and median' }).waitFor();
    await keepAllAiBlocks(page);
    await waitForEnabled(page, 'Publish', 10000);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await waitForIncludes(page.locator('main'), 'Lesson published.');
  });
  await step('As Marcus, open the lesson and play the scenario to an outcome', async () => {
    await switchTo(page, 'Marcus Bell');
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Courses' }).click();
    await page.getByRole('heading', { level: 1, name: 'Courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/courses\/c-stat110$/);
    await page.getByRole('link', { name: /Center: mean and median/ }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Center: mean and median' }).waitFor();
    await page.getByRole('button', { name: 'State the question.' }).click();
    await waitForIncludes(page.locator('main'), 'The class uses evidence to support its conclusion.');
  });
  await runAxe(page, 'Journey 8 · Scenario outcome');
});

await journey('Journey 9 · Student submits; instructor grades with an AI feedback draft; student sees the grade', async (page) => {
  // Demo mode has no file storage, so this journey submits text; file submissions are
  // covered by the Worker route tests and the preview smoke test.
  await step('As Marcus, open the assignment from the course page and submit', async () => {
    await page.goto(`${BASE}app/courses?data=mock&as=u-marcus`);
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.getByRole('link', { name: /Find the statistical question/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Find the statistical question' }).waitFor();
    await page.getByLabel('Your response').fill('How many hours of sleep do students in my dorm get on weeknights? Answers will vary from person to person and night to night.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await waitForIncludes(page.locator('main'), 'Attempt 1 submitted.');
  });
  await step('As Dr. Okafor, grade with the rubric and an AI feedback draft', async () => {
    await switchTo(page, 'Dr. Amara Okafor');
    await page.getByRole('heading', { level: 1, name: 'My courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/teach\/courses\/c-stat110$/);
    await page.getByRole('navigation').getByRole('link', { name: 'Grades' }).click();
    await page.waitForURL(/\/grades$/);
    await page.getByRole('link', { name: 'Find the statistical question' }).click();
    await page.waitForURL(/\/assignments\/asg-stat-1$/);
    await page.getByRole('button', { name: /Marcus Bell · attempt 1/ }).click();
    for (const legend of ['Question', 'Reasoning']) {
      await page.getByRole('group', { name: legend }).getByRole('radio', { name: /Clear/ }).check();
    }
    await page.getByRole('button', { name: 'Draft feedback with AI' }).click();
    await waitForIncludes(page.locator('main'), 'AI draft added.');
    await page.getByRole('button', { name: 'Save grade' }).click();
    await waitForIncludes(page.locator('main'), 'Grade saved.');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Release grades' }).click();
    await waitForIncludes(page.locator('main'), 'Grades released.');
  });
  await runAxe(page, 'Journey 9 · Grading');
  await step('As Marcus, see the grade, the rubric result, and the labeled AI feedback', async () => {
    await switchTo(page, 'Marcus Bell');
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Courses' }).click();
    await page.getByRole('heading', { level: 1, name: 'Courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/courses\/c-stat110$/);
    await page.getByRole('link', { name: /Find the statistical question/ }).click();
    await waitForIncludes(page.locator('main'), '10 / 10');
    await waitForIncludes(page.locator('main'), 'Drafted with AI');
  });
});

await journey('Journey 10 · Tutor: hints on graded work, answers in Open practice, summaries for the instructor', async (page) => {
  await step('As Dr. Okafor, set the practice lesson tutor to Open', async () => {
    await page.goto(`${BASE}app/teach/courses/c-stat110/lessons/l-stat-1?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'What makes a question statistical?' }).waitFor();
    await page.getByRole('group', { name: 'Tutor mode' }).getByRole('radio', { name: /^Open/ }).check();
    await page.getByRole('button', { name: 'Save tutor settings' }).click();
    await waitForIncludes(page.locator('main'), 'saved');
  });
  await step('As Marcus, ask for the answer on the practice lesson: the tutor answers', async () => {
    await switchTo(page, 'Marcus Bell');
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Courses' }).click();
    await page.getByRole('heading', { level: 1, name: 'Courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/courses\/c-stat110$/);
    await page.getByRole('link', { name: /What makes a question statistical/ }).first().click();
    await page.getByRole('heading', { level: 1, name: 'What makes a question statistical?' }).waitFor();
    await page.getByRole('button', { name: 'Ask the tutor' }).click();
    await waitForIncludes(page.locator('main'), 'Mode: Open');
    await waitForIncludes(page.locator('main'), 'not your messages');
    await page.getByRole('button', { name: 'Show me the answer' }).click();
    await waitForIncludes(page.locator('main'), 'Answer');
  });
  await runAxe(page, 'Journey 10 · Tutor on a practice lesson');
  await step('On the graded assignment, asking for the answer gets a hint that says why', async () => {
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Courses' }).click();
    await page.getByRole('heading', { level: 1, name: 'Courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/courses\/c-stat110$/);
    await page.getByRole('link', { name: /Find the statistical question/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Find the statistical question' }).waitFor();
    await page.getByRole('button', { name: 'Ask the tutor' }).click();
    await waitForIncludes(page.locator('main'), 'Mode: Hints');
    await page.getByRole('button', { name: 'Show me the answer' }).click();
    await waitForIncludes(page.locator('main'), 'graded work, so the tutor gives hints');
    await waitForIncludes(page.locator('main'), '1 of 2 hints used');
  });
  await step('As Dr. Okafor, the summaries page shows counts and a summary, not the transcript', async () => {
    await switchTo(page, 'Dr. Amara Okafor');
    await page.getByRole('heading', { level: 1, name: 'My courses' }).waitFor();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.waitForURL(/\/teach\/courses\/c-stat110$/);
    await page.getByRole('navigation').getByRole('link', { name: 'Tutor' }).click();
    await waitForIncludes(page.locator('main'), 'Marcus Bell');
    await waitForIncludes(page.locator('main'), 'Summary by AI');
    const main = await page.locator('main').innerText();
    if (main.includes('Please show me the answer.')) throw new Error('The summaries page shows a student message verbatim.');
  });
  await runAxe(page, 'Journey 10 · Tutor summaries');
});

await journey('Journey H · Student applies a suggested setup and undoes one change', async (page) => {
  await step('From the profile, use the suggested setup', async () => {
    await page.goto(`${BASE}app/profile?data=mock&as=u-marcus`);
    await page.getByRole('heading', { name: 'Suggested setup' }).waitFor();
    await page.getByRole('button', { name: 'Use this setup' }).first().click();
  });
  await step('Today lists each change with its reason; Undo removes it and moves focus to the section', async () => {
    await page.getByRole('navigation', { name: 'Student navigation' }).getByRole('link', { name: 'Today' }).click();
    const heading = page.getByRole('heading', { name: 'Changes Tessera made for you' });
    await heading.waitFor();
    await waitForIncludes(page.locator('main'), 'Reminders: daily, was weekly');
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await waitForIncludes(page.locator('main'), 'Change undone.');
    await page.waitForFunction(() => document.activeElement?.id === 'adaptation-changes-heading', null, { timeout: 3000 });
  });
  await runAxe(page, 'Journey H · Today after undo');
});

await journey('Journey 11 · Administrator invites a person, views as a student, and the invitee lands in their persona', async (page) => {
  await step('Finish setup and open People', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-admin`);
    await page.getByRole('heading', { level: 1, name: 'Setup' }).waitFor();
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'People' }).click();
    await page.getByRole('heading', { level: 2, name: 'Invite someone' }).waitFor();
  });
  await step('Invite Taylor Brooks as a student; the demo says Access isn\'t connected', async () => {
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Invite someone' }) });
    await form.getByLabel('Name').fill('Taylor Brooks');
    await form.getByLabel('Email').fill('taylor.brooks@meridian.example.edu');
    await form.getByRole('radio', { name: 'Student' }).check();
    await form.getByRole('button', { name: 'Invite someone' }).click();
    await waitForIncludes(page.locator('main'), 'taylor.brooks@meridian.example.edu');
    await waitForIncludes(page.locator('main'), "Access isn't connected");
  });
  await runAxe(page, 'Journey 11 · People with an invitation');
  await step('View as Marcus, see the banner, then stop viewing', async () => {
    await page.getByRole('button', { name: 'View Tessera as Marcus Bell' }).click();
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    await waitForIncludes(page.locator('main'), "You're viewing Tessera as");
    await page.getByRole('button', { name: 'Stop viewing' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
  });
  await step('Sign in as Taylor: a student with no profile lands on onboarding', async () => {
    await switchTo(page, 'Taylor Brooks');
    await page.getByRole('heading', { level: 1, name: 'Set up your learning profile' }).waitFor();
  });
});

// ---- Night 3 (handoff/NIGHT-3-PLAN.md §7) ------------------------------------------------

await journey('Journey 12 · Templates: a program template gives a new course its skeleton; a deleted required lesson shows in readiness', async (page) => {
  await step('Administrator creates a template with a required "Start here" module', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-admin`);
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Templates' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Workforce standard');
    await page.getByRole('button', { name: 'Create template' }).click();
    await page.getByRole('heading', { level: 1, name: 'Workforce standard' }).waitFor();
    await page.getByLabel('New module title').fill('Start here');
    await page.getByRole('button', { name: 'Add module' }).click();
    await page.getByLabel('New lesson title').fill('How to get help');
    await page.getByRole('button', { name: 'Add lesson' }).click();
    await page.getByLabel('New required block label').fill('Instructor contact');
    await page.getByRole('button', { name: 'Add block' }).click();
    await page.getByRole('button', { name: 'Save template' }).click();
    await waitForIncludes(page.locator('main'), 'saved');
  });
  await step('Administrator creates a program that uses it', async () => {
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Programs' }).click();
    await page.getByRole('heading', { level: 2, name: 'Create program' }).waitFor();
    await page.getByLabel('Name', { exact: true }).fill('Workforce safety');
    await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption({ label: 'Workforce standard' });
    await page.getByRole('radio', { name: 'Blue' }).check();
    await page.getByRole('button', { name: 'Create program' }).click();
    await waitForIncludes(page.locator('main'), 'Workforce safety');
  });
  await runAxe(page, 'Journey 12 · Programs');
  await step('Instructor creates a course in the program and gets the skeleton', async () => {
    await switchTo(page, 'Dr. Amara Okafor');
    await page.getByRole('heading', { level: 1, name: 'My courses' }).waitFor();
    await page.getByLabel('Code').fill('OPS 210');
    await page.getByLabel('Title').fill('Forklift safety');
    await page.getByLabel('Term').fill('Ongoing');
    await page.getByRole('combobox', { name: 'Program', exact: true }).selectOption({ label: 'Workforce safety' });
    await page.getByRole('button', { name: 'Create course' }).click();
    await waitForIncludes(page.locator('main'), 'How to get help');
    await waitForIncludes(page.locator('main'), 'Start here');
  });
  await step('Deleting the required lesson shows up in the readiness report', async () => {
    page.once('dialog', (d) => d.accept());
    await page.getByRole('listitem').filter({ hasText: 'How to get help' }).getByRole('button', { name: 'Delete' }).click();
    await waitForIncludes(page.locator('main'), 'Lesson deleted.');
    await page.getByRole('link', { name: 'Readiness' }).first().click();
    await waitForIncludes(page.locator('main'), 'The required lesson "How to get help" is missing.');
  });
  await runAxe(page, 'Journey 12 · Readiness with a template deviation');
});

await journey('Journey 13 · Readiness: fix link to a block, accept an AI finding, attest an item, and the standards update', async (page) => {
  const standard = (n) => page.getByRole('heading', { level: 2, name: new RegExp(`^${n}\\. `) });
  const item = (n) => page.getByRole('heading', { level: 3, name: new RegExp(`^${n.replace('.', '\\.')}\\. `) }).locator('xpath=..');
  await step('Open the course readiness report', async () => {
    await page.goto(`${BASE}app/teach/courses/c-stat110/readiness?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'Course readiness' }).waitFor();
    await waitForIncludes(standard(6), '0 of 2 met');
  });
  await runAxe(page, 'Journey 13 · Readiness report');
  await step('Follow the fix link to the exact block and keep the AI draft', async () => {
    await page.getByRole('link', { name: 'Review the draft in "Center: mean and median"' }).click();
    await page.getByRole('heading', { level: 1, name: 'Center: mean and median' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id?.startsWith('block-'), null, { timeout: 5000 });
    await page.locator(':focus').getByRole('button', { name: 'Keep', exact: true }).click();
    await waitForIncludes(page.locator('main'), '1 of 1 AI block reviewed');
  });
  await step('Back in the report, "AI drafts kept" is met and standard 6 updates', async () => {
    await page.getByRole('link', { name: 'Full course report' }).click();
    await page.getByRole('heading', { level: 1, name: 'Course readiness' }).waitFor();
    await waitForIncludes(standard(6), '1 of 2 met');
  });
  await step('Run AI-assisted items; findings are drafts until a person accepts one', async () => {
    await page.getByRole('button', { name: 'Check AI-assisted items' }).click();
    await item('1.3').getByRole('button', { name: 'Accept' }).waitFor();
    await waitForIncludes(standard(1), 'of 3 met');
    const before = (await standard(1).textContent()) ?? '';
    await item('1.3').getByRole('button', { name: 'Accept' }).click();
    await waitForIncludes(item('1.3'), 'Dr. Amara Okafor');
    if ((await standard(1).textContent()) === before && !(await item('1.3').textContent()).includes('not met')) throw new Error('Accepting the finding changed nothing');
  });
  await step('A reviewer attests 4.1 with a note; standard 4 updates', async () => {
    await waitForIncludes(standard(4), '2 of 4 met');
    await item('4.1').getByRole('button', { name: 'Attest' }).click();
    await page.getByLabel('Reviewer note').fill('Checked every reading against the outcomes this term.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await waitForIncludes(standard(4), '3 of 4 met');
    await waitForIncludes(item('4.1'), 'Attested by Dr. Amara Okafor');
  });
  await runAxe(page, 'Journey 13 · Report after review');
});

await journey('Journey 14 · Variants: create a plain-language version, edit the master, resync; a plain-reading student gets it with a why and a way back', async (page) => {
  await step('Create a plain-language variant, keep its AI drafts, and publish it', async () => {
    await page.goto(`${BASE}app/teach/courses/c-stat110/lessons/l-stat-1/variants?data=mock&as=u-okafor`);
    await page.getByRole('heading', { level: 1, name: 'Variants' }).waitFor();
    await page.getByRole('button', { name: 'Create plain-language version' }).click();
    await page.getByRole('heading', { level: 1, name: 'What makes a question statistical? (plain language)' }).waitFor();
    await keepAllAiBlocks(page);
    await waitForEnabled(page, 'Publish');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('button', { name: 'Unpublish' }).waitFor();
  });
  await step('Edit the master lesson', async () => {
    await page.getByRole('link', { name: 'Compare with master' }).click();
    await page.getByRole('link', { name: 'Back to master lesson' }).click();
    await page.getByRole('heading', { level: 1, name: 'What makes a question statistical?' }).waitFor();
    const block = page.locator('#block-b-s1-2');
    await block.getByRole('button', { name: 'Edit', exact: true }).click();
    await block.getByLabel('Text', { exact: false }).fill('A statistical question is answered with data that varies from case to case.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await waitForIncludes(page.getByText('Blocks saved.', { exact: true }), 'Blocks saved.');
  });
  await step('The variant shows as diverged; compare and resync', async () => {
    await page.getByRole('link', { name: 'Manage variants' }).click();
    await waitForIncludes(page.locator('main'), '1 changed in the master');
    await page.getByRole('link', { name: 'Compare', exact: true }).first().click();
    await waitForIncludes(page.locator('main'), 'Master changed');
  });
  await runAxe(page, 'Journey 14 · Variant compare');
  await step('Resync all brings the variant back in sync (as AI drafts to keep)', async () => {
    await page.getByRole('button', { name: 'Resync all' }).click();
    await page.waitForFunction(() => !document.querySelector('main')?.textContent?.includes('Master changed'), null, { timeout: 8000 });
  });
  await step('A student with plain reading gets the variant, a why, and a way back', async () => {
    await switchTo(page, 'Marcus Bell');
    await page.getByRole('navigation').getByRole('link', { name: 'Profile' }).first().click();
    await page.getByRole('radio', { name: 'Plain language' }).check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await waitForIncludes(page.locator('main'), 'saved');
    await page.getByRole('navigation').getByRole('link', { name: 'Courses' }).first().click();
    await page.getByRole('link', { name: /Reasoning with Data/ }).first().click();
    await page.getByRole('link', { name: 'What makes a question statistical?' }).first().click();
    await waitForIncludes(page.locator('main'), 'plain-language version');
    await waitForIncludes(page.locator('main'), 'because your profile asks for plain reading');
  });
  await runAxe(page, 'Journey 14 · Student reading the variant');
  await step('Read the full lesson instead', async () => {
    await page.getByRole('link', { name: 'Read the full lesson' }).click();
    await page.waitForFunction(() => !document.querySelector('main')?.textContent?.includes("You're reading the plain-language version"), null, { timeout: 8000 });
  });
});

await journey('Journey 15 · Required training: assign with a due date, the employee tests out and gets a certificate, the audit CSV shows it', async (page) => {
  await step('Administrator assigns OPS 101 to Sam Ortiz, due 1 Nov', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-admin`);
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Required training' }).click();
    await page.getByRole('combobox', { name: 'Course or program' }).selectOption({ label: 'Course · Lockout/tagout essentials' });
    await page.getByRole('radio', { name: 'Chosen people' }).check();
    await page.getByRole('checkbox', { name: /^Sam Ortiz/ }).check();
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Assign training' }) });
    await form.getByLabel('Due date').fill('2026-11-01');
    await page.getByRole('button', { name: 'Assign training' }).click();
    await page.waitForFunction(() => document.querySelectorAll('main h3').length >= 2, null, { timeout: 8000 });
  });
  await runAxe(page, 'Journey 15 · Required training admin');
  await step('Sam sees it first on Today, with its due date', async () => {
    await switchTo(page, 'Sam Ortiz');
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor();
    const required = page.locator('section', { has: page.getByRole('heading', { name: 'Required training' }) }).first();
    await waitForIncludes(required, 'Lockout/tagout essentials');
    await waitForIncludes(required, 'Nov');
  });
  await runAxe(page, 'Journey 15 · Today with required training');
  await step('Sam tests out and opens the certificate', async () => {
    await page.getByRole('link', { name: /test-out/i }).first().click();
    for (const [q, a] of [['q1', 'a'], ['q2', 'a'], ['q3', 'b'], ['q4', 'a']]) await page.locator(`input[name=question-${q}][value=${a}]`).check();
    await page.getByRole('button', { name: 'Submit' }).click();
    await waitForIncludes(page.locator('main'), 'You tested out');
    await page.getByRole('link', { name: 'View certificate' }).click();
    await waitForIncludes(page.locator('main'), 'Sam Ortiz');
    await page.getByRole('link', { name: /Download PDF/ }).waitFor();
    await page.getByRole('link', { name: /verif/i }).first().waitFor();
  });
  await runAxe(page, 'Journey 15 · Certificate');
  await step('The audit CSV shows assigned, tested out, and certificate issued for Sam', async () => {
    await switchTo(page, 'Alex Rivera');
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Compliance' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export audit trail (CSV)' }).click()]);
    const { readFile: read } = await import('node:fs/promises');
    const csv = await read(await download.path(), 'utf8');
    const sam = csv.split('\n').filter((line) => line.includes('Sam Ortiz'));
    for (const kind of ['assigned', 'tested-out', 'certificate-issued']) if (!sam.some((line) => line.includes(kind))) throw new Error(`No ${kind} event for Sam in the CSV`);
  });
});

await journey('Journey 16 · Managers: the employee opts in, the manager sees completion only, the employee opts out and the view empties', async (page) => {
  /** The people table must show completion only (D-025): no scores, percentages, attempts, or email. */
  const noPrivateData = async () => {
    const text = (await page.locator('main table').first().textContent()) ?? '';
    const found = /%|score|attempt|@|tutor/i.exec(text);
    if (found) throw new Error(`The manager's table shows "${found[0]}"`);
  };
  await step('Before Dana opts in, Sam sees only a count', async () => {
    await page.goto(`${BASE}app/team?data=mock&as=u-sam`);
    await page.getByRole('heading', { level: 1, name: "Your team's required training" }).waitFor();
    await waitForIncludes(page.locator('main'), 'chosen to share');
    if (((await page.locator('main').textContent()) ?? '').includes('Dana')) throw new Error('Dana is named before opting in');
  });
  await step('Dana turns sharing on for Sam', async () => {
    await switchTo(page, 'Dana Whitfield');
    await page.getByRole('navigation').getByRole('link', { name: 'Sharing' }).first().click();
    await page.getByRole('switch', { name: /Share with Sam Ortiz/ }).check();
    await waitForIncludes(page.locator('main'), 'Sharing since');
  });
  await runAxe(page, 'Journey 16 · Sharing on');
  await step('Sam sees Dana\'s required training and status, and nothing private', async () => {
    await switchTo(page, 'Sam Ortiz');
    await page.getByRole('navigation').getByRole('link', { name: 'Team' }).first().click();
    await waitForIncludes(page.locator('main'), 'Dana Whitfield');
    await waitForIncludes(page.locator('main'), 'Lockout/tagout essentials');
    await noPrivateData();
  });
  await runAxe(page, 'Journey 16 · Team with a sharer');
  await step('Dana turns sharing off; Sam\'s view empties', async () => {
    await switchTo(page, 'Dana Whitfield');
    await page.getByRole('navigation').getByRole('link', { name: 'Sharing' }).first().click();
    await page.getByRole('switch', { name: /Share with Sam Ortiz/ }).uncheck();
    await waitForIncludes(page.locator('main'), 'Not sharing');
    await switchTo(page, 'Sam Ortiz');
    await page.getByRole('navigation').getByRole('link', { name: 'Team' }).first().click();
    await waitForIncludes(page.locator('main'), 'chosen to share');
    if (((await page.locator('main').textContent()) ?? '').includes('Dana')) throw new Error('Dana still shown after opting out');
  });
});

await journey('Journey 18 · An instructor completes assigned required training through My training', async (page) => {
  await step('Administrator assigns OPS 101 to Dr. Amara Okafor', async () => {
    await page.goto(`${BASE}app/?data=mock&as=u-admin`);
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await page.getByRole('navigation', { name: 'Administrator navigation' }).getByRole('link', { name: 'Required training' }).click();
    await page.getByRole('combobox', { name: 'Course or program' }).selectOption({ label: 'Course · Lockout/tagout essentials' });
    await page.getByRole('radio', { name: 'Chosen people' }).check();
    await page.getByRole('checkbox', { name: /^Dr. Amara Okafor/ }).check();
    await page.getByRole('button', { name: 'Assign training' }).click();
    await waitForIncludes(page.locator('main'), 'Required training assigned.');
  });
  await step('Dr. Okafor starts the course from My training', async () => {
    await switchTo(page, 'Dr. Amara Okafor');
    await page.getByRole('navigation').getByRole('link', { name: 'My training' }).click();
    await waitForIncludes(page.locator('main'), 'Lockout/tagout essentials');
    await page.getByRole('link', { name: 'Take the course' }).click();
    await page.getByRole('heading', { level: 1, name: 'Lockout/tagout essentials' }).waitFor();
    if (!page.url().includes('/training/courses/c-ops101')) throw new Error(`Course opened outside training: ${page.url()}`);
    await page.getByRole('link', { name: 'Start lesson' }).click();
  });
  await step('Dr. Okafor completes all published lessons and opens the certificate', async () => {
    for (let i=0;i<3;i++) {
      await page.getByRole('button', { name: 'Mark lesson complete' }).click();
      await page.getByText('Lesson complete.').waitFor();
      if (i<2) await page.getByRole('link', { name: 'Next lesson', exact: true }).click();
    }
    await page.getByRole('link', { name: 'Back to course' }).click();
    await waitForIncludes(page.locator('main'), "You've completed every published lesson.");
    await page.getByRole('link', { name: 'Training' }).first().click();
    await page.getByRole('link', { name: 'View certificate' }).first().click();
    await waitForIncludes(page.locator('main'), 'Dr. Amara Okafor');
    await waitForIncludes(page.locator('main'), 'Lockout/tagout essentials');
  });
});

// ---- summary --------------------------------------------------------------------------
await browser.close();
server.close();
console.log(failures ? `\n${failures} journey(s) failed. Screenshots: reports/e2e/` : '\nAll journeys passed.');
process.exit(failures ? 1 : 0);
