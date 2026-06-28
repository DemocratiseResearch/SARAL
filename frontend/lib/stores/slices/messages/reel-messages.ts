export const REEL_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  reel_script_gen: { processing: "Writing reel dialogue…",   completed: "Dialogue ready" },
  reel_audio_gen:  { processing: "Generating reel audio…",   completed: "Audio ready" },
  reel_video_gen:  { processing: "Rendering reel video…",    completed: "Video rendered" },
  pipeline:        { completed: "Your reel is ready!" },
};

export const REEL_START_MESSAGE = "Starting reel pipeline…";
