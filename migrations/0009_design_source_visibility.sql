-- Design sources are staff-only from upload. Existing course files retain their visibility.
ALTER TABLE files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'course' CHECK (visibility IN ('course', 'staff'));
-- Existing outcomes stay visible; Night 4 design outcomes begin as drafts.
ALTER TABLE outcomes ADD COLUMN ai_state TEXT NOT NULL DEFAULT 'kept' CHECK (ai_state IN ('draft', 'kept'));
