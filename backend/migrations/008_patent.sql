-- Patent support: track document source type and add patent script-gen step.

-- Mark whether a paper is a standard upload, an arxiv PDF, or a patent.
ALTER TABLE papers ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'paper';

-- New pipeline step name for the patent video script generation.
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'patent_script_gen';
