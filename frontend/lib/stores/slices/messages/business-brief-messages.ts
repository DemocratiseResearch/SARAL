export const BUSINESS_BRIEF_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  business_brief_script:      { processing: "Generating business brief content…", completed: "Content generated" },
  business_brief_prepare_pdf: { processing: "Preparing data for PDF…",            completed: "Data prepared" },
  business_brief_pdf_render:  { processing: "Compiling business brief PDF…",      completed: "Business brief ready" },
};

export const BUSINESS_BRIEF_START_MESSAGE = "Starting generation…";
