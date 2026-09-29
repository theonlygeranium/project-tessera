# Build spec: Mobile lesson player with the tutor

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-080 to D-084 below are proposals. **Build is gated on the owner approving the artboards (D-082, following the D-025 precedent).** Backlog: #30 (390×844 lesson player, tutor as a bottom sheet, offline and low-bandwidth states, 44px touch targets). Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §2.6, §3 rank 10, §4.1 item 1, §6.1, §7 area 8). Depends on: `handoff/GRADEBOOK-SPEC.md` (student grades and exact what-if). Existing artboards: `design/canvas/MobileToday.dc.html` (phone Today), `design/canvas/LessonPlayer.dc.html` (desktop player).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `design/DESIGN-NOTES.md`, `design/tokens.json` and `handoff/NIGHT-2-PLAN.md` §5.4 (the tutor) are known. Where it says "as today", the existing code is the reference and must not be rewritten. `app/src/help/**` belongs to the `course-help` branch; don't edit it.

---

## 0. What this is, in one paragraph

A learner on a phone can do everything that matters in a course: open Today, read a lesson, answer checks, ask the tutor, submit an assignment, take a quiz (spec 3), and see their grades with the same numbers the desktop shows. The player is the existing React app made **phone-first at 390×844**: a single column, a compact top bar with the lesson title and progress, a bottom bar with previous, next and "Ask the tutor", and the tutor as a **bottom sheet** (half height, full height, closed) that keeps the hint-first rules (D-005) and never covers the lesson without a way back. A **data saver** mode (on automatically when the browser asks to save data) loads text first and media on request, and brief loss of connection doesn't lose a check answer or progress. Native apps and full offline downloads wait until workplace pilots show the need.

