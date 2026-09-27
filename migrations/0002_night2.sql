-- Night 2 schema (D-019 to D-022, plan §6). Additive: nothing from 0001 changes.

-- API tokens (D-020): the secret is never stored, only its SHA-256.
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,               -- Scope[] JSON
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX api_tokens_owner ON api_tokens(owner_id);

-- Idempotency-Key replay store (D-020): same key + token → same response for 24 hours.
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  principal TEXT NOT NULL,            -- user id or token id
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, principal)
);

-- Files in R2 (D-019). Versions never overwrite: each fix writes a new object key.
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'pptx', 'image', 'captions', 'other')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL
);
CREATE INDEX files_course ON files(course_id);

CREATE TABLE file_versions (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  key TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (file_id, version)
);

-- Generated accessible formats, per file version (D-022).
CREATE TABLE format_jobs (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('reading', 'audio', 'epub', 'ocr')),
  state TEXT NOT NULL CHECK (state IN ('none', 'generating', 'ready', 'failed')),
  output_key TEXT,
  generated_at TEXT,
  error TEXT,
  PRIMARY KEY (file_id, version, format)
);

-- Accessibility scans (D-022): one row per scan of a lesson or a file version; issues as JSON.
CREATE TABLE access_scans (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('lesson', 'file')),
  target_id TEXT NOT NULL,
  version INTEGER,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  grade TEXT NOT NULL,
  issue_count INTEGER NOT NULL,
  by_severity TEXT NOT NULL,          -- Record<severity, count> JSON
  issues TEXT NOT NULL,               -- AccessIssue[] JSON
  document TEXT,                      -- AccessReport.document JSON
  scanned_at TEXT NOT NULL
);
CREATE INDEX access_scans_target ON access_scans(target_kind, target_id, scanned_at);
CREATE INDEX access_scans_course ON access_scans(course_id, scanned_at);

-- Assignments, submissions, grades (plan §5.3).
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  due_at TEXT,
  points REAL NOT NULL DEFAULT 100,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('text', 'file', 'link')),
  rubric TEXT NOT NULL DEFAULT '[]',  -- RubricCriterion[] JSON
  instructions TEXT NOT NULL DEFAULT '[]' -- Block[] JSON
);
CREATE INDEX assignments_module ON assignments(module_id, position);
CREATE INDEX assignments_course ON assignments(course_id);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK (state IN ('submitted', 'graded', 'returned')),
  text TEXT NOT NULL DEFAULT '',
  file_id TEXT,
  link TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  grade TEXT                          -- Grade JSON
);
CREATE INDEX submissions_assignment ON submissions(assignment_id, student_id, attempt);

-- Tutor (D-005).
CREATE TABLE tutor_settings (
  activity_kind TEXT NOT NULL CHECK (activity_kind IN ('lesson', 'assignment')),
  activity_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'hints', 'explain', 'open')),
  max_hints INTEGER NOT NULL DEFAULT 2,
  allowed_source_ids TEXT NOT NULL DEFAULT '[]',
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL,
  PRIMARY KEY (activity_kind, activity_id)
);

CREATE TABLE tutor_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_kind TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  max_hints INTEGER NOT NULL,
  answer_requests INTEGER NOT NULL DEFAULT 0,
  messages TEXT NOT NULL DEFAULT '[]', -- TutorMessage[] JSON
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tutor_sessions_student ON tutor_sessions(student_id, activity_id);
CREATE INDEX tutor_sessions_course ON tutor_sessions(course_id);

-- Adaptations (D-004, principle #7).
CREATE TABLE adaptations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  why TEXT NOT NULL,
  before_value TEXT NOT NULL,         -- JSON
  after_value TEXT NOT NULL,          -- JSON
  applied_at TEXT NOT NULL,
  undone_at TEXT
);
CREATE INDEX adaptations_student ON adaptations(student_id, applied_at);

-- Identity (D-021).
CREATE TABLE invitations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  invited_at TEXT NOT NULL,
  access_granted INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT
);

-- AI generation jobs at scope (plan §5.2).
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
  done INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  lesson_ids TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Institution accessibility policy (D-022) lives on the institution row.
ALTER TABLE institution ADD COLUMN access_policy TEXT NOT NULL DEFAULT '{"minimumScore":0,"blockingSeverities":["critical"]}';
