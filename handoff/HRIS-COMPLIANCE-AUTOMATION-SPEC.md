# Build spec: HRIS-driven compliance automation

*Status: approved by owner for build planning (2026-09-28); proposed decisions still await owner ruling. Decisions D-085 to D-089 below are proposals; they extend D-026 and D-027 and supersede none. **Sequenced after the identity decisions in `handoff/INTEROP-LTI-SPEC.md` (D-045, D-048, D-052; approved by owner 2026-09-28)**, because HRIS records must attach to users by the same linking rules. Research: `research/lms-best-practices-gaps-2026-09-28.md` (the gap report; §2.5, §2.7, §3 rank 9, §6.1, §6.2 item 5, §7 area 9). Builds on required training, test-out, certificates, completion events and managers (Night 3: `shared/service/training.ts`, `shared/service/managers.ts`). Related: `handoff/ANALYTICS-COMPLIANCE-REPORTING-SPEC.md` (as-of reports). Artboard: `design/canvas/AssignmentRules.dc.html` proposed (§8).*

This document is written for the implementing agent. It assumes `CLAUDE.md`, `AGENTS.md`, `handoff/PARALLEL-AGENTS.md`, `design/DECISIONS.md`, `handoff/NIGHT-3-PLAN.md` §3.4 and the interop spec are known. Where it says "as today", the existing code is the reference and must not be rewritten.

---

## 0. What this is, in one paragraph

Required training today is assigned by role or by a list of people, by hand. This spec lets an organization's HR system drive it. Tessera accepts **worker records** (employee id, email, job code, department, location, manager, hire date, status) from a CSV upload with a dry run or from an API push with a scoped token; administrators write **assignment rules** in plain terms ("Everyone at Location = North Campus Facilities with Job code in Forklift operator, due 30 days after hire, every year"); every sync or rule change shows a **preview of who gets assigned and unassigned** before it runs; people who change jobs or locations get the right training automatically; leavers are deactivated with their records kept; and reporting lines from HR feed the manager relationship while the learner's opt-in (D-026) stays exactly as it is. Every change writes to the append-only completion events, so the compliance report can explain any person's status on any date.

Why (gap report): Workday Learning powered by Sana updates learning paths "automatically when employees join, change roles, or move regions" (§2.7); Workday provisioning depends on sync reports and role mapping, and SIS/HRIS sync should be observable and recoverable (§2.5); practitioners report compliance completion "at like 20%" (§2.7); only 15% of organizations say their L&D systems are well integrated (§3 rank 2). The report scores this 3 × 4 = 12, effort medium after interoperability (§7 area 9), and calls HRIS-driven assignment the loop-closer for Tessera's compliance strengths (§6.2 item 5). Tessera's difference: rules are previewed and explained per person ("assigned because Location = North Campus Facilities and Job code = FL-2"), manager visibility stays consent-based, and nothing is deleted when someone leaves.

## 1. Decisions (proposed, 2026-09-28)

| # | Decision | Consequence in this build |
|---|---|---|
| **D-085** | **Worker records, two inputs.** A `WorkerRecord` per person keyed by `employeeId`, linked to a Tessera user by the D-048 rules (existing identity, else email as an admin-confirmed suggestion, else a new user). Inputs in the MVP: CSV upload with a dry run (column mapping saved per institution) and an authenticated API push (`people:write` token, batches up to 1,000 records, idempotent by `employeeId` + `effectiveAt`). Direct vendor connectors (Workday, SuccessFactors) are later; the CSV covers their standard exports. | Generic; no vendor lock-in; reuses the change-set pattern. |
| **D-086** | **Rule-based requirements with preview.** `RequirementAudience` gains `{ kind: 'rule'; rule: AssignmentRule }`: all-of or any-of conditions on job code, department, location, employment type, and "hired within N days". Creating, editing or activating a rule, and every sync, computes a preview (add, remove, unchanged, with per-person reasons) that an admin applies. Scheduled nightly syncs apply adds automatically once the rule is active; removals always wait for an admin. | Removal never deletes history: unassignment writes `unassigned`, completed training and certificates stay (D-027). |
| **D-087** | **HR reporting lines feed managers; consent is unchanged.** Manager fields create or update `ReportingLine`s. A manager still sees only reports who opted in (D-026), and a change of manager does not carry the old consent to the new manager. | Learners see a prompt to share with a new manager; the count of reports who haven't chosen stays a count (as approved in the manager-view artboard review). |
| **D-088** | **Leavers and leave.** Status `terminated` deactivates the user (sign-in refused, enrolments ended, requirements paused) and keeps all records. Status `leave` pauses due dates and resumes them with the remaining days on return. Rehire reactivates the same user. | Deactivation is a new user state; no deletion path is added. Personal data retention after termination follows spec 7's retention (later). |
| **D-089** | **Due dates relative to events, recurrence from completion.** A rule's due date is either fixed or "N days after assignment" (hire, transfer, or rule activation). Annual recurrence counts from the last completion date (not the calendar), with a reminder window. | Extends `Requirement.recurrence` without changing existing fixed-date requirements. |

