-- Paper → slides/PDF pipeline (no video/audio/ffmpeg).
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS slides_template_gcs_path TEXT;
