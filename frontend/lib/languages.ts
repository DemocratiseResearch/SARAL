// Languages supported by the SARAL backend.
// `apiValue` is the exact value sent in API `language` fields. Most existing
// languages use lowercase names; Portuguese variants use BCP-47 codes.

import { REEL_LANGUAGES } from "@/lib/reel-languages";

export interface Language {
  displayName: string;
  apiValue: string;
}

export const LANGUAGES: Language[] = [
  { displayName: "Assamese", apiValue: "assamese" },
  { displayName: "Bengali", apiValue: "bengali" },
  { displayName: "Bodo", apiValue: "bodo" },
  { displayName: "Dogri", apiValue: "dogri" },
  { displayName: "English", apiValue: "english" },
  { displayName: "Gujarati", apiValue: "gujarati" },
  { displayName: "Hindi", apiValue: "hindi" },
  { displayName: "Kannada", apiValue: "kannada" },
  { displayName: "Konkani", apiValue: "konkani" },
  { displayName: "Maithili", apiValue: "maithili" },
  { displayName: "Malayalam", apiValue: "malayalam" },
  { displayName: "Manipuri", apiValue: "manipuri" },
  { displayName: "Marathi", apiValue: "marathi" },
  { displayName: "Nepali", apiValue: "nepali" },
  { displayName: "Odia", apiValue: "odia" },
  { displayName: "Portuguese (Brazil)", apiValue: "pt-BR" },
  { displayName: "Portuguese (Portugal)", apiValue: "pt-PT" },
  { displayName: "Punjabi", apiValue: "punjabi" },
  { displayName: "Sanskrit", apiValue: "sanskrit" },
  { displayName: "Santali", apiValue: "santali" },
  { displayName: "Tamil", apiValue: "tamil" },
  { displayName: "Telugu", apiValue: "telugu" },
  { displayName: "Urdu", apiValue: "urdu" },
];

/**
 * Resolve a stored language value to a human-readable display name.
 *
 * Pipelines store language inconsistently: reels use BCP-47 codes (e.g.
 * "ta-IN"), older non-reel values use lowercase English names (e.g. "tamil").
 * This checks both lists before falling back to a capitalised raw value, so
 * the same value renders identically on the artifact card and in previews.
 */
export function languageDisplayName(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const reelMatch = REEL_LANGUAGES.find(
    (l) => l.code.toLowerCase() === normalized,
  );
  if (reelMatch) return reelMatch.displayName;
  const match = LANGUAGES.find(
    (l) => l.apiValue.toLowerCase() === normalized,
  );
  if (match) return match.displayName;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
