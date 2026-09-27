-- Tessera Night 1 schema (D-014). One row per entity; nested values are JSON text.
-- Apply: npx wrangler d1 migrations apply DB --remote            (production: tessera-prod)
--        npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
--        npx wrangler d1 migrations apply DB --local             (wrangler dev)
-- Data is seeded by the Worker on the first request to an empty database (shared/seed.ts).

CREATE TABLE institution (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  accent TEXT NOT NULL,
  setup_complete INTEGER NOT NULL DEFAULT 0,
  policy TEXT NOT NULL                -- AiPolicy JSON
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'instructor', 'student')),
  initials TEXT NOT NULL,
  profile TEXT                        -- LearningProfile JSON, students only
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  term TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  welcome TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '[]', -- string[] JSON
  instructor_ids TEXT NOT NULL DEFAULT '[]', -- Id[] JSON
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE TABLE enrollments (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX enrollments_user ON enrollments(user_id);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX modules_course ON modules(course_id, position);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TEXT
);
CREATE INDEX lessons_module ON lessons(module_id, position);
CREATE INDEX lessons_course ON lessons(course_id);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('heading', 'text', 'callout', 'image', 'check')),
  content TEXT NOT NULL,              -- BlockContent JSON (includes type)
  origin TEXT NOT NULL CHECK (origin IN ('human', 'ai')),
  ai_state TEXT CHECK (ai_state IN ('draft', 'kept')),
  provenance TEXT,                    -- Provenance JSON
  previous TEXT,                      -- BlockContent JSON
  updated_at TEXT NOT NULL
);
CREATE INDEX blocks_lesson ON blocks(lesson_id, position);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  origin TEXT NOT NULL CHECK (origin IN ('human', 'ai')),
  ai_state TEXT CHECK (ai_state IN ('draft', 'kept')),
  provenance TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX announcements_course ON announcements(course_id);

CREATE TABLE announcement_reads (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('not-started', 'in-progress', 'completed')),
  checks TEXT NOT NULL DEFAULT '{}',  -- Record<blockId, {correct, attempts}> JSON
  updated_at TEXT,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE builder_sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                 -- BuilderSession JSON
  created_at TEXT NOT NULL
);
CREATE INDEX builder_sessions_course ON builder_sessions(course_id, created_at);
