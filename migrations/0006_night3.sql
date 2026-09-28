-- Night 3 schema (D-024 to D-029, handoff/NIGHT-3-PLAN.md §4). Additive: new tables and
-- nullable columns only. One file for every lane, prepared in Wave 0 so lanes never edit
-- migrations. Nested values are JSON text, as in 0001.

-- ---- Templates and programs (D-024, lane A) ----------------------------------------------

ALTER TABLE institution ADD COLUMN template_id TEXT;
ALTER TABLE institution ADD COLUMN readiness_policy TEXT;       -- ReadinessPolicy JSON; NULL = Tessera standard, advisory

CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  template_id TEXT,
  brand TEXT NOT NULL DEFAULT '{"accent":null,"logo":null}',   -- Brand JSON
  created_at TEXT NOT NULL
);

-- A template's structure is one JSON document (modules → lessons → blocks); it's always
-- read and written whole, and deviations are found by the template keys below.
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('institution', 'program')),
  program_id TEXT,
  body TEXT NOT NULL,                 -- { modules, tutorDefaults, accessFloor } JSON
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((owner_kind = 'program') = (program_id IS NOT NULL))
);

ALTER TABLE courses ADD COLUMN program_id TEXT;
CREATE INDEX courses_program ON courses(program_id);

-- Where structure came from: a template item (lane A) or, for variants, a master block (lane C).
ALTER TABLE modules ADD COLUMN objective TEXT;
ALTER TABLE modules ADD COLUMN template_key TEXT;
ALTER TABLE lessons ADD COLUMN template_key TEXT;
ALTER TABLE blocks ADD COLUMN template_key TEXT;

-- ---- Variants (D-028, lane C) -----------------------------------------------------------

ALTER TABLE lessons ADD COLUMN variant_of TEXT REFERENCES lessons(id) ON DELETE CASCADE;
ALTER TABLE lessons ADD COLUMN variant_audience TEXT CHECK (variant_audience IS NULL OR variant_audience IN ('plain', 'micro'));
ALTER TABLE lessons ADD COLUMN variant_synced_at TEXT;          -- when the variant was made or last resynced
CREATE UNIQUE INDEX lessons_variant ON lessons(variant_of, variant_audience) WHERE variant_of IS NOT NULL;
ALTER TABLE blocks ADD COLUMN source_block_id TEXT;             -- the master block
ALTER TABLE blocks ADD COLUMN source_hash TEXT;                 -- master content hash at the last sync

-- ---- Readiness rubrics and outcomes (D-029, lane B) --------------------------------------

-- Custom rubrics only. Built-ins (Tessera standard, OSCQR) ship in code: shared/quality/rubrics.ts.
CREATE TABLE rubrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  attribution TEXT,
  standards TEXT NOT NULL,            -- RubricStandard[] JSON
  updated_at TEXT NOT NULL
);

-- Stored per course and item: AI findings (drafts until reviewed) and attestations.
-- Automatic items are computed on read and never stored.
CREATE TABLE readiness_items (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rubric_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  finding TEXT,                       -- AiFinding JSON
  attestation TEXT,                   -- Attestation JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (course_id, rubric_id, item_id)
);

CREATE TABLE outcomes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  text TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX outcomes_course ON outcomes(course_id, position);

CREATE TABLE outcome_links (
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('block', 'assignment')),
  target_id TEXT NOT NULL,
  PRIMARY KEY (outcome_id, target_kind, target_id)
);
CREATE INDEX outcome_links_target ON outcome_links(target_kind, target_id);

-- Existing course outcomes (a JSON list of text) become entities with stable ids.
-- The same id scheme is used when a seed is loaded (`<courseId>-o<n>`, codes O1, O2, …).
INSERT INTO outcomes (id, course_id, code, text, position)
  SELECT c.id || '-o' || (j.key + 1), c.id, 'O' || (j.key + 1), j.value, j.key
  FROM courses c, json_each(c.outcomes) j
  WHERE trim(j.value) <> '';

-- ---- Required training, test-out, certificates (D-026, D-027, lane D) --------------------

CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('course', 'program')),
  target_id TEXT NOT NULL,
  audience TEXT NOT NULL,             -- RequirementAudience JSON
  due_at TEXT,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'annual')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX requirements_target ON requirements(target_kind, target_id);

-- The audit trail is append-only: updates are refused. (Deletes happen only when the
-- demo is reset.) No foreign keys, so records outlive what they describe.
CREATE TABLE completion_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  requirement_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('assigned', 'unassigned', 'started', 'completed', 'tested-out', 'certificate-issued', 'certificate-replaced', 'due-date-changed')),
  actor_id TEXT,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX completion_events_user ON completion_events(user_id, at);
CREATE INDEX completion_events_course ON completion_events(course_id, at);
CREATE TRIGGER completion_events_append_only BEFORE UPDATE ON completion_events
BEGIN
  SELECT RAISE(ABORT, 'completion_events is append-only');
END;

CREATE TABLE test_outs (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  items TEXT NOT NULL,                -- TestOut['items'] JSON, with the answer key
  pass_percent INTEGER NOT NULL CHECK (pass_percent BETWEEN 1 AND 100),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Attempts hold scores: visible to the learner only, never to managers (D-025).
CREATE TABLE test_out_attempts (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 0 AND 100),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  at TEXT NOT NULL
);
CREATE INDEX test_out_attempts_user ON test_out_attempts(user_id, course_id, at);

-- Certificates are evidence: immutable once issued, except that `replaced_by` is set
-- once when a correction issues a replacement.
CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  learner_name TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('completed', 'tested-out')),
  replaces TEXT,
  replaced_by TEXT
);
CREATE INDEX certificates_user ON certificates(user_id, issued_at);
CREATE TRIGGER certificates_immutable BEFORE UPDATE ON certificates
WHEN OLD.replaced_by IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.code IS NOT OLD.code OR NEW.user_id IS NOT OLD.user_id
  OR NEW.learner_name IS NOT OLD.learner_name OR NEW.course_id IS NOT OLD.course_id
  OR NEW.course_title IS NOT OLD.course_title OR NEW.issued_at IS NOT OLD.issued_at
  OR NEW.basis IS NOT OLD.basis OR NEW.replaces IS NOT OLD.replaces
BEGIN
  SELECT RAISE(ABORT, 'certificates are immutable; issue a replacement');
END;

-- ---- Managers (D-025, D-026, lane D2) ----------------------------------------------------

CREATE TABLE reporting_lines (
  manager_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (manager_id, report_id),
  CHECK (manager_id <> report_id)
);
CREATE INDEX reporting_lines_report ON reporting_lines(report_id);

-- The learner's choice per manager. Removing a reporting line deletes the choice, so a
-- re-added line starts private again.
CREATE TABLE manager_consents (
  manager_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  sharing INTEGER NOT NULL CHECK (sharing IN (0, 1)),
  at TEXT NOT NULL,
  PRIMARY KEY (manager_id, report_id)
);
CREATE TRIGGER reporting_lines_clear_consent AFTER DELETE ON reporting_lines
BEGIN
  DELETE FROM manager_consents WHERE manager_id = OLD.manager_id AND report_id = OLD.report_id;
END;
