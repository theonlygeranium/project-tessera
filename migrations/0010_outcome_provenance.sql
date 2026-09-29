-- Existing outcomes remain human-authored unless a later write supplies provenance.
ALTER TABLE outcomes ADD COLUMN provenance TEXT NULL;
