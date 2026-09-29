-- Identity v2 and course-bound tool sessions (D-045, D-046, D-048, D-052).
CREATE TABLE user_identities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access-email','lti')),
  key TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  linked_by TEXT NOT NULL CHECK (linked_by IN ('first-sign-in','admin')),
  last_seen_at TEXT,
  PRIMARY KEY (kind, key)
);
CREATE INDEX user_identities_user ON user_identities(user_id);

CREATE TABLE identity_link_suggestions (
  id TEXT PRIMARY KEY,
  identity_kind TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(identity_kind, identity_key, target_user_id)
);

CREATE TABLE tool_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('instructor','student')),
  platform_id TEXT NOT NULL,
  context_id TEXT NOT NULL,
  resource_link_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  return_url TEXT,
  revoked_at TEXT
);
CREATE INDEX tool_sessions_user_context ON tool_sessions(user_id, platform_id, context_id);

ALTER TABLE institution ADD COLUMN sso TEXT;
