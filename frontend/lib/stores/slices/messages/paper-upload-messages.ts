export const PAPER_UPLOAD_MESSAGES: Record<string, Partial<Record<"processing" | "completed", string>>> = {
  pdf_extract:      { processing: "Reading your PDF…",             completed: "PDF ready" },
  metadata_extract: { processing: "Extracting paper metadata…",    completed: "Metadata extracted" },
};

export const PAPER_UPLOAD_START_MESSAGE = "Uploading paper…";
