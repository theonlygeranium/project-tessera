# Build spec: Interoperability (LTI 1.3 Advantage, rosters, grade passback, SCORM/cmi5/xAPI)

*Status: approved by owner for build planning (2026-09-28); D-045, D-046, D-048 and D-052 approved by owner 2026-09-28 (recorded in `design/DECISIONS.md`); D-047 and D-049 to D-051 are still proposals. D-045, D-046 and D-052 supersede parts of D-014, D-020 and D-021. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §2.5, §3 rank 2, §4.1 item 9, §6.1, §7 area 1). Backlog: #26 (integration setup and sync-error resolution), principle #13. Depends on: `handoff/GRADEBOOK-SPEC.md` (grade engine and release state) for passback. Artboards: none yet (see §8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md` and `handoff/NIGHT-3-PLAN.md` are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

Tessera becomes an **LTI 1.3 tool** that an institution can add to Canvas, Brightspace, Moodle or Blackboard with **dynamic registration**, so an instructor can place a Tessera course, lesson or assignment inside their existing LMS course (**Deep Linking 2.0**), learners launch into it with no second sign-in, rosters come across through **NRPS**, and released Tessera grades flow back to the LMS gradebook through **AGS**. For institutions that run Tessera directly, an administrator can import a **OneRoster 1.2 CSV** roster with a dry run before anything changes. For workplace content, an instructor can upload a **SCORM 1.2 or cmi5** package as a lesson block; Tessera plays it in an isolated frame, records completion and score (cmi5 statements land in a small xAPI store), and counts it toward lesson and required-training completion. Every sync is observable: an **Integrations** page shows health, each error in plain language with a resolution and a retry, which is what backlog #26 asks for.

Why this and why now (gap report): integration is buyers' third criterion at 59%, above analytics and AI (§1, §7 area 1); only 15% of organizations say their L&D systems are well integrated (§3 rank 2); 1EdTech deprecated LTI 1.1 and the ecosystem is moving to 1.3 only, with dynamic registration documented for Canvas and Moodle (§2.5); Banner passback fails for many opaque reasons, so a pre-flight and a clear error report are the best practice (§2.5, §4.1 item 9); cmi5 support is uneven and Cornerstone users say xAPI results report only "completed" (§2.5). The differentiator is not the standards themselves (they are table stakes, §6.3) but **recoverable sync**: every failure names its cause and its fix, and nothing is deleted by a sync. It also lets Tessera run *inside* an incumbent LMS (accessibility, syllabus-to-course) before it asks to replace one (§7 area 1).

