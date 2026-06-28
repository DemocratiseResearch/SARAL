// BCP-47 language codes accepted by the reel pipeline backend.
// Other pipelines use lowercase English names (e.g. "english"); reel uses
// codes like "en-IN". Keep this list in sync with the backend's supported set.

export interface ReelLanguage {
  code: string; // exact code sent to backend
  displayName: string;
}

export const REEL_LANGUAGES: ReelLanguage[] = [
  { code: "en-IN", displayName: "English" },
  { code: "hi-IN", displayName: "Hindi" },
  { code: "bn-IN", displayName: "Bengali" },
  { code: "ta-IN", displayName: "Tamil" },
  { code: "te-IN", displayName: "Telugu" },
  { code: "kn-IN", displayName: "Kannada" },
  { code: "ml-IN", displayName: "Malayalam" },
  { code: "mr-IN", displayName: "Marathi" },
  { code: "gu-IN", displayName: "Gujarati" },
  { code: "pa-IN", displayName: "Punjabi" },
  { code: "od-IN", displayName: "Odia" },
  { code: "pt-BR", displayName: "Portuguese (Brazil)" },
  { code: "pt-PT", displayName: "Portuguese (Portugal)" },
];

export const DEFAULT_REEL_LANGUAGE = "en-IN";

// Display label for the contractual Person1 / Person2 speaker IDs.
// Person1 is the female speaker, Person2 is the male speaker.
export const REEL_SPEAKER_LABELS: Record<"Person1" | "Person2", string> = {
  Person1: "Speaker 1",
  Person2: "Speaker 2",
};
