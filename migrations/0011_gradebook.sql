-- Gradebook M2. Additive so older previews keep reading existing rows.
CREATE TABLE gradebook_setups (
  course_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);
CREATE TABLE student_item_states (
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, student_id)
);
CREATE INDEX student_item_states_course ON student_item_states(course_id);
CREATE TABLE course_grade_overrides (
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (course_id, student_id)
);
CREATE TABLE grade_events (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  student_id TEXT,
  assignment_id TEXT,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  by_user TEXT NOT NULL,
  at TEXT NOT NULL,
  batch_id TEXT
);
CREATE UNIQUE INDEX grade_events_course_seq ON grade_events(course_id, seq);
CREATE INDEX grade_events_course_at ON grade_events(course_id, at);
CREATE INDEX grade_events_student_at ON grade_events(course_id, student_id, at);
CREATE TABLE grade_batches (
  course_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  by_user TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (course_id, batch_id)
);
ALTER TABLE assignments ADD COLUMN category_id TEXT;
ALTER TABLE assignments ADD COLUMN extra_credit INTEGER;
ALTER TABLE assignments ADD COLUMN counts_toward_grade INTEGER;
ALTER TABLE submissions ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN source TEXT;
ALTER TABLE submissions ADD COLUMN feedback_draft TEXT;
ALTER TABLE submissions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
