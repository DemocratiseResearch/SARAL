-- Add metadata_extract as a valid pipeline step.
-- This step sits between pdf_extract and script_gen:
--   pdf_extract → metadata_extract (auto) → [user clicks Generate Video] → script_gen
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'metadata_extract';
