export const PODCAST_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  podcast_script_gen: { processing: "Crafting podcast dialogue…",       completed: "Dialogue ready" },
  podcast_tts:        { processing: "Converting dialogue to speech…",   completed: "Audio generated" },
  ffmpeg_stitch:      { processing: "Rendering waveform video…",        completed: "Video rendered" },
  pipeline:           { completed: "Your podcast is ready!" },
};

export const PODCAST_START_MESSAGE = "Starting podcast pipeline…";
