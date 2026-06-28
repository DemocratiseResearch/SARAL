export const SOCIAL_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  linkedin_draft: { processing: "Drafting LinkedIn post…",        completed: "LinkedIn post ready" },
  twitter_draft:  { processing: "Drafting X/Twitter thread…",     completed: "X/Twitter thread ready" },
  _done:          { completed: "Social drafts ready" },
};

export const SOCIAL_START_MESSAGE = "Generating social drafts…";