## 1. Decisions (proposed 2026-09-28; D-045, D-046, D-048 and D-052 approved by owner 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-045** | *Approved by owner 2026-09-28.* **Identity v2: one Tessera user, several linked identities.** Supersedes D-021's "Cloudflare Access is the identity provider" and the sign-in line of D-014. Access (email) stays one identity; an LTI identity (`iss`, `sub`) is another. Tessera still stores no passwords. | New `user_identities` table. `worker/identity/` resolves a request to a user from either an Access JWT (as today) or a Tessera tool session (D-046). The persona picker and "View as" stay as in D-021. |
| **D-046** | *Approved by owner 2026-09-28.* **`/lti/*` and `/embed/*` sit outside Cloudflare Access**, protected by LTI message verification (platform JWKS, `nonce`, `state`, `aud`, deployment id). A verified launch mints a **Tessera tool session**: a short-lived bearer token held in page memory (not a URL, not local storage), with a partitioned (`Partitioned; SameSite=None; Secure; HttpOnly`) cookie as fallback. Amends D-014 (Access guards `/app`) and D-020 (the API accepts an Access JWT or a token): the API accepts a third credential, the tool session, limited to the launched course. Needs an Access bypass rule for `/lti/*` and `/embed/*` on production and previews: a Cloudflare Access change, so the owner's explicit OK (PARALLEL-AGENTS §6). Approving this decision does not approve the Access change itself; that still needs the owner's OK when it is made. `/app/*` stays behind Access. The embed shell is the same React app mounted at `/embed/` with the global rail hidden. |
| **D-047** | **Tool first.** MVP is LTI 1.3 Core + Deep Linking 2.0 + AGS (line items and scores) + NRPS + dynamic registration, aiming at 1EdTech certification later. Tessera as an LTI *platform* (hosting outside tools) is out. | §2 scope; certification is a later milestone that needs the owner (membership cost). |
| **D-048** | *Approved by owner 2026-09-28.* **Provisioning and linking rules.** A first launch provisions a user keyed by (`platformId`, `sub`), never by email alone. Email only *suggests* a link to an existing Tessera user; an administrator confirms it. LIS roles map to Tessera roles: `Instructor`, `TeachingAssistant`, `ContentDeveloper` → instructor for that course; `Learner` → student; `Administrator` (institution role) → no automatic admin. | Prevents account takeover by a platform that asserts someone else's email. TA gets instructor rights only in the linked course; there is no TA role (the role union is unchanged). |
| **D-049** | **SIS rostering MVP is OneRoster 1.2 CSV** (zip upload with dry run). OneRoster REST, Banner/Colleague direct, and scheduled SFTP pickup are later. | Reuses the change-set pattern from templates (preview → hash → apply). Deactivates, never deletes. Coexists with `importUsers` (as today). |
| **D-050** | **SCORM 1.2 and cmi5 as a `package` block**, played from an **isolated content origin** in a sandboxed iframe, with a SCORM API bridge over `postMessage`. cmi5 statements go to a minimal xAPI statement store in D1. SCORM 2004 and a general-purpose LRS are later. | A second hostname (for example `content.tessera.edstratumlabs.ai`) is a DNS and Worker route change: owner OK. Until approved, packages play only on previews and local dev from a path prefix with a strict CSP, and the spec treats that as not production-ready. |
| **D-051** | **Grade passback only for released grades.** AGS publishes a score when Tessera releases a grade (`Grade.releasedAt`), using the gradebook engine's value and `scoreMaximum` from the assignment. Unreleased, excused or held grades are never sent. SIS final-grade submission (Banner-style) is later and gets the pre-flight in `GRADEBOOK-SPEC.md`. | `ScorePublication` queue with retries and a visible error per student. The LMS stays the gradebook of record when Tessera runs as a tool. |
| **D-052** | *Approved by owner 2026-09-28.* **Institutional SSO for direct use stays in Cloudflare Access** (SAML or OIDC identity provider configured per institution in Access, as D-021 allowed), plus **just-in-time provisioning** for allow-listed email domains with a default role of student. Supersedes D-021's invite-only rule for those domains. Tessera does not implement SAML itself in the MVP. | Institution setting `sso: { domains: string[]; defaultRole: 'student' }`. The first Access sign-in from an allow-listed domain creates the user; instructors and admins are still invited or promoted by an admin. SCIM is later (spec 9 covers HRIS). |

## 2. Scope

