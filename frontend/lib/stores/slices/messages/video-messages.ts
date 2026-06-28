export const VIDEO_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  pdf_extract:       { processing: "Reading your PDF…",              completed: "PDF ready" },
  metadata_extract:  { processing: "Extracting paper details…",      completed: "Paper details ready" },
  script_gen:        { processing: "Generating presentation script…", completed: "Script ready" },
  beamer_compile:    { processing: "Compiling slides…",              completed: "Slides compiled" },
  audio_gen:         { processing: "Generating voice narration…",    completed: "Audio ready" },
  ffmpeg_stitch:     { processing: "Stitching final video…",         completed: "Video almost ready" },
  pipeline:          { completed: "Your video is ready!" },
};

export const VIDEO_START_MESSAGE = "Generating script…";
