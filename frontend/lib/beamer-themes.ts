// Beamer theme presets exposed in the presentation/video config modals.
// `value` is the key sent to the backend (matches BEAMER_THEMES in
// services/beamer/latex_template.py). `preview` is a screenshot of the
// actual rendered output so users can pick visually instead of reading
// theme names.
export const BEAMER_THEMES = [
  { value: "saral", label: "Classic Blue", preview: "/theme-previews/saral.png" },
  { value: "metropolis", label: "Slate Modern", preview: "/theme-previews/metropolis.png" },
  { value: "berkeley", label: "Light Sidebar", preview: "/theme-previews/berkeley.png" },
  { value: "cambridgeus", label: "Crimson", preview: "/theme-previews/cambridgeus.png" },
  { value: "paloalto", label: "Navy Sidebar", preview: "/theme-previews/paloalto.png" },
] as const;

export const DEFAULT_BEAMER_THEME = "saral";

export type BeamerThemeValue = (typeof BEAMER_THEMES)[number]["value"];
