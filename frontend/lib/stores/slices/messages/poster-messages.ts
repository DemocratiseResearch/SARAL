export const POSTER_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  script_gen:           { processing: "Generating poster content…",    completed: "Content generated" },
  poster_image_extract: { processing: "Extracting poster images…",     completed: "Images extracted" },
  poster_compile:       { processing: "Compiling poster layout…",      completed: "Poster compiled" },
  pipeline:             { completed: "Your poster is ready!" },
};

export const POSTER_START_MESSAGE = "Starting poster pipeline…";