## 2. Scope

**In (MVP, one Night after interop identity lands):**
1. Worker record store with history (effective-dated), CSV import with saved column mapping and dry run, API push with idempotency.
2. User linking per D-048; new users created as students by default (the Tessera role is independent of HR attributes); admins can promote.
3. Assignment rules editor (conditions, due rule, recurrence), rule preview with per-person reasons, activation, deactivation.
4. Nightly sync (Cron) that applies record changes, re-evaluates rules, auto-applies adds, and queues removals for review.
5. Transfers: moving out of a rule's audience queues an unassign; moving into another assigns with a new relative due date; completed training for the same course is recognized (no duplicate assignment).
6. Leavers, leave and rehire (D-088).
7. Reporting lines from HR (D-087), learner prompt for a new manager.
8. Sync health: last import, counts, row errors with resolution text (shares `SyncRun`/`SyncError` from spec 1).
9. Completion events for every automated change with `actorId: null` and a detail naming the rule.

**Out (explicitly):** direct Workday or SuccessFactors API connectors; SCIM; pushing completions back to the HRIS (later, via the as-of report export and an outbound API); skills and competency frameworks; learner-facing job attributes.

**Later:** vendor connectors; outbound completion feed; SCIM 2.0 provisioning; region-specific rule templates; a rules simulator for "what if we add a location".

## 3. The flow (normative)

| Stage | Who sees what | Server does | Gate |
|---|---|---|---|
| Map | Admin → People → HR data → "Upload CSV": maps columns to fields once (saved), sees 5 sample rows parsed | `saveWorkerColumnMap` | Admin |
| Dry run | "Will add 38 people, update 212, mark 4 as left. Removes nothing." with row errors by line | `previewWorkerImport` → `WorkerChangeSet` with hash | None |
| Apply | "Apply" → users linked or created; records stored; rules re-evaluated → a follow-up preview if any rule's audience changed | `applyWorkerImport(hash)` | Hash |
| Push | Integration posts batches with a token | `pushWorkerRecords` (same pipeline, auto-applies adds and updates; queues leavers for review unless the institution enables "apply leavers automatically") | Token scope |
| Rule | Admin → Required training → New rule: "Course: Forklift safety refresher · People where Location is North Campus Facilities and Job code is one of FL-1, FL-2 · Due 30 days after assignment · Every year from completion" → preview "Assigns 41 people. Unassigns nobody." with a list and reasons | `previewRule` | None |
| Activate | "Activate rule" | `activateRule(hash)` writes `assigned` events | Hash |
| Nightly | Admin sees a morning summary on the Overview: "HR sync: 3 new hires assigned, 1 transfer waiting for review" | Cron sync | Removals wait |
| Review removals | "2 people no longer match 'Forklift safety refresher'. Unassign? Their completed training stays." | `applyRemovals(ids)` | Admin |
| Learner | A fictional staff learner in the workplace seed sees the new required course on Today with its due date and "Assigned because your role changed" | `listMyTraining` (reason added) | Own only |
| Manager | New manager sees "1 new report hasn't chosen to share" | as today | D-026 |

## 4. Domain model (`shared/domain.ts`)

Added at the end of the Night 3 training section (small, added at the end of the section):

