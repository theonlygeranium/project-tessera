-- Night 3 carry-over 4: generation jobs can run in the background on Cloudflare
-- Workflows (production). `runner` says who advances a job: 'poll' (each status poll
-- advances it; previews, local, and demo mode) or 'workflow'.
ALTER TABLE generation_jobs ADD COLUMN runner TEXT NOT NULL DEFAULT 'poll' CHECK (runner IN ('poll', 'workflow'));
