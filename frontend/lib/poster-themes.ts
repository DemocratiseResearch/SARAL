// Poster theme and layout presets for research paper posters.
// Values match the backend poster engine (solution/poster/themes.py and solution/poster/layouts.py).

export const POSTER_THEMES = [
  { value: "classic_navy", label: "Classic Navy (Gemini)" },
  { value: "teal_emerald", label: "Biomedical Emerald" },
  { value: "crimson_burgundy", label: "Crimson Academic" },
  { value: "slate_indigo", label: "Slate Modern" },
  { value: "amber_earth", label: "Earth Amber" },
] as const;

export const DEFAULT_POSTER_THEME = "classic_navy";

export type PosterThemeValue = (typeof POSTER_THEMES)[number]["value"];

export const POSTER_LAYOUTS = [
  { value: "structured_grid", label: "Structured Academic Grid", description: "Classic balanced 3-column academic conference poster" },
  { value: "takeaway_led", label: "Takeaway-Led (Headline)", description: "High-impact hero banner emphasizing the central finding" },
  { value: "workflow_led", label: "Systems & Workflow", description: "Emphasizes technical architecture, pipelines, and methodology" },
] as const;

export const DEFAULT_POSTER_LAYOUT = "structured_grid";

export type PosterLayoutValue = (typeof POSTER_LAYOUTS)[number]["value"];
