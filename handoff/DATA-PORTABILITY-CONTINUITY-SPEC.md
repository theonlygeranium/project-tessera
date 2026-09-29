# Build spec: Data portability, continuity and security posture

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-075 to D-079 below are proposals; they extend D-012, D-014 and D-019 and supersede none. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §1, §2.8, §3 rank 8, §4.1 item 10, §4.4 item 9, §6.1, §6.2 item 6, §6.3, §7 area 7). Related: `handoff/GRADEBOOK-SPEC.md` (gradebook export shape), `handoff/INTEROP-LTI-SPEC.md` (OneRoster format; institutional SSO is decided there as D-052, approved by owner 2026-09-28, so it is not repeated here), `handoff/AUTHORING-AT-SCALE-SPEC.md` (QTI). Artboard: none required.*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md` and `handoff/NIGHT-3-PLAN.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

"Your data, always" made concrete. **Exports:** an administrator can run a full institution export that produces one archive with every course as Common Cartridge 1.3 (quizzes as QTI 2.1) plus a lossless Tessera JSON, gradebooks as CSV and JSON, rosters as OneRoster 1.2 CSV, completion events, certificates, accessibility reports and the admin audit trail; an instructor can export their own course the same way and re-import the JSON through the existing `importCourse`. **Continuity:** a **read-only mode** an administrator can switch on (or that turns on automatically when writes fail), in which learners and instructors can still read content, their grades and gradebooks while every write is refused with a plain notice; plus a nightly **continuity snapshot** of gradebooks and rosters to R2 that a minimal route can serve even when D1 is unavailable. **Security posture:** a documented security overview, an internal control matrix mapped to the SOC 2 Trust Services Criteria (security, availability, confidentiality), backup and restore drills, and a readiness path to a SOC 2 Type I, without claiming any certification.