```ts
// ---- HRIS-driven compliance (D-085 to D-089) ----
export type EmploymentStatus = 'active' | 'leave' | 'terminated';
export interface WorkerRecord {
  employeeId: string; userId: Id | null;
  email: string; name: string;
  jobCode: string; jobTitle: string; department: string; location: string;
  employmentType: 'full-time' | 'part-time' | 'contractor' | 'temporary' | 'other';
  managerEmployeeId: string | null;
  hireDate: string | null;                     // ISO date
  status: EmploymentStatus;
  effectiveAt: Timestamp; receivedAt: Timestamp; source: 'csv' | 'api';
}
export interface WorkerColumnMap { institutionId: Id; columns: Partial<Record<keyof WorkerRecord, string>>; dateFormat: 'iso' | 'mdy' | 'dmy'; updatedBy: Id; updatedAt: Timestamp }

export interface WorkerChangeSet {
  importId: Id;
  people: { add: number; update: number; leave: number; terminate: number; rehire: number; unchanged: number };
  links: { existing: number; suggested: number; created: number };
  rowErrors: { line: number; code: SyncErrorCode | 'worker-missing-id' | 'worker-bad-date' | 'worker-unknown-manager'; message: string }[];
  ruleEffects: { requirementId: Id; add: number; remove: number }[];
  summary: string; hash: string;
}

export type RuleField = 'jobCode' | 'department' | 'location' | 'employmentType';
export type RuleCondition =
  | { field: RuleField; op: 'in' | 'not-in'; values: string[] }
  | { field: 'hireDate'; op: 'within-days'; days: number };
export interface AssignmentRule { match: 'all' | 'any'; conditions: RuleCondition[] }

export type DueRule = { kind: 'fixed'; at: Timestamp } | { kind: 'relative'; days: number; from: 'assignment' | 'hire' };
export interface RulePreview {
  requirementId: Id | null;                    // null for a rule not yet saved
  add: { userId: Id; name: string; reasons: string[]; dueAt: Timestamp | null }[];
  remove: { userId: Id; name: string; reasons: string[]; hasCompleted: boolean }[];
  unchanged: number; summary: string; hash: string;
}
```

Also (small, additive):
- `RequirementAudience` gains `| { kind: 'rule'; rule: AssignmentRule }`.
- `Requirement` gains `due?: DueRule` (existing `dueAt` still honoured when `due` is absent), `recurrence` gains `'annual-from-completion'`, and `active?: boolean` (default true for existing rows).
- `RequiredTraining` gains `reason?: string` ("Assigned because your role changed").
- `CompletionEventKind` gains `'paused' | 'resumed'` (leave).
- `User` gains `status?: 'active' | 'deactivated'` (absent = active).
- `SyncKind` (spec 1) gains `'hris'`.

## 5. API (`shared/api.ts`)

| Operation | Method · path | Access · scope | Notes |
|---|---|---|---|
| `getWorkerColumnMap` / `saveWorkerColumnMap` | `GET`/`PUT /hr/column-map` | ADMIN · `people:read` / `people:write` | |
| `previewWorkerImport` | `POST /hr/imports/preview` | ADMIN · `people:write` | multipart CSV → `WorkerChangeSet` |
| `applyWorkerImport` | `POST /hr/imports/:importId/apply` | ADMIN · `people:write` | `{ hash }` |
| `pushWorkerRecords` | `POST /hr/records` | token · `people:write` | `{ records: WorkerRecord[] }` ≤ 1,000; `Idempotency-Key` |
| `listWorkerRecords` | `GET /hr/records` | ADMIN · `people:read` | filters; history per employee |
| `previewRule` | `POST /requirements/preview` | ADMIN · `people:write` | `{ courseId \| programId, rule, due, recurrence }` or `{ requirementId }` |
| `createRequirement` / `updateRequirement` | as today, audience may be `rule` | as today | |
| `activateRule` / `deactivateRule` | `POST /requirements/:requirementId/activate`, `/deactivate` | ADMIN · `people:write` | activate needs the preview hash |
| `listPendingRemovals` / `applyRemovals` | `GET /requirements/removals`, `POST /requirements/removals/apply` | ADMIN · `people:write` | |
| `getHrSyncHealth` | `GET /hr/health` | ADMIN · `people:read` | last runs, errors (spec 1 shapes) |

## 6. Service logic (`shared/service/hris.ts`, `shared/service/rules.ts`, over `Repo`)

### 6.1 Records
- Parse CSV with the saved map; validate: `employeeId` required and unique per file; email valid; dates parse per `dateFormat`; manager id resolves within the file or existing records (else a row error, not a failure).
- Effective dating: keep every record version; the current one is the latest `effectiveAt` ≤ now; future-dated records apply on that date by the nightly sync.
- Linking (D-048): identity → email suggestion → create. Suggestions are resolved on the People page; until resolved, the record doesn't assign training.

### 6.2 Rules
- Evaluation is pure: `matches(rule, record, now)`. Reasons are generated from the conditions that matched ("Location is North Campus Facilities", "Job code FL-2 is in FL-1, FL-2").
- Preview diff: current assignees of the requirement vs matching active users; people with a completed, still-valid completion for the course show as unchanged with a note (no duplicate assignment). Recurrence `annual-from-completion` computes the next due from the last completion.
- Activation writes `assigned` events with `detail` naming the rule and reason; due dates per `DueRule`.

