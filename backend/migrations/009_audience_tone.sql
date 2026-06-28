-- Add user-selectable script-generation knobs to pipeline_runs.
-- audience_level controls DEPTH (novice / intermediate / expert).
-- tone           controls REGISTER (formal / conversational / hinglish).
-- Both default to today's effective behavior so existing runs keep working.
ALTER TABLE pipeline_runs
    ADD COLUMN IF NOT EXISTS audience_level VARCHAR(20) NOT NULL DEFAULT 'intermediate',
    ADD COLUMN IF NOT EXISTS tone           VARCHAR(20) NOT NULL DEFAULT 'formal';
