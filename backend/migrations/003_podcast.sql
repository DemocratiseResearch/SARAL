-- Add podcast pipeline steps to step_name_enum
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'podcast_pdf_extract';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'podcast_script_gen';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'podcast_tts';

-- Track pipeline type (video or podcast)
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS pipeline_type TEXT NOT NULL DEFAULT 'video';
