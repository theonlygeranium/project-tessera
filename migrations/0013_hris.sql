-- HRIS compliance M1 (D-085, D-086). Additive; no existing table is changed.
-- Immutable effective-dated worker versions. Demo reset clears these rows; the UPDATE
-- trigger enforces version immutability. DELETE is reserved for the existing reset path.
CREATE TABLE worker_records (
  employee_id TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('csv','json')),
  import_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  job_code TEXT NOT NULL,
  job_title TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full-time','part-time','contractor','temporary','other')),
  manager_employee_id TEXT,
  hire_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','leave','terminated')),
  PRIMARY KEY (employee_id, effective_at)
);
CREATE INDEX worker_records_email ON worker_records(lower(email));
CREATE TRIGGER worker_records_no_update BEFORE UPDATE ON worker_records
BEGIN SELECT RAISE(ABORT, 'worker records are append-only'); END;

-- One confirmed Tessera user per employee, and one employee per user.
CREATE TABLE worker_links (
  employee_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  linked_by TEXT NOT NULL,
  linked_at TEXT NOT NULL
);

-- Single-institution column map; make the key per-institution when tenancy exists.
CREATE TABLE worker_column_maps (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  columns TEXT NOT NULL,
  date_format TEXT NOT NULL CHECK (date_format IN ('iso','mdy','dmy')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Applied import receipts contain counts, never raw HR source content.
CREATE TABLE hr_imports (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  source_hash TEXT NOT NULL,
  at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('csv','json')),
  counts TEXT NOT NULL,
  skipped_rows INTEGER NOT NULL,
  incomplete INTEGER DEFAULT 0 CHECK (incomplete IN (0,1))
);
CREATE INDEX hr_imports_hash ON hr_imports(hash);

-- Revision of successful HR record and link inserts; guards rule membership CAS.
CREATE TABLE hr_state (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  revision INTEGER NOT NULL
);

-- CAS-controlled membership for requirements with a rule audience.
CREATE TABLE rule_members (
  requirement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('assigned','removed')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  reasons TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  PRIMARY KEY (requirement_id, user_id)
);
