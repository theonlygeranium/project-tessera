# Night 1 live QA (2026-09-27)

Claude walked every persona in the in-app browser against the real stack (`wrangler dev`, local D1, live Palmyra-X6), at 1280 px and at phone width (375 px). The owner reported two issues from the preview (NQ-02 and D-017). Status: **open** until the patch lanes land and Claude re-verifies.

| ID | Sev | Persona / area | Finding | Owner |
|---|---|---|---|---|
| NQ-01 | P0 | All · Worker | Every deep link or reload under `/app/` returned 200 with an **empty body** (blank page): the SPA fallback fetched `/app/index.html`, which Cloudflare assets redirect to `/app/`. | Claude, **fixed** (fetch `/app/`; test now uses a realistic assets fake) |
| NQ-02 | P0 | Student · course home | "Start lesson" / "Resume" button text is invisible: accent text on accent fill (owner's screenshot). | Lane G patch |
| NQ-03 | P0 | Student · announcements | A published AI-assisted announcement shows the instructor's **private prompt** as its source line, plus the jargon "· kept". Students should see "Drafted with AI · edited by Dr. Okafor". | Claude (service summary) + lane G patch (display) + lane E patch (instructor display) |
| NQ-04 | P1 | All · rail | Colored edge stripe on the current item (D-017). Replace with **option B, lifted tile** (owner's choice). | Claude (components) |
| NQ-05 | P1 | All · TopBar | Page `h1` (19 px) is smaller than section `h2`s (26 px); the boxed header reads as a card, not a title. | Claude (component) |
| NQ-06 | P1 | All · rail | The persona footer ("Switch persona") is clipped or pushed off-screen at desktop heights. | Claude (shell) |
| NQ-07 | P1 | All · phone | The rail stack uses ~240 px before content; nav row shows a scrollbar and cuts off Profile. | Claude (shell + component) |
| NQ-08 | P1 | Instructor · outline | Outline editing is a wall of always-open forms (rename fields, add-lesson forms, delete buttons for every module and lesson) with misaligned buttons and a full-width "Delete module" bar. | Lane E patch |
| NQ-09 | P1 | Instructor · lesson editor | Publish readiness is at the bottom of a long page; status chip stretches full width; progress label duplicated ("AI blocks kept" + "0 of 1 AI blocks kept"). | Lane E patch |
| NQ-10 | P1 | Instructor + builder | Primary buttons stretch to full container width (Save details, Save changes, Publish, Save course home, Draft with AI). | Lane E patch, Claude (builder) |
| NQ-11 | P2 | Instructor · workspace | TopBar actions duplicate the rail (Build with AI, Announcements, Roster). Outcome "Remove" buttons sit above their inputs. | Lane E patch |
| NQ-12 | P2 | Instructor · announcements | "Pinned" shows twice per card. | Lane E patch (also lane G) |
| NQ-13 | P2 | Instructor | "1 AI drafts to review" (plural); roster repeats "Lessons completed" on every row. | Lane E patch |
| NQ-14 | P2 | Student · Today | Announcements print their full body; should be a preview with a link. The weekly ring is empty with its value in small monospace off to the side. | Lane G patch (preview), Claude (ring) |
| NQ-15 | P2 | Student | Course cards say "Not started" while a lesson is in progress. | Lane G patch |
| NQ-16 | P2 | Admin · people | Role dropdowns make rows uneven and misaligned; the table caption bar duplicates the "Everyone" heading. | Lane D patch |
| NQ-17 | P2 | Admin · courses | Placeholders ("DL 101", "Data Literacy 101", "Fall 2026") read as filled values. | Lane D patch |
| NQ-18 | P2 | Admin · policy | Internal decision codes ("(D-005)") appear in user-facing copy. Remove from all UI copy. | Lane D patch (all areas checked) |
| NQ-19 | P3 | Admin · overview | Seven stat tiles wrap 5 + 2. | Lane D patch |

Verified working during QA: persona sign-in and switching; administrator setup with accent (Blue applied app-wide); course creation, instructor assignment, enrollment; AI policy; builder brief/outline/draft on live Palmyra (4 s / 7 s / 6 lessons in 32 s); publish gate; AI announcement draft on Palmyra (3.0 s); roster; onboarding → Today; lesson checks and completion (earlier pass).
