-- Add social draft steps for the LinkedIn and X/Twitter post generation feature.
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'linkedin_draft';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'twitter_draft';
