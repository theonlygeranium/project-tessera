-- Additive LTI core storage. 0010-0013 are reserved by parallel work.
CREATE TABLE lti_platforms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, issuer TEXT NOT NULL, client_id TEXT NOT NULL,
  deployment_ids TEXT NOT NULL, auth_login_url TEXT NOT NULL, auth_token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL, registered_via TEXT NOT NULL, status TEXT NOT NULL,
  services TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  last_launch_at TEXT, UNIQUE(issuer, client_id)
);
CREATE TABLE lti_contexts (
  id TEXT PRIMARY KEY, platform_id TEXT NOT NULL REFERENCES lti_platforms(id),
  deployment_id TEXT NOT NULL, context_id TEXT NOT NULL, title TEXT NOT NULL,
  label TEXT NOT NULL, course_id TEXT REFERENCES courses(id), linked_by TEXT REFERENCES users(id),
  linked_at TEXT, nrps_url TEXT, ags_line_items_url TEXT, last_roster_sync_at TEXT,
  UNIQUE(platform_id, deployment_id, context_id)
);
CREATE TABLE lti_replay (
  kind TEXT NOT NULL CHECK(kind IN ('state','nonce')), key TEXT NOT NULL,
  expires_at TEXT NOT NULL, PRIMARY KEY(kind,key)
);
CREATE TABLE lti_link_tickets (
  token_hash TEXT PRIMARY KEY, context_id TEXT NOT NULL REFERENCES lti_contexts(id),
  user_id TEXT NOT NULL REFERENCES users(id), resource_link_id TEXT NOT NULL,
  expires_at TEXT NOT NULL, used_at TEXT
);