### 6.3 Nightly sync
- Apply future-dated records that became effective; re-evaluate all active rules; auto-apply adds; queue removals; process leave (write `paused`, store remaining days), return (`resumed`, new due = now + remaining), termination (deactivate user, end enrolments, pause requirements; certificates unaffected), rehire (reactivate).
- Idempotent: running twice produces no new events.
- All deactivation and unassignment writes are conditioned on the state they expect (compare-and-set) in both repos; Astra review.

### 6.4 Managers
- `managerEmployeeId` → the manager's user → `ReportingLine` upsert; old lines for that report end. Consent records are per (manager, report) and are not copied (D-087).

## 7. AI tasks

None. (A later helper that turns a plain sentence into a rule would produce a draft rule the admin previews; out of scope.)

## 8. Worker, data, app

- **Migration:** new migration, next free at build time (>=0009). Additive: `worker_records` (primary key `(employee_id, effective_at)`), `worker_column_maps`, `hr_imports`, `pending_removals`; nullable columns `requirements.due` JSON, `requirements.active`, `users.status`. If `requirements.audience` or `completion_events.kind` carry `CHECK` lists, stop and ask the owner. Apply to preview D1 first; production with the owner's OK and a restore point.
- **Worker:** nightly Cron (shared with spec 1's Cron if present); token-authenticated push route (as D-020 tokens).
- **App:** `app/src/features/hr/` (`HrDataPage`, `ColumnMap`, `ImportPreview`, `HrHealth`), rule editor inside the existing required-training pages (`RuleEditor`, `RulePreview`), pending removals list, learner "Assigned because…" line on Today and My training, manager prompt for learners. Paths at the end of `app/src/paths.ts`.
- **Artboard:** `design/canvas/AssignmentRules.dc.html` (admin row, y = 2480): rule editor and preview. Owner review recommended: it decides who is told to do what.
- **Mock mode:** a workplace seed inside Meridian State (a "Facilities and Operations staff training" program, all names fictional) with 60 worker records across 3 campus locations, 2 rules, one pending transfer and one leaver. A separate fictional employer institution would need the owner's OK (it changes the demo story).
- **Docs:** `mintlify/product/hr-sync.mdx`; update `product/required-training.mdx`.

## 9. Governance and policy (must-haves)
- D-026 unchanged: HR data never gives a manager visibility without the learner's opt-in; the manager view never shows scores or attempts.
- D-027 unchanged: certificates are immutable; unassignment and termination don't revoke them.
- Minimum data: only the fields in `WorkerRecord` are stored; unknown CSV columns are ignored and not kept.
- HR attributes are visible to administrators only; learners see only the reason line for their own assignments.
- No deletion by sync; removals wait for an admin; every automated change is an event with a reason.
- Test-out rules unchanged; where a mandate requires seat time, the admin turns test-out off for that course (gap report §2.7).
- Accessibility: the rule editor uses real selects and checkboxes with labels; condition rows are a list with remove buttons named by the condition; the preview is a table with a caption; no stripes; tokens only.

## 10. Tests and definition of done
1. **Unit:** CSV parsing with map and date formats; row errors; effective dating and future records; linking outcomes; rule matching and reasons; preview diff with completed-course recognition; relative due dates; annual-from-completion; nightly idempotency; leave pause and resume arithmetic; termination and rehire; manager line change doesn't carry consent.
2. **Repo contract:** new methods; both repos pass.
3. **e2e** (mock): Journey 21+ (claimed at build time): (a) admin uploads the fixture CSV, dry run shows the summary and two row errors, applies; creates a rule, previews 41 assignments, activates; a fictional learner sees the course with the reason line; (b) a second CSV moves one person to another location: the nightly sync (triggered in test) queues a removal and assigns the new location's course; admin applies the removal; compliance report as of yesterday still shows the old assignment.
4. **a11y:** zero violations with new routes and stories.
5. **Definition of done:** CLAUDE.md full lane; preview D1 migrated first; owner reviews the rules artboard before build; the owner merges.

## 11. Milestones (suggested worktrees; Sol implements, Astra reviews, Claude verifies and commits)
0. **Gate:** spec 1 D-045 and D-048 approved (done: approved by owner 2026-09-28) and `interop/identity` merged; D-085 to D-089 approved.
1. `compliance/hr-records` in `../tessera-compliance-hr`: records, map, CSV preview and apply, push API, linking.
2. `compliance/rules`: rule model, preview, activation, due rules, recurrence, learner reason line.
3. `compliance/sync`: nightly sync, transfers, removals queue, leave and termination (Astra review: state changes on people).
4. `compliance/managers`: reporting lines from HR, new-manager prompt.
5. Health page, docs, e2e, a11y.

Each brief: the sections above, the acceptance tests, the hotspot rule (small, added at the end of the section) and the CLAUDE.md hard rules. Read every diff before pushing.