**In (MVP, one Night plus a certification follow-up):**
1. Platform registration: dynamic registration (Canvas and Moodle flows per the gap report §2.5 links) and a manual form (issuer, client id, deployment ids, auth login URL, token URL, JWKS URL). Tessera's own JWKS, with key rotation.
2. OIDC third-party login and launch (`LtiResourceLinkRequest`), with verification per D-046, provisioning per D-048, and first-launch course linking.
3. Deep Linking 2.0: an instructor picks a Tessera course, lesson or assignment; assignments carry a line item (`scoreMaximum` = points, `resourceId` = assignment id).
4. NRPS roster sync on demand and nightly, with a diff preview when members would be deactivated.
5. AGS: line item creation for deep-linked assignments; score publication on release (D-051); retries and error report.
6. OneRoster 1.2 CSV import with dry run, apply by hash, and an import history.
7. `package` block: SCORM 1.2 and cmi5 upload, validation, playback, runtime data, completion and score into progress and required-training completion.
8. Integrations admin page (backlog #26): per-integration health, last sync, counts, errors with resolution text and retry; per-course "LMS link" panel for instructors.
9. Tool session, embed shell, SSO JIT provisioning (D-052), audit events for every link, sync and passback.

**Out (explicitly):** Tessera as an LTI platform; LTI 1.1; Caliper; SCORM 2004; a general LRS; Common Cartridge import (spec 3 and spec 7); SIS final-grade submit; SCIM.

**Later:** 1EdTech certification; OneRoster REST; Banner/Colleague final grades with pre-flight; scheduled SFTP roster pickup; package scores as gradebook columns (via the gradebook's external score source, `GRADEBOOK-SPEC.md`); LTI Proctoring; submission review service.

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Register | Admin: Integrations → "Add an LMS". Copies the registration URL into the LMS, or fills the manual form. Sees the scopes Tessera will request in plain language ("read your course roster", "send released grades"), following Brightspace's practice (gap report §2.5). | `startLtiRegistration` issues a one-time registration token; the LMS calls `/lti/register`; Tessera stores the platform `pending` | Admin activates the platform after reviewing its issuer and scopes |
| Place (Deep Linking) | Instructor in their LMS clicks "Add Tessera content": a compact picker of their Tessera courses, lessons and assignments | `/lti/launch` with `LtiDeepLinkingRequest` → picker in the embed shell → signed `LtiDeepLinkingResponse` | Only content the instructor teaches; only published lessons for learners at launch time |
| First launch in a context | Instructor: "Link this LMS course to a Tessera course: create new · choose existing". Learners in an unlinked context see "Your instructor hasn't finished setting this up." | Creates `LtiContext`, optionally a course, enrols the instructor | Only an LMS instructor can link |
| Launch | Learner lands in the lesson or assignment inside the LMS frame, signed in, with a "Open in a new tab" link | Verify, resolve identity (D-048), enrol from the launch claim, mint tool session, render `/embed/…` | Verification fails closed with a plain error and an error code the admin can look up |
| Roster (NRPS) | Instructor: LMS link panel shows "Last roster sync 2 h ago · 31 learners". "Sync now". If the sync would deactivate anyone: a preview list first | `syncNrps` diffs members; creates or reactivates immediately; deactivations wait for confirmation | Deactivation never deletes work or grades |
| Passback (AGS) | Instructor releases grades as today; the LMS link panel shows "Sent 29 · Waiting 0 · Failed 2" with each failure's reason and fix | On release, queue one `ScorePublication` per student; send with the platform token; retry with backoff (1 min, 10 min, 1 h, then stop and report) | Only released grades (D-051) |
| OneRoster import | Admin uploads the zip → dry run: "Will add 212 people, update 14, deactivate 3, enrol 540. Removes nothing." with row errors listed by file and line | `previewOneRoster` validates and hashes; `applyOneRoster(hash)` writes | Apply requires the hash; row errors don't block valid rows |
| Package upload | Instructor adds a Package block, uploads a zip; sees detected standard, title, launch file, mastery score, and an Access check summary of the package's HTML where possible | `uploadPackage` stores in R2, parses `imsmanifest.xml` or `cmi5.xml`, validates | Invalid manifests are refused with the reason |
| Package play | Learner opens the lesson: the package in a frame with a title, "Open full screen", and progress saved on exit | Runtime bridge writes `PackageAttempt`; cmi5 statements to `xapi_statements`; completion updates lesson progress and `CompletionEvent` | `moveOn` (cmi5) or `lesson_status` (SCORM) decides completion |
| Health | Admin: Integrations page, one row per platform and import, error queue with filters | Aggregates `sync_runs`, `sync_errors`, `score_publications` | None |

Voice rules: errors say what happened, why, and what to do ("The LMS rejected 2 grades because the assignment was deleted in the LMS. Re-link the assignment, then retry."). No codes without words; codes appear in a secondary line for support. No decision codes in UI copy.

## 4. Domain model (`shared/domain.ts`)

Add at the end of the file, in a new section (small, added at the end of the section, per hotspot rules):

```ts
// ---- Interoperability (D-045 to D-052) ----
export type IdentityKind = 'access-email' | 'lti';
export interface UserIdentity {
  userId: Id; kind: IdentityKind;
  /** access-email: the email. lti: `${platformId}|${sub}`. */
  key: string;
  linkedAt: Timestamp; linkedBy: 'first-sign-in' | 'admin';
  lastSeenAt: Timestamp | null;
}

export type LtiPlatformStatus = 'pending' | 'active' | 'disabled';
export interface LtiPlatform {
  id: Id; name: string;                       // "Meridian State Canvas"
  issuer: string; clientId: string; deploymentIds: string[];
  authLoginUrl: string; authTokenUrl: string; jwksUrl: string;
  registeredVia: 'dynamic' | 'manual'; status: LtiPlatformStatus;
  services: { ags: boolean; nrps: boolean; deepLinking: boolean };
  createdBy: Id; createdAt: Timestamp; lastLaunchAt: Timestamp | null;
}

export interface LtiContext {
  id: Id; platformId: Id; deploymentId: string; contextId: string;
  title: string; label: string;               // "STAT 110 · Fall 2026"
  courseId: Id | null; linkedBy: Id | null; linkedAt: Timestamp | null;
  nrpsUrl: string | null; agsLineItemsUrl: string | null;
  lastRosterSyncAt: Timestamp | null;
}

export type LtiTarget =
  | { kind: 'course'; courseId: Id }
  | { kind: 'lesson'; lessonId: Id }
  | { kind: 'assignment'; assignmentId: Id };
export interface LtiResourceLink {
  id: Id; contextId: Id; resourceLinkId: string; target: LtiTarget;
  lineItemUrl: string | null; createdAt: Timestamp;
}

/** Stored hashed; the plaintext lives only in page memory (D-046). */
export interface ToolSession {
  id: Id; tokenHash: string; userId: Id; courseId: Id; role: 'instructor' | 'student';
  platformId: Id; contextId: Id; resourceLinkId: string | null;
  createdAt: Timestamp; expiresAt: Timestamp; returnUrl: string | null;
}

export type SyncKind = 'nrps' | 'ags' | 'oneroster' | 'package';
export type SyncErrorCode =
  | 'launch-invalid-signature' | 'launch-unknown-deployment' | 'launch-nonce-reused'
  | 'context-unlinked' | 'role-unmapped' | 'user-no-sub'
  | 'nrps-forbidden' | 'ags-token-failed' | 'ags-lineitem-missing' | 'ags-score-rejected'
  | 'oneroster-row-invalid' | 'oneroster-unknown-reference' | 'oneroster-duplicate-id'
  | 'package-manifest-invalid' | 'package-too-large';
export interface SyncError {
  id: Id; runId: Id | null; kind: SyncKind; code: SyncErrorCode;
  message: string;                            // plain sentence
  resolution: string;                         // what to do
  subject: { kind: 'user' | 'context' | 'assignment' | 'row' | 'package'; ref: string; label: string };
  retryable: boolean; createdAt: Timestamp; resolvedAt: Timestamp | null;
}
export interface SyncRun {
  id: Id; kind: SyncKind; scope: { platformId?: Id; contextId?: Id; courseId?: Id };
  trigger: 'manual' | 'scheduled' | 'release' | 'upload';
  startedAt: Timestamp; finishedAt: Timestamp | null;
  counts: { created: number; updated: number; unchanged: number; deactivated: number; failed: number };
}

export interface ScorePublication {
  id: Id; assignmentId: Id; studentId: Id; resourceLinkId: Id;
  scoreGiven: number; scoreMaximum: number;
  gradingProgress: 'FullyGraded'; activityProgress: 'Completed' | 'Submitted';
  status: 'queued' | 'sent' | 'failed'; attempts: number; nextAttemptAt: Timestamp | null;
  sentAt: Timestamp | null; errorId: Id | null;
}

/** OneRoster 1.2 CSV dry run (D-049). Same discipline as TemplateChangeSet. */
export interface RosterChangeSet {
  importId: Id; files: string[];
  people: { add: number; update: number; deactivate: number; unchanged: number };
  enrolments: { add: number; remove: number };
  courses: { add: number; matched: number };
  rowErrors: { file: string; line: number; code: SyncErrorCode; message: string }[];
  summary: string;                            // "Will add … Removes nothing."
  hash: string;
}

// ---- Packages (D-050) ----
export type PackageStandard = 'scorm12' | 'cmi5';
export interface ContentPackage {
  id: Id; courseId: Id; fileId: Id; version: number; standard: PackageStandard;
  title: string; launchPath: string; bytes: number;
  masteryScore: number | null;                // 0 to 1
  moveOn: 'Passed' | 'Completed' | 'CompletedAndPassed' | 'CompletedOrPassed' | 'NotApplicable' | null; // cmi5
  uploadedBy: Id; uploadedAt: Timestamp;
}
export type PackageStatus = 'not-attempted' | 'incomplete' | 'completed' | 'passed' | 'failed';
export interface PackageAttempt {
  id: Id; packageId: Id; blockId: Id; studentId: Id;
  registration: string;                       // UUID; cmi5 registration
  status: PackageStatus; score: number | null; // scaled 0 to 1
  location: string; suspendData: string;      // SCORM 1.2 caps suspend_data at 4096 characters
  totalSeconds: number; updatedAt: Timestamp;
}
export interface XapiStatement {
  id: string; registration: string; actorUserId: Id; verb: string; objectId: string;
  result: { completion?: boolean; success?: boolean; score?: { scaled?: number } } | null;
  timestamp: Timestamp; storedAt: Timestamp;
}
```

Also:
- `BlockContent` gains `| { type: 'package'; packageId: Id; title: string; description: string; minutes: number }` (added at the end of the union). Students receive it unchanged. **Check first:** `migrations/0003_block_types.sql` rebuilt `blocks` to add types; if `blocks.type` carries a `CHECK` list, a new type needs a table rebuild, which is not additive on the shared preview D1. In that case stop and ask the owner (alternatives: drop the check in a coordinated migration, or validate the type only in the service).
- `Institution.sso?: { domains: string[]; defaultRole: 'student' } | null` (D-052).
- `Scope` gains `'integrations:read' | 'integrations:write'`.
- `CompletionEventKind` is unchanged; package completion writes the existing `completed` kind with `detail` naming the package.

## 5. API (`shared/api.ts`)

Routes under `/api/v1` unless marked. Added at the end of `ApiSpec` and `ROUTES`.

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `listLtiPlatforms` | `GET /integrations/lti` | ADMIN · `integrations:read` | |
| `startLtiRegistration` | `POST /integrations/lti/registrations` | ADMIN · `integrations:write` | returns `{ registrationUrl, expiresAt }` (one-time, 24 h) |
| `createLtiPlatform` | `POST /integrations/lti` | ADMIN · `integrations:write` | manual form |
| `updateLtiPlatform` | `PATCH /integrations/lti/:platformId` | ADMIN · `integrations:write` | activate, disable, rename, deployments |
| `listLtiContexts` | `GET /integrations/lti/:platformId/contexts` | ADMIN · `integrations:read` | |
| `getCourseLtiLink` | `GET /courses/:courseId/lti` | STAFF · `courses:read` | context, last roster sync, passback counts, open errors |
| `linkLtiContext` | `POST /lti/contexts/:contextId/link` | INSTRUCTOR (tool session) | `{ courseId } \| { createCourse: { code, title, term } }` |
| `syncRoster` | `POST /courses/:courseId/lti/roster-sync` | STAFF · `people:write` | returns `SyncRun` plus pending deactivations |
| `confirmRosterDeactivations` | `POST /sync-runs/:runId/confirm` | STAFF · `people:write` | `{ userIds }` |
| `listScorePublications` | `GET /assignments/:assignmentId/passback` | STAFF · `grades:read` | |
| `retryScorePublications` | `POST /assignments/:assignmentId/passback/retry` | INSTRUCTOR · `grades:write` | failed ones only |
| `previewOneRoster` | `POST /integrations/oneroster/preview` | ADMIN · `people:write` | multipart zip → `RosterChangeSet` |
| `applyOneRoster` | `POST /integrations/oneroster/:importId/apply` | ADMIN · `people:write` | `{ hash }`; `conflict` on mismatch |
| `listSyncRuns` / `listSyncErrors` | `GET /integrations/runs`, `GET /integrations/errors` | ADMIN · `integrations:read` | filters: kind, open, platform |
| `resolveSyncError` | `POST /integrations/errors/:errorId/resolve` | ADMIN · `integrations:write` | retry when `retryable`, else mark resolved with a note |
| `uploadPackage` | `POST /courses/:courseId/packages` | INSTRUCTOR · `content:write` | multipart; returns `ContentPackage` |
| `getPackageLaunch` | `GET /me/packages/:blockId/launch` | signed-in or tool session | returns content-origin URL with a signed, 10-minute launch token |
| `packageRuntime` | `POST /me/packages/:blockId/runtime` | signed-in or tool session, browserOnly | SCORM `LMSSetValue` batches, `LMSCommit`, `LMSFinish` |
| `xapiStatements` | `PUT/POST /xapi/statements` | cmi5 launch token only | minimal: statements for the registration; `GET` for the AU's own state |
| `getPackageReport` | `GET /courses/:courseId/packages/:packageId/report` | STAFF · `grades:read` | per-learner status, score, time |
| `updateSsoSettings` | `PUT /institution/sso` | ADMIN · `people:write` | D-052 |

Non-API endpoints (Worker, outside Access per D-046): `GET /lti/jwks`, `GET|POST /lti/login` (OIDC initiation), `POST /lti/launch`, `POST /lti/register` (dynamic registration), `GET /embed/*` (embed shell). The MCP server gains read-only `integration_health` and `sync_errors` tools; no destructive integration actions over MCP (as the existing exclusions).

## 6. Service logic (`shared/service/interop/`, over `Repo`)

Business logic lives once here; both `MemoryRepo` and `d1-repo` implement new methods and pass `repo-contract.ts`. LTI cryptography (JWT verify and sign, JWKS fetch with a 10-minute cache) lives in `worker/lti/` because it needs WebCrypto and outbound fetch; the service receives verified claims.

### 6.1 Launch and identity
- Verify: `iss` is an active platform; `aud` contains its `clientId`; `deployment_id` is listed; `nonce` unused (store for 1 h); `state` matches the cookie set at login; `exp`/`iat` within 5 minutes skew; message type is resource link or deep linking. Any failure: 401 page with a plain sentence and the code; a `SyncError` for the admin only when the platform is known.
- Resolve identity (D-048): look up `user_identities(kind 'lti', key platformId|sub)`. If absent, create a user (`role` from the LIS mapping; students by default) and the identity. If the launch email equals an existing Tessera user's email, create a *link suggestion* for the admin instead of linking.
- Enrol from the launch: learners into the linked course; instructors into `instructorIds` only for that course (`setCourseInstructors` stays admin-only for everything else).
- Mint the tool session: 2 h expiry, sliding by activity up to 8 h; revoke on relaunch from the same context.

### 6.2 Deep Linking
- Picker lists courses the user teaches; for each, published lessons and assignments. Draft lessons are selectable by instructors but learners see "Not published yet" at launch (never draft content, D-003).
- Response items: `ltiResourceLink` with `custom: { tessera_target }` and, for assignments, `lineItem: { scoreMaximum: points, label: title, resourceId: assignmentId }`.

### 6.3 NRPS roster sync
- Page through members; map roles (D-048); create users and identities; enrol; reactivate; compute would-be deactivations (enrolled in Tessera course via this context, absent from NRPS) and hold them for `confirmRosterDeactivations`. Deactivation = unenrol; submissions, grades, progress and events are kept.
- Nightly scheduled sync (Cron Trigger) applies creates and reactivations only.

### 6.4 AGS passback
- On `releaseGrades` (as today) and on a later grade change to a released grade, enqueue `ScorePublication` for each student with a resource link whose target is that assignment. Score value comes from the gradebook engine (`GRADEBOOK-SPEC.md`): the assignment score after late policy, excused → not sent.
- Send with a client-credentials token (`private_key_jwt`), scopes `lineitem` and `score`; cache the token until expiry.
- Map failures to codes: 401/403 → `ags-token-failed` ("The LMS refused Tessera's credentials. Ask your LMS admin to check the Tessera tool is still enabled."); 404 on line item → `ags-lineitem-missing` (resolution: re-link); 400/422 → `ags-score-rejected` with the platform's message quoted.

### 6.5 OneRoster CSV
- Accept `manifest.csv`, `orgs.csv`, `academicSessions.csv`, `courses.csv`, `classes.csv`, `users.csv`, `enrollments.csv`. Match people by `sourcedId`, then by email as a suggestion (same rule as D-048). Classes map to Tessera courses by `sourcedId` stored on a new `external_refs` table; unmatched classes create courses only if the admin ticks "Create missing courses".
- Dry run is pure; the hash covers the parsed rows and current state. Apply is idempotent per `importId`. `status=tobedeleted` deactivates.

### 6.6 Packages
- Upload cap 200 MB (R2 multipart); reject zips with path traversal, absolute paths, or more than 5,000 entries. Parse `imsmanifest.xml` (SCORM 1.2: first `organization`, the `resource` with `adlcp:scormtype="sco"`) or `cmi5.xml` (first AU; `moveOn`, `masteryScore`, launch URL).
- Serve files from the content origin under `/<packageId>/<version>/…` with `Content-Security-Policy: sandbox allow-scripts allow-forms` style isolation, no cookies from the main origin. The player page on the main origin hosts the SCORM API object and relays over `postMessage` with an origin check.
- SCORM runtime: accept `cmi.core.lesson_status`, `score.raw/min/max`, `lesson_location`, `suspend_data` (truncate at 4096 with a warning event), `session_time`; commit on `LMSCommit` and every 30 s.
- cmi5: build the launch URL with `endpoint`, `fetch`, `registration`, `activityId`, `actor`; the fetch URL returns a one-time auth token; accept `initialized`, `completed`, `passed`, `failed`, `terminated`; apply `moveOn`.
- Completion → `setLessonProgress` for the containing lesson when all its package blocks are satisfied and the rest of the lesson's progress rule is met (as today) → the existing training service writes `CompletionEvent` and issues certificates (D-027 unchanged).
- A new package version never breaks an in-progress attempt: attempts stay on their version until they finish or the learner chooses "Start the new version" (gap report §5.1 item 4).

### 6.7 Health
`getIntegrationHealth` returns per platform: status, last launch, last roster sync, passback counts in 7 days, open errors by code. Traffic-light is text plus a shape marker, never colour alone (D-010).

## 7. AI tasks

None. No AI runs on integration data. (A later "explain this sync error" helper would be a labelled `.ai--note`; out of scope.)

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive only: `user_identities`, `lti_platforms`, `lti_keys` (Tessera's signing keys; private key encrypted with a Worker secret, never in D1 plaintext), `lti_contexts`, `lti_resource_links`, `lti_nonces`, `tool_sessions`, `sync_runs`, `sync_errors`, `score_publications`, `external_refs`, `roster_imports`, `content_packages`, `package_attempts`, `xapi_statements`; nullable `institution.sso`. Apply to preview D1 with `npm run db:migrate:preview` before pushing code that needs it; production migration only with the owner's OK and a D1 restore point recorded.
- **Worker:** `worker/lti/` (login, launch, register, jwks, deep-link response signing, AGS and NRPS clients); `worker/packages/` (content origin handler, launch tokens); Cron Trigger for nightly NRPS and passback retries. Secrets: `LTI_KEY_ENCRYPTION_KEY`. Remember previews lose secrets on each push (`tools/preview-secrets.sh` must learn the new one).
- **Cloudflare changes needing the owner:** Access bypass for `/lti/*` and `/embed/*` (D-046); content-origin hostname and route (D-050); Cron Trigger. None may be done by an agent without explicit OK.
- **App:** `app/src/features/integrations/` (`IntegrationsPage.tsx`, `PlatformDetail.tsx`, `OneRosterImport.tsx`, `SyncErrors.tsx`), `app/src/features/lti/` (`DeepLinkPicker.tsx`, `LinkContext.tsx`, `EmbedShell.tsx`), course-level `LmsLinkPanel.tsx`, and the Package block editor and player in the lesson editor and player. Paths added at the end of `app/src/paths.ts`: `admin.integrations`, `teach.lmsLink(courseId)`. The admin nav gets "Integrations" (small addition in `app/src/shell/nav.ts`).
- **Shared components:** `ChangeSetTable` (reuse Night 4's if merged, else build it here and let Night 4 adopt it), `SyncErrorList` (message, resolution, retry button, code line), `HealthRow`. Tokens only; no edge stripes (D-017); status via fills, text and markers.
- **Artboards:** propose `design/canvas/Integrations.dc.html` (admin row, y = 2480) and `LmsLinkPanel` as a state of the instructor workspace; owner review optional (not a privacy surface), but recommended before the error copy is built. Canvas placement coordinated with `night4`'s `canvas.json` changes after it merges.
- **Mock mode:** a seeded fictional platform ("Meridian State Canvas", issuer `https://canvas.meridian.example`), a linked STAT 110 context, 3 failed publications for Priya's section with different codes, and a SCORM 1.2 fixture package (a tiny hand-written HTML SCO committed under `tests/fixtures/packages/`). A local LTI platform simulator (`tools/lti-sim.mjs`) signs launches for e2e.
- **Docs:** `mintlify/product/integrations.mdx` (LTI, rosters, grades, packages; no internal tooling, no decision codes); OpenAPI regenerates.

## 9. Governance and policy (must-haves)
- Least privilege: request only AGS lineitem/score and NRPS read scopes; list them to the admin in plain language before activation.
- No account takeover: email never links on its own (D-048). Link suggestions need an admin.
- Privacy: rosters and scores move only between the institution's own systems; nothing about learners is sent anywhere else. Tool sessions are scoped to one course. Managers (D-026) see nothing new.
- No deletion by sync: deactivate only; work, grades, events and certificates stay.
- Audit: every platform change, context link, deactivation, import apply and passback batch writes an admin audit event (reuse the append-only discipline of `completion_events`).
- AI rules untouched: packages are human content (`origin: 'human'`); nothing in this spec creates AI output.
- Accessibility: the picker, link panel, Integrations page and package player meet WCAG 2.2 AA; the package frame has a `title`; "Open full screen" is a real button; Tessera cannot fix a package's own accessibility, so the Access check reports what it finds in the package HTML and the readiness rubric's third-party-tool attestation (as today) applies.
- Public site: nothing under `docs/` or `mintlify/` names real institutions or links to the private repo (D-012).

## 10. Tests and definition of done
1. **Unit** (`shared/service/interop/*.test.ts`): role mapping table; identity resolution (new user, existing identity, email match → suggestion only); context linking; NRPS diff (create, reactivate, pending deactivate); OneRoster dry-run determinism (same input → same hash), row errors, tobedeleted; passback enqueues only released grades, excused not sent, re-release after change re-sends; package manifest parsing (SCORM 1.2, cmi5, invalid, traversal); SCORM runtime status rules; cmi5 `moveOn` matrix.
2. **Worker** (`worker/lti/*.test.ts`): JWT verification against a local JWKS (good, wrong `aud`, unknown deployment, replayed nonce, expired); deep-link response signature verifies with Tessera's JWKS; AGS error mapping per status code.
3. **Repo contract:** all new methods in `repo-contract.ts`; both repos pass.
4. **e2e** (mock plus the LTI simulator): Journey 21+ (claimed at build time): (a) admin registers the simulated platform, instructor deep-links an assignment, a learner launches, submits, instructor grades and releases, the simulator receives the score; (b) OneRoster dry run shows the summary line and two row errors, apply, people appear; (c) learner plays the fixture SCORM package, closes mid-way, resumes at the saved location, completes, lesson shows completed and a required-training course completes with a certificate.
5. **a11y:** `npm run a11y` zero violations with the new routes and stories added to `tools/a11y_audit.mjs` (small, added at the end).
6. **Interop check on a preview:** with owner approval of D-046, register a real sandbox LMS (a Moodle or Canvas test instance the owner controls) and run launch, deep link, NRPS and AGS end to end; record results in a QA log.
7. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
0. **Owner gate:** D-045, D-046, D-048, D-050, D-052 approved; Access bypass and content origin approved or deferred. No code before this. *(2026-09-28: D-045, D-046, D-048 and D-052 approved by owner; D-050 still pending, which gates only milestone 5; the Access bypass and content origin are deferred, so milestones 1 and 2 run locally and on tests only.)*
1. `interop/identity` in `../tessera-interop-identity`: `user_identities`, identity resolution in `worker/identity/`, tool sessions, SSO JIT (D-052), migration. Astra reviews (auth code is high stakes; Grok as second reviewer).
2. `interop/lti-core`: JWKS, login, launch, dynamic and manual registration, context linking, embed shell, LTI simulator.
3. `interop/lti-services`: Deep Linking picker, NRPS sync, AGS queue and passback (after `GRADEBOOK-SPEC.md` release semantics land).
4. `interop/oneroster`: dry run, apply, external refs, import history.
5. `interop/packages`: package block, content origin, SCORM bridge, cmi5 and xAPI store, completion wiring.
6. `interop/health`: Integrations page, error queue, LMS link panel, docs page, e2e, a11y, QA log.

Each brief to a worker: the section numbers above, the acceptance tests, the hotspot rule (small, added at the end of the section), and the CLAUDE.md hard rules. Read every diff before pushing. Any large change in a hotspot (for example restructuring `worker/identity/` request resolution) goes to the owner first.
