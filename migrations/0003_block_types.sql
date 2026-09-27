-- Night 2 block types (D-022 plan §5): widen the blocks.type CHECK from 0001, which
-- allowed only the original five. SQLite can't alter a CHECK, so the table is rebuilt.
-- Nothing references blocks, so dropping the old table is safe.
CREATE TABLE blocks_new (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('heading', 'text', 'callout', 'image', 'check', 'document', 'file', 'video', 'table', 'scenario', 'link')),
  content TEXT NOT NULL,              -- BlockContent JSON (includes type)
  origin TEXT NOT NULL CHECK (origin IN ('human', 'ai')),
  ai_state TEXT CHECK (ai_state IN ('draft', 'kept')),
  provenance TEXT,                    -- Provenance JSON
  previous TEXT,                      -- BlockContent JSON
  updated_at TEXT NOT NULL
);
INSERT INTO blocks_new (id, lesson_id, position, type, content, origin, ai_state, provenance, previous, updated_at)
  SELECT id, lesson_id, position, type, content, origin, ai_state, provenance, previous, updated_at FROM blocks;
DROP TABLE blocks;
ALTER TABLE blocks_new RENAME TO blocks;
CREATE INDEX blocks_lesson ON blocks(lesson_id, position);
