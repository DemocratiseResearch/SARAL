-- 007_checkpoint.sql
-- Checkpoint / resume support for pipeline runs.
--
-- failed_step  — the step that was running when the run was marked failed.
--                Set by the webhook failure handler and by the janitor.
--                Mirrors current_step at the moment of failure so the retry
--                handler knows exactly where to resume from.
--
-- checkpoint_data — JSONB blob accumulated after each successful step.
--                   Keys are GCS paths (e.g. pdf_extract_path, script_path,
--                   beamer_path, audio_manifest_path) that subsequent retry
--                   jobs can reuse without re-running earlier steps.
--                   Saved via a JSONB merge (||) so each step just adds its
--                   own key without overwriting prior steps.

ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS failed_step    TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS checkpoint_data JSONB;