Why (gap report): mobile is a reasonable expectation but the evidence gathered is weak and mostly vendor blogs (§2.6, §3 rank 10), so the report scores it 3 × 4 = 12 and recommends a responsive learner player with the tutor and grades, validating offline need with pilots before native apps (§7 area 8). Canvas's mobile what-if grades don't work with weighted grading periods and aren't saved (§2.6, §4.1 item 1): Tessera's mobile grades use the same server engine as desktop (from `GRADEBOOK-SPEC.md`). The difference is parity and honesty rather than a separate, thinner app.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-080** | **Responsive web first; no native apps in the MVP.** The same app, with a phone layout below 600 px wide. An installable web app (manifest, icons) is later; native apps only after pilot evidence. | No new codebase; the existing routes gain phone layouts. |
| **D-081** | **The tutor is a bottom sheet on phones.** Three states: closed, half (lesson visible above, scrollable), full. It is a dialog: focus moves into it on open, Escape and a visible Close button close it, focus returns to "Ask the tutor" (D-010). Resizing is by buttons ("Expand", "Shrink") as well as dragging; drag is never the only way. The tutor's mode, hint count and visibility line are always visible at the top of the sheet (D-005). | One `BottomSheet` component in `app/src/components/`, used by the tutor and later by other panels. Reduced-motion users get no slide animation. |
| **D-082** | **Artboards first, owner approval before any build.** New artboards at 390×844: lesson reading, knowledge check answered, tutor half and full, tutor refusal (answer requested in Hints mode), assignment submit, grades with what-if, data saver, offline notice. The owner approves them as drawn or with changes (precedent D-025). | No app code for this spec starts until approval is recorded (in this spec's status line and `design/DECISIONS.md` if the owner wants a decision entry). |
| **D-083** | **Data saver and short outages, not offline mode.** Data saver: on when `Save-Data` or `navigator.connection.saveData` is set, or chosen in the learning profile; images show as a labelled placeholder with "Load image", video shows the poster, transcript and "Play video", files open the accessible formats menu. Short outages: check answers, progress and quiz responses are queued locally and retried; the learner sees "Saved on this phone, will send when you're back online". Downloading lessons for offline use is later. | Queue in IndexedDB with idempotency keys (the API supports `Idempotency-Key`, D-020). Tutor needs a connection and says so. |
| **D-084** | **Learner touch targets are 44 px everywhere on phones**, including inline links in lesson text (padding, not font size), check options, sheet controls and the bottom bar; content reflows at 320 px with no horizontal scroll except tables, which scroll in a labelled region. | Enforced by an a11y audit target at 390 and 320 widths and a Playwright check for target sizes. |

## 2. Scope

**In (MVP, one Night after artboard approval):**
1. Phone layouts for Today (align with `MobileToday.dc.html`), course home, lesson player, knowledge checks, assignment view and submit (text, file from the phone's picker, link), quiz player (spec 3; if not merged, leave a clean slot), grades (student view from `GRADEBOOK-SPEC.md`, including saved what-if), profile and accessibility settings.
2. Bottom bar: previous, next (with lesson progress), "Ask the tutor" (hidden when the tutor mode is off for the activity).
3. Tutor bottom sheet (D-081) with the existing tutor behaviour; citations open the cited block in the lesson and shrink the sheet to half.
4. Data saver (D-083) and the short-outage queue.
5. Accessible media on phones: captions default on when the learning profile says so (as today), transcript toggle, description track (spec 4) when present.
6. Performance budget: first lesson render under 2.5 s on a mid-range phone over a throttled "Fast 3G" profile in Lighthouse on the preview; JavaScript for the player route under 250 KB compressed (measured, reported).
7. Artboards and their gallery registration.

**Out (explicitly):** native apps; push notifications; offline downloads; instructor and admin phone layouts beyond "readable" (they get reflow, not a designed phone UI); background sync when the tab is closed.

**Later:** installable web app; offline lesson downloads for workplace pilots; push reminders (linked to learning-profile reminders); instructor quick grading on phone; dark and compact modes (backlog #27).

## 3. The flow (normative)

| Stage | Learner sees (artboard) | Server does | Gate |
|---|---|---|---|
| Today | Phone Today (existing artboard), tasks as cards, 44 px targets | `getToday` (as today) | None |
| Lesson | `MobileLesson`: top bar (back, title, 3 of 7), blocks in one column, bottom bar | `getStudentLesson` (as today) | Published only |
| Check | Options as full-width 44 px rows (real radio inputs), "Check answer", feedback inline | `answerCheck` (queued if offline) | None |
| Tutor | "Ask the tutor" → sheet at half with mode line ("Hints only · 1 of 3 hints used · Your instructor sees a summary, never this chat") | `startTutorSession`, `sendTutorMessage` (as today) | Tutor mode for the activity (D-005) |
| Refusal | Asking for the answer in Hints mode: the tutor explains it can give a hint and offers one | as today | D-005 |
| Submit | Assignment page: instructions, text box or file picker, "Submit", confirmation with time | `submit` | As today |
| Grades | `MobileGrades`: course total with "How this was calculated" (from the gradebook engine), items list, "What if" editor that saves | gradebook student endpoints (`GRADEBOOK-SPEC.md`) | Released grades only |
| Data saver | Placeholders with "Load image", video poster with "Play video (12 MB)" when size is known | None | Setting or browser signal |
| Offline | Top notice: "You're offline. Your answers are saved on this phone." Tutor sheet: "The tutor needs a connection." | Queue flush on reconnect | None |

## 4. Domain model (`shared/domain.ts`)

Small additions only, at the end of the relevant section:

```ts
// ---- Mobile player (D-080 to D-084) ----
/** Learning profile addition (D-004 allows device as a personalization variable). */
export interface DevicePreferences { dataSaver: 'auto' | 'on' | 'off' }

/** Client-side only (IndexedDB); documented here so the queue and the API agree. */
export interface QueuedWrite {
  key: string;                                 // Idempotency-Key
  operation: 'answerCheck' | 'setLessonProgress' | 'saveQuizResponse';
  input: unknown; queuedAt: Timestamp; attempts: number;
}
```

Also:
- `LearningProfile.device?: DevicePreferences` (optional; absent = `auto`).
- No new server types for the tutor or grades; the mobile UI uses existing and gradebook payloads.

## 5. API (`shared/api.ts`)

No new operations. Changes:
- `answerCheck`, `setLessonProgress` and (spec 3) `saveQuizResponse` accept and honour `Idempotency-Key` for browser calls (today it applies to creates; extend to these three, small addition in the dispatcher).
- `getStudentLesson` returns media byte sizes where known (`FileRecord` size for uploads) so data saver can show them; additive optional field.

## 6. Service logic

### 6.1 Layout (`app/src/features/student/`, `app/src/components/`)
- Breakpoint: `max-width: 599px` = phone layout; tokens for spacing and type; no hard-coded colours.
- Lesson blocks: tables in a horizontally scrollable region with `role="region"`, `aria-label`, and `tabindex="0"`; images full width with alt as today; scenario blocks stack choices as 44 px buttons; documents collapse sections under headings (buttons with `aria-expanded`).
- Bottom bar is fixed; it never hides focused content (scroll padding equal to its height).

### 6.2 Bottom sheet (`app/src/components/BottomSheet/`)
- Props: `open`, `size: 'half' | 'full'`, `onClose`, `labelledBy`, `returnFocusRef`. The sheet is a modal dialog on phones at both half and full size (simpler and predictable for screen readers); at half the lesson stays visible but inert behind a scrim, and tapping a citation shrinks the sheet and scrolls the lesson (the sheet closes to reveal the block, with a "Back to the tutor" chip).
- Respects `prefers-reduced-motion`; supports the on-screen keyboard (input stays visible with `visualViewport`).

### 6.3 Data saver and queue
- Data saver resolution: profile `on`/`off` wins; `auto` follows the browser signal.
- Queue: on a network failure (not a 4xx), store `QueuedWrite` and show the notice; retry on `online` events and every 30 s; drop after 24 h with a visible message listing what couldn't be sent; 4xx responses are shown, never retried.

### 6.4 Performance
- Route-level code splitting for the player; images lazy with explicit dimensions; fonts subset (as today) and `font-display: swap`.

## 7. AI tasks

None new. The tutor is unchanged (D-005); the sheet is presentation only.

## 8. Worker, data, app

- **Migration:** none expected (the device preference lives in the learning profile JSON). If the profile is stored in typed columns rather than JSON, a nullable column in a new migration, next free at build time (>=0009), applied to preview D1 first.
- **Artboards (D-082):** `design/canvas/MobileLesson.dc.html`, `MobileTutorSheet.dc.html` (half, full, refusal), `MobileGrades.dc.html` (total, explanation, what-if), `MobileStates.dc.html` (data saver, offline, submit confirmation). Each 390×844, learner row (y = 0), 80 px apart, registered in `design/canvas/canvas.json` and `SCREENS` in `tools/build_docs.py`, built with `tools/build_docs.py`, audited with `npm run a11y`. `canvas.json` also changes on `night4`: add the boards after Night 4 merges, or expect a merge in that file. Sync the owner's design canvas mirror or say it's behind (D-009).
- **App:** phone styles in existing feature CSS modules; `BottomSheet` and `DataSaverImage`, `DataSaverVideo` components with stories; `useOfflineQueue` hook; `TutorPanel` gets a sheet presentation on phones (not a rewrite).
- **Checks:** add 390×844 and 320-wide targets for the student routes and new stories to `tools/a11y_audit.mjs` (small, added at the end); Playwright mobile viewport projects for the journeys.
- **Docs:** `mintlify/product/mobile.mdx`; docs-sync captures the new artboards.

## 9. Governance and policy (must-haves)
- D-005 on the sheet: mode line always visible; the answer key is never a source; the instructor sees a summary, never the chat (as today).
- D-004: device is an evidence-based personalization variable; data saver is a preference with an Undo (it's a profile setting).
- D-006 and D-018: tutor messages use the Marginalia markup; no sparkles or gradients; the tutor's name and sources show in each message.
- D-017: no edge stripes on the sheet, cards or current-lesson markers; state by fill, weight, text or markers.
- D-010: 44 px targets (D-084), visible focus, focus return, 320 px reflow, no information by colour alone.
- Privacy: queued writes stay on the device only until sent; nothing about a learner is stored in the queue beyond the operation input.

## 10. Tests and definition of done
1. **Unit:** data saver resolution; queue behaviour (network failure queued, 4xx not retried, idempotent resend, 24 h drop); bottom sheet focus management and Escape.
2. **e2e** (mock, Playwright mobile viewport 390×844): Journey 21+ (claimed at build time): (a) Priya opens Today, a lesson, answers a check, opens the tutor at half, asks for the answer in Hints mode and gets a hint, taps a citation, returns to the tutor, closes it and focus is on "Ask the tutor"; (b) goes offline (Playwright), answers a check, sees the saved-on-phone notice, reconnects, answer appears as sent; (c) opens grades, sees the explanation, saves a what-if (after the gradebook lands).
3. **a11y:** zero violations at 390 and 320 widths for student routes, new artboards and stories; target-size check passes; VoiceOver on iOS spot check of the tutor sheet recorded in the QA log.
4. **Performance:** Lighthouse mobile on the preview for the lesson route; report the numbers against the budget in §2.
5. **Definition of done:** owner-approved artboards; CLAUDE.md full lane; owner compares the app to the artboards on a real phone before merge.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `learner/mobile-artboards` in `../tessera-learner-mobile-art` (Claude-led: subjective design direction the owner must see): the four artboards, gallery registration, build, audit; **stop for owner approval.**
2. `learner/mobile-player`: phone layouts for Today, course, lesson, checks, assignment; bottom bar.
3. `learner/mobile-tutor`: `BottomSheet`, tutor sheet presentation, citation behaviour (Astra review for focus handling).
4. `learner/mobile-data`: data saver, offline queue, idempotency on the three routes.
5. `learner/mobile-grades`: grades and what-if (after `GRADEBOOK-SPEC.md` lands), quiz player slot (after spec 3).
6. Checks, docs, performance report.

Each brief: the sections above, the approved artboard files, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.