Why (gap report): the Canvas intrusions on April 29 and May 7, 2026 took Canvas offline during finals, and customers' top continuity request was gradebook access (§1, §4.1 item 10); after the breach Instructure is adding bulk gradebook and roster exports but lists read-only outage access and offline grading as uncommitted (§2.8); D2L credits tenant isolation and egress monitoring (its claim, not verified, §2.8); security attestations such as SOC 2 are procurement table stakes Tessera lacks (§6.3). The report scores this area 3 × 5 = 15 (§7). Tessera's difference is that continuity is designed in (read-only mode and snapshots) rather than promised, exports are open formats an institution can take anywhere, and the audit trail it already has becomes evidence.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-075** | **Open-format exports, institution and course.** Institution export (admin): Common Cartridge 1.3 per course with QTI 2.1 for quizzes, a lossless Tessera JSON per course, gradebook CSV and JSON (the engine's values and the policy that produced them), OneRoster 1.2 CSV for people and enrolments, completion events CSV, certificates CSV, access reports CSV, admin audit CSV, a `manifest.json` with counts and SHA-256 checksums. Course export (instructor of the course): the course's CC, JSON and gradebook. Exports are background jobs stored in R2 for 7 days behind a signed, expiring link; every export is audited. | Round trip test: Tessera JSON → `importCourse` recreates the same outline and blocks. CC import into another LMS is verified manually on a sandbox. AI provenance and draft state are preserved in the JSON; in CC, kept AI blocks carry the "Drafted with AI · edited by …" line as text. |
| **D-076** | **Read-only mode.** Institution flag with three states: off, on (manual, with a message), automatic (entered when D1 writes fail repeatedly; exits only by an administrator). In read-only mode every mutating route returns a `read-only` error except administrator sign-in and the flag itself; the app shows a notice with the message; quiz attempts in progress are paused with their deadline extended by the outage length. | Enforcement sits in the Worker's route dispatcher (one check), not in each service. |
| **D-077** | **Continuity snapshot.** Nightly, and on entering read-only mode, write per-course gradebook (released grades only for students' own view; full for staff) and roster JSON to R2. A `/continuity/*` route, behind Cloudflare Access like `/app`, serves a plain HTML page per course from R2 when D1 is unavailable: staff see their gradebooks, students see their released grades. | Separate from the export archive; no D1 read on that route. Snapshot retention 14 days. |
| **D-078** | **Security posture: document, map, then attest.** Publish a security overview on the docs site (architecture at a high level, data locations, encryption in transit and at rest as provided by the platform, access control, backups, incident contact) that states only what is true today. Keep an internal control matrix mapped to SOC 2 TSC in the private repo. SOC 2 Type I readiness is a path, not a claim; engaging an auditor is an owner decision. | Public text passes the Mintlify rules (no internal tooling, agents or vendor internals beyond what a security page must name, subject to owner review). |
| **D-079** | **Backups and restore drills.** Rely on D1 Time Travel for point-in-time restore (retention per the current Cloudflare plan; verify at build time and record it), plus a weekly logical export of D1 to R2 kept 12 weeks. A restore drill each quarter restores the latest weekly export into a scratch D1 database and runs the repo contract checks against it; results are logged. Production restores are the owner's call. | The drill never touches `tessera-prod` or `tessera-preview`; it uses a separate scratch database the owner approves creating. |

## 2. Scope

**In (MVP, one Night):**
1. Export job runner (reuse the generation job and workflow machinery), R2 storage with signed links, expiry, audit event per export.
2. Writers: Tessera JSON (lossless), Common Cartridge 1.3 (web content for lessons as accessible HTML, assignments as CC assignment extension where supported, QTI 2.1 via spec 3's writer), gradebook CSV and JSON (via `GRADEBOOK-SPEC.md`'s engine; until then the existing `exportGradebook` CSV), OneRoster 1.2 CSV, events, certificates, access reports, audit.
3. Admin Data page: "Export everything", export history, download links, checksums; instructor "Export this course".
4. Read-only mode flag, dispatcher enforcement, notices, quiz pause, automatic entry on write failures.
5. Continuity snapshots and the `/continuity/*` route.
6. Security overview page (docs), control matrix (private repo, `design/security/CONTROLS.md`), incident response runbook (`design/security/INCIDENT-RUNBOOK.md`), backup and drill procedure with a first drill.
7. Admin audit trail: where not already recorded, add append-only admin events for policy changes, role changes, exports, read-only toggles and API token creation and revocation.

**Out (explicitly):** SOC 2 audit itself; penetration test (owner decision); customer-managed keys; offline grading; data residency choices; SSO (decided in spec 1, D-052).

**Later:** Common Cartridge import (spec 3 later list); scheduled automatic exports to an institution's own storage; SCIM deprovisioning; egress monitoring beyond platform features; a status page.

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Export (admin) | Admin → Data → "Export everything": what's included, estimated size, "Start export". Progress. "Ready: download (expires in 7 days) · checksums" | `startInstitutionExport` → job → writers → R2 → manifest | Admin; confirmation dialog; audit event |
| Export (course) | Instructor → Course settings → "Export this course" (CC, JSON, gradebook) | `startCourseExport` | Instructor of the course |
| Re-import | Admin → Courses → Import → upload Tessera JSON | `importCourse` (as today) | Admin |
| Read-only on | Admin → Data → Continuity → "Turn on read-only mode" with a message ("We're moving to a new server tonight") | flag set; dispatcher refuses writes | Admin; audit event |
| Read-only experience | Everyone: a notice at the top of every page with the message; edit buttons disabled with a reason; quizzes paused | `read-only` errors mapped to the notice | None |
| Automatic entry | When write failures exceed 5 in 60 seconds across requests, mode becomes automatic; admins see why | Worker counter (Durable Object or D1-independent KV; choose at build with owner OK for any new binding) | Exit only by admin |
| Snapshot | Staff and students can open "Continuity view" from the notice while D1 is down | `/continuity/course/:courseId` from R2 | Access (as `/app`) plus the snapshot's role map |
| Posture | Anyone reads the security overview on the docs site; admins download the export of the audit trail | Docs build | Owner reviews the page |

## 4. Domain model (`shared/domain.ts`)

Added at the end of the file (small, added at the end of the section):

```ts
// ---- Data portability and continuity (D-075 to D-079) ----
export type ExportScope = { kind: 'institution' } | { kind: 'course'; courseId: Id };
export type ExportPart =
  | 'course-cc' | 'course-json' | 'gradebook-csv' | 'gradebook-json' | 'oneroster'
  | 'completion-events' | 'certificates' | 'access-reports' | 'admin-audit';
export interface ExportJob {
  id: Id; scope: ExportScope; parts: ExportPart[];
  state: 'queued' | 'running' | 'ready' | 'failed' | 'expired';
  requestedBy: Id; requestedAt: Timestamp; finishedAt: Timestamp | null; expiresAt: Timestamp | null;
  progress: { done: number; total: number };
  result: { r2Key: string; bytes: number; manifestSha256: string } | null;
  error: string | null;
}
export interface ExportManifest {
  exportId: Id; generatedAt: Timestamp; tesseraVersion: string; scope: ExportScope;
  files: { path: string; part: ExportPart; courseId: Id | null; rows: number | null; sha256: string }[];
  formats: { commonCartridge: '1.3'; qti: '2.1'; oneRoster: '1.2'; tesseraJson: number };
}

export type ReadOnlyState = 'off' | 'on' | 'automatic';
export interface ContinuityStatus {
  readOnly: ReadOnlyState; message: string; since: Timestamp | null; by: Id | null;
  reason: string | null;                       // automatic: "Database writes failed 5 times in 60 seconds"
  lastSnapshotAt: Timestamp | null;
}

export type AdminAuditKind =
  | 'policy-changed' | 'role-changed' | 'user-created' | 'user-deactivated'
  | 'export-started' | 'export-downloaded' | 'read-only-changed'
  | 'token-created' | 'token-revoked' | 'integration-changed' | 'ai-governance-changed';
/** Append-only (the table refuses updates), like completion events. */
export interface AdminAuditEvent { id: Id; at: Timestamp; actorId: Id | null; kind: AdminAuditKind; subject: string; detail: string; requestId: string | null }

export interface RestoreDrill { id: Id; at: Timestamp; source: string; tablesChecked: number; contractPassed: boolean; notes: string; by: string }
```

Also:
- `Institution.continuity?: ContinuityStatus` (nullable).
- The API error union gains `'read-only'` (small, added at the end).

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `startInstitutionExport` | `POST /exports` | ADMIN · `people:write` | `{ parts? }` default all |
| `startCourseExport` | `POST /courses/:courseId/exports` | INSTRUCTOR · `courses:read` | parts limited to course-cc, course-json, gradebook-* |
| `listExports` / `getExport` | `GET /exports`, `GET /exports/:exportId` | ADMIN (all) or requester · `people:read` | |
| `downloadExport` | `GET /exports/:exportId/download` | requester or ADMIN | 302 to a signed R2 URL valid 10 minutes; audit event |
| `getContinuity` | `GET /institution/continuity` | signed-in | message and state for the notice |
| `setReadOnly` | `PUT /institution/continuity` | ADMIN · `people:write` | allowed in read-only mode |
| `listAdminAudit` / `exportAdminAudit` | `GET /audit`, `GET /audit/export` | ADMIN · `people:read` | |
| `GET /continuity/course/:courseId` | Worker route, not the API | Access-protected | serves R2 snapshot HTML |

## 6. Service logic

### 6.1 Writers (`shared/service/export/`)
- Tessera JSON: the `importCourse` input shape extended with provenance, `aiState`, template keys, outcomes, links, assignments (with quiz settings and bank snapshots), variants; versioned with `tesseraJson: 1`. Never includes student data.
- Common Cartridge 1.3: `imsmanifest.xml` with organizations = modules → lessons; each lesson as one accessible HTML page generated from blocks (headings, paragraphs, tables with header rows, images with alt, math as MathML, video as a link plus captions file and transcript); checks as ungraded QTI; quizzes as QTI assessments. Files referenced from R2 are copied in.
- Gradebook: per course, rows = students, columns = gradebook items, with the policy summary in a sidecar JSON so the numbers can be recomputed; only what the engine calls official.
- OneRoster: orgs, academicSessions (from course term), courses, classes, users, enrollments; roles mapped back (instructor → teacher, student → student, administrator → administrator).
- Checksums: SHA-256 per file and for the manifest.

### 6.2 Read-only enforcement (`worker/api/` dispatcher)
- One check before dispatch: if `continuity.readOnly !== 'off'` and the route's method is not GET and the route isn't in the allow list (`setReadOnly`, `signIn`, `signOut`, `getSession`), return `read-only` with the message.
- The automatic trigger counts write failures in a small store that doesn't depend on D1 (owner approves the binding); if not approved, automatic mode is out and only manual mode ships.
- Quiz pause: attempts in progress record `pausedAt`; on exit, deadlines extend by the paused duration.

### 6.3 Snapshots
- Nightly Cron and on entering read-only: for each active course, write `snapshots/<date>/<courseId>/staff.json` and per-student released-grade JSON, plus a rendered HTML page. The `/continuity/*` route reads only R2 and the Access JWT's email; it maps email to a user through a snapshot of users written at the same time.

### 6.4 Audit
- Add `admin_audit` writes at the service points named in `AdminAuditKind`. The table refuses updates and deletes (trigger, like completion events).

### 6.5 Backups and drills
- Weekly logical export via the Worker (table by table, JSON lines) to R2 `backups/<date>/`; 12-week retention with a deletion job whose delete condition is the date predicate (Astra review).
- Drill script `tools/restore_drill.mjs`: imports the latest backup into a scratch D1 (created only with owner OK), runs the repo contract against it, writes a `RestoreDrill` log line to `design/security/DRILLS.md`.

## 7. AI tasks

None.

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `export_jobs`, `admin_audit` (with update and delete refusal triggers), nullable `institution.continuity` JSON, nullable `quiz_attempts.paused_at` if spec 3 has landed. Apply to preview D1 first; production with the owner's OK and a restore point.
- **Worker:** export workflow; nightly snapshot and weekly backup Crons; `/continuity/*` handler; dispatcher check. Any new binding (KV or Durable Object for the automatic trigger, scratch D1 for drills) needs the owner's OK.
- **App:** `app/src/features/admin/DataPage.tsx` (exports, continuity, audit), instructor course export in course settings, global read-only notice in the shell (small addition in `app/src/shell/**`).
- **Repo documents (private):** `design/security/CONTROLS.md` (TSC mapping: control, owner, evidence, status), `INCIDENT-RUNBOOK.md`, `DRILLS.md`. Nothing confidential under `docs/` (D-012).
- **Docs:** `mintlify/security.mdx` (overview; owner-reviewed), `mintlify/product/data-export.mdx`.
- **Mock mode:** export of the STAT 110 course produces a real zip from mock data; read-only mode can be toggled by `u-admin`.

## 9. Governance and policy (must-haves)
- Exports contain personal data: admin-only for institution scope; signed links expire; downloads audited; no export link is ever emailed or posted by Tessera.
- Content remains the institution's and instructor's; AI provenance travels with it.
- Read-only never loses work: forms show "Not saved: Tessera is read-only right now" and keep the text on the page.
- Security page states only verified facts; no certification claims; owner signs off.
- Deletion code (export expiry, backup retention) conditions deletes on the age predicate and gets Astra review.
- Accessibility: export and continuity pages meet WCAG 2.2 AA; the read-only notice is a status region announced once, not on every navigation; CC HTML output is born accessible.

## 10. Tests and definition of done
1. **Unit:** Tessera JSON round trip through `importCourse`; CC manifest validity against the CC 1.3 schema (bundle the XSD in tests); QTI output parses with spec 3's importer; gradebook export matches the engine; OneRoster columns; checksums; dispatcher refuses writes in read-only mode and allows the allow list; quiz deadline extension; audit table refuses update and delete; snapshot contains released grades only for students.
2. **Repo contract:** new methods; both repos pass.
3. **e2e** (mock): Journey 21+ (claimed at build time): (a) admin exports everything, downloads, manifest counts match; (b) read-only on: Priya can open a lesson and her grades, Dr. Okafor's save shows the read-only notice and keeps the text; admin turns it off.
4. **Manual:** import the exported CC into a sandbox LMS the owner controls and record what came across.
5. **Drill:** first restore drill logged.
6. **a11y:** zero violations with new routes.
7. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; owner reviews the security page; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
1. `data/audit` in `../tessera-data-audit`: admin audit table and writes (small, touches many services: keep each edit additive).
2. `data/export`: job runner, JSON and gradebook writers, OneRoster writer, Data page.
3. `data/cc`: Common Cartridge and QTI writers (after spec 3's QTI writer, or a minimal one here that spec 3 adopts).
4. `data/continuity`: read-only mode, dispatcher, notices, snapshots, continuity route (Astra review; Grok second review: it's a global write gate).
5. `data/posture` (Claude-led, owner-reviewed): security page, control matrix, runbook, backup job, first drill.

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.
