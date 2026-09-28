-- Night 4: syllabus design partner (D-030 to D-036). Additive to existing rows.
CREATE TABLE design_sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  stage TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_design_sessions_course_created ON design_sessions(course_id, created_at);

CREATE TABLE instructor_profiles (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE lessons ADD COLUMN objective TEXT;
ALTER TABLE generation_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'generate' CHECK (kind IN ('generate', 'extract', 'scaffold'));
ALTER TABLE generation_jobs ADD COLUMN session_id TEXT;
