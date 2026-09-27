-- Lane D (authoring at scope): a generation job keeps its remaining work items so it can
-- advance a few at a time each time the client polls (no queue consumer needed).
ALTER TABLE generation_jobs ADD COLUMN work TEXT NOT NULL DEFAULT '[]';        -- { lessonId, type }[] still to do
ALTER TABLE generation_jobs ADD COLUMN instruction TEXT NOT NULL DEFAULT '';
ALTER TABLE generation_jobs ADD COLUMN failures TEXT NOT NULL DEFAULT '[]';    -- { lessonId, type, message }[]
