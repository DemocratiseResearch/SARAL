CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMs for type safety
CREATE TYPE step_name_enum AS ENUM (
  'pdf_extract',
  'metadata_extract',
  'script_gen',
  'beamer_compile',
  'audio_gen',
  'ffmpeg_stitch',
  'poster_compile',
  'podcast_pdf_extract',
  'podcast_script_gen',
  'podcast_tts'
);

CREATE TYPE status_enum AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid  TEXT UNIQUE NOT NULL,
  email         TEXT,
  gemini_key    TEXT,
  sarvam_key    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Social sharing OAuth tokens. Person/user identifiers are cached at
  -- connect time so share requests skip the extra lookup.
  youtube_access_token    TEXT,
  youtube_refresh_token   TEXT,
  youtube_token_expiry    TIMESTAMPTZ,

  linkedin_access_token   TEXT,
  linkedin_refresh_token  TEXT,
  linkedin_token_expiry   TIMESTAMPTZ,
  linkedin_person_urn     TEXT
);

CREATE TABLE papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  gcs_source_path TEXT NOT NULL,    -- s3://saral-artifacts-local/user/paper/source/paper.pdf
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pipeline_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id      UUID REFERENCES papers(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  status        status_enum DEFAULT 'pending',
  current_step  step_name_enum,
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE pipeline_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_name       step_name_enum NOT NULL,
  status          status_enum DEFAULT 'pending',
  gcs_output_path TEXT,             -- where this step's output lives in object storage
  error_message   TEXT,
  retry_count     INT DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE artifacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,      -- 'video', 'slides_pdf', 'audio', 'script_json', etc.
  gcs_path      TEXT NOT NULL,
  size_bytes    BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_paper     ON pipeline_runs(paper_id);
CREATE INDEX idx_runs_user      ON pipeline_runs(user_id);

-- Poster pipeline additions
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'poster_compile';
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'video';
CREATE INDEX idx_runs_status    ON pipeline_runs(status);
CREATE INDEX idx_steps_run      ON pipeline_steps(run_id);
CREATE INDEX idx_artifacts_run  ON artifacts(run_id);
CREATE INDEX idx_artifacts_type ON artifacts(run_id, artifact_type);

-- Paper metadata (populated by script-gen worker after Gemini metadata extraction)
ALTER TABLE papers ADD COLUMN IF NOT EXISTS paper_title   TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS paper_authors TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS paper_date    TEXT;

-- User sign-in provider tracking (populated by auth middleware on every login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_provider TEXT DEFAULT 'unknown';

-- Checkpoint / resume support for pipeline runs (migration 007)
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS failed_step    TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS checkpoint_data JSONB;



-- Business briefs — one per paper. Independent of the video pipeline.
-- Triggered after pdf_extract completes; reads the extracted text from GCS.
CREATE TABLE business_briefs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id       UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         status_enum DEFAULT 'pending',       -- pending/processing/completed/failed
  sections       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 8-section map from Gemini
  model_version  TEXT DEFAULT 'v1',                   -- 'v1' (flash, no grounding) | 'v2' (pro+grounded)
  json_gcs_path  TEXT,                                -- raw Gemini JSON in GCS (audit trail)
  pdf_gcs_path   TEXT,                                -- rendered PDF in GCS
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(paper_id)
);
CREATE INDEX idx_business_briefs_user ON business_briefs(user_id);


-- Idempotent ALTERs so an existing local DB picks up schema tweaks without
-- a wipe. init.sql is never re-run fully on prod, but these are safe.
ALTER TABLE business_briefs ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'v1';
ALTER TABLE business_briefs DROP COLUMN IF EXISTS citations;

-- Reel pipeline (see also migrations/004_reel.sql for existing databases)
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_script_gen';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_audio_gen';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_video_gen';


-- Add metadata_extract as a valid pipeline step.
-- This step sits between pdf_extract and script_gen:
--   pdf_extract → metadata_extract (auto) → [user clicks Generate Video] → script_gen
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'metadata_extract';

-- Add social draft steps for the LinkedIn and X/Twitter post generation feature.
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'linkedin_draft';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'twitter_draft';

-- Slides-only pipeline: optional user-uploaded PPTX template per run
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS slides_template_gcs_path TEXT;


-- Patent support (migration 008)
ALTER TABLE papers ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'paper';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'patent_script_gen';


