-- Add reel pipeline steps to step_name_enum
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_script_gen';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_audio_gen';
ALTER TYPE step_name_enum ADD VALUE IF NOT EXISTS 'reel_video_gen';
