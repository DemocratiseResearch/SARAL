import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uploadPaper, ingestArxiv, getRunStatus, connectSSE } from "./api";
import type { SSEEvent } from "./types";
import { getSSEStatusMessage, getSSEErrorMessage } from "./sse-messages";

export type ProcessingStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "done"
  | "error";

export interface PaperMetadata {
  title: string;
  authors: string;
  year: string;
}

export interface SavedPaper {
  id: string;
  runId: string;
  paperId: string;
  title: string;
  authors: string;
  year: string;
  createdAt: string;
}

interface PaperState {
  file: File | null;
  isPatent: boolean;
  status: ProcessingStatus;
  processingStep: string;
  metadata: PaperMetadata;
  papers: SavedPaper[];
  runId: string | null;
  paperId: string | null;
  sseConnection: { close: () => void } | null;

  setFile: (file: File | null) => void;
  setIsPatent: (val: boolean) => void;
  startUpload: () => Promise<void>;
  startArxivIngest: (url: string) => Promise<void>;
  setProcessingStep: (step: string) => void;
  setDone: () => void;
  setError: (msg?: string) => void;
  setMetadata: (patch: Partial<PaperMetadata>) => void;
  addPaper: () => string;
  loadPaper: (id: string) => void;
  reset: () => void;
  /** Full wipe including the papers list — call on logout only. */
  fullReset: () => void;
}

const DEFAULT_METADATA: PaperMetadata = {
  title: "",
  authors: "",
  year: "",
};

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => ({
      file: null,
      isPatent: false,
      status: "idle",
      processingStep: "",
      metadata: DEFAULT_METADATA,
      papers: [],
      runId: null,
      paperId: null,
      sseConnection: null,

      setFile: (file) => set({ file }),
      setIsPatent: (isPatent) => set({ isPatent }),

      startUpload: async () => {
        const { file } = get();
        if (!file) return;

        set({ status: "uploading", processingStep: "Uploading paper…" });

        try {
          const res = await uploadPaper(file);
          console.log("[paper-store] upload ok — run_id:", res.run_id);

          set({
            runId: res.run_id,
            paperId: res.paper_id,
            status: "processing",
            processingStep: "Processing started…",
          });

          // Guard flag: prevents double-firing if both SSE and status poll
          // detect metadata_extract completion around the same time.
          let metadataCompleted = false;

          // Mutable ref for close() so completeMetadata can close the SSE stream
          const esRef: { close: () => void } = { close: () => {} };

          const completeMetadata = (title: string, authors: string) => {
            if (metadataCompleted) return;
            metadataCompleted = true;
            esRef.close();
            set({ sseConnection: null });

            console.log("[paper-store] metadata_extract done — title:", title);
            set({
              status: "done",
              processingStep: getSSEStatusMessage(
                "paper-upload",
                "metadata_extract",
                "completed",
              ),
              metadata: {
                title: title || "",
                authors: authors || "",
                year: "",
              },
            });
          };

          // ── Open SSE stream ────────────────────────────────────────────────────
          const es = connectSSE(
            res.run_id,
            (event: SSEEvent) => {
              console.log(
                "[SSE event]",
                event.step,
                event.status,
                "—",
                event.message,
              );
              set({
                processingStep: getSSEStatusMessage(
                  "paper-upload",
                  event.step,
                  event.status,
                  event.message,
                ),
              });

              // Gate event: pipeline pauses here. Populate metadata from event.data.
              if (
                event.step === "metadata_extract" &&
                event.status === "completed"
              ) {
                const title =
                  typeof event.data?.title === "string"
                    ? event.data.title
                    : "";
                const authors =
                  typeof event.data?.authors === "string"
                    ? event.data.authors
                    : "";
                completeMetadata(title, authors);
              }

              if (event.status === "failed" && !metadataCompleted) {
                console.error("[SSE] step failed:", event.step, event.message);
                metadataCompleted = true;
                esRef.close();
                set({ sseConnection: null });
                get().setError(getSSEErrorMessage());
              }
            },
            (err) => {
              console.error("[SSE] connection error:", err);
              set({ sseConnection: null });
            },
          );

          esRef.close = () => es.close();
          set({ sseConnection: es });

          // ── /status poll fallback ──────────────────────────────────────────────
          console.log("[paper-store] /status poll — run_id:", res.run_id);
          getRunStatus(res.run_id)
            .then((run) => {
              console.log(
                "[paper-store] /status response:",
                run.current_step,
                run.status,
                run.steps,
              );
              const steps = run.steps ?? [];

              const metaStep = steps.find((s) => s.name === "metadata_extract");
              if (metaStep?.status === "completed") {
                console.log(
                  "[paper-store] metadata_extract already done — caught via /status poll",
                );
                // We don't have event.data here, so use empty strings;
                // the UI will let the user fill in via the metadata form.
                completeMetadata("", "");
                return;
              }

              if (run.status === "failed" && !metadataCompleted) {
                metadataCompleted = true;
                esRef.close();
                set({ sseConnection: null });
                get().setError(run.error_message || "Pipeline failed");
              }
            })
            .catch((err) =>
              console.error("[paper-store] /status poll failed:", err),
            );
        } catch (err) {
          set({
            status: "error",
            processingStep: getSSEErrorMessage(),
          });
        }
      },

      startArxivIngest: async (url: string) => {
        set({
          status: "uploading",
          processingStep: "Fetching paper from arXiv…",
        });

        try {
          const res = await ingestArxiv(url);
          console.log("[paper-store] arxiv ingest ok — run_id:", res.run_id);

          set({
            runId: res.run_id,
            paperId: res.paper_id,
            status: "processing",
            processingStep: "Processing started…",
          });

          let metadataCompleted = false;
          const esRef: { close: () => void } = { close: () => {} };

          const completeMetadata = (title: string, authors: string) => {
            if (metadataCompleted) return;
            metadataCompleted = true;
            esRef.close();
            set({ sseConnection: null });

            console.log(
              "[paper-store] arxiv metadata_extract done — title:",
              title,
            );
            set({
              status: "done",
              processingStep: getSSEStatusMessage(
                "paper-upload",
                "metadata_extract",
                "completed",
              ),
              metadata: {
                title: title || "",
                authors: authors || "",
                year: "",
              },
            });
          };

          const es = connectSSE(
            res.run_id,
            (event: SSEEvent) => {
              console.log(
                "[SSE arxiv]",
                event.step,
                event.status,
                "—",
                event.message,
              );
              set({
                processingStep: getSSEStatusMessage(
                  "paper-upload",
                  event.step,
                  event.status,
                  event.message,
                ),
              });

              if (
                event.step === "metadata_extract" &&
                event.status === "completed"
              ) {
                completeMetadata(
                  typeof event.data?.title === "string"
                    ? event.data.title
                    : "",
                  typeof event.data?.authors === "string"
                    ? event.data.authors
                    : "",
                );
              }

              if (event.status === "failed" && !metadataCompleted) {
                metadataCompleted = true;
                esRef.close();
                set({ sseConnection: null });
                get().setError(getSSEErrorMessage());
              }
            },
            (err) => {
              console.error("[SSE arxiv] connection error:", err);
              set({ sseConnection: null });
            },
          );

          esRef.close = () => es.close();
          set({ sseConnection: es });

          getRunStatus(res.run_id)
            .then((run) => {
              const steps = run.steps ?? [];
              const metaStep = steps.find((s) => s.name === "metadata_extract");
              if (metaStep?.status === "completed") {
                completeMetadata("", "");
                return;
              }
              if (run.status === "failed" && !metadataCompleted) {
                metadataCompleted = true;
                esRef.close();
                set({ sseConnection: null });
                get().setError(run.error_message || "Pipeline failed");
              }
            })
            .catch((err) =>
              console.error("[paper-store] arxiv /status poll failed:", err),
            );
        } catch (err) {
          set({
            status: "error",
            processingStep:
              err instanceof Error ? err.message : getSSEErrorMessage(),
          });
        }
      },

      setProcessingStep: (processingStep) => set({ processingStep }),

      setDone: () =>
        set({
          status: "done",
          processingStep: "Complete!",
        }),

      setError: (msg) =>
        set({
          status: "error",
          processingStep: msg ?? "Something went wrong.",
        }),

      setMetadata: (patch) =>
        set((state) => ({ metadata: { ...state.metadata, ...patch } })),

      addPaper: () => {
        const { metadata, papers, runId, paperId } = get();
        const paper: SavedPaper = {
          id: `paper-${Date.now()}`,
          runId: runId ?? "",
          paperId: paperId ?? "",
          title: metadata.title || "Untitled Paper",
          authors: metadata.authors || "Unknown Authors",
          year: metadata.year || "",
          createdAt: new Date().toISOString(),
        };
        set({ papers: [paper, ...papers] });
        return paper.id;
      },

      /** `id` may be the client list id (`paper-…`) or the backend `paper_id`
       * (artifacts and deep links use the latter; the papers grid uses the former). */
      loadPaper: (id) => {
        const paper = get().papers.find(
          (p) => p.id === id || p.paperId === id,
        );
        if (paper) {
          set({
            runId: paper.runId,
            paperId: paper.paperId,
            metadata: {
              title: paper.title,
              authors: paper.authors,
              year: paper.year,
            },
            status: "idle",
          });
        }
      },

      reset: () => {
        const { sseConnection } = get();
        if (sseConnection) sseConnection.close();
        set({
          file: null,
          isPatent: false,
          status: "idle",
          processingStep: "",
          metadata: DEFAULT_METADATA,
          // papers intentionally preserved — do NOT reset
          runId: null,
          paperId: null,
          sseConnection: null,
        });
      },

      fullReset: () => {
        const { sseConnection } = get();
        if (sseConnection) sseConnection.close();
        set({
          file: null,
          isPatent: false,
          status: "idle",
          processingStep: "",
          metadata: DEFAULT_METADATA,
          papers: [],
          runId: null,
          paperId: null,
          sseConnection: null,
        });
      },
    }),
    {
      name: "saral-paper-store",
      partialize: (state) => ({ papers: state.papers }),
    },
  ),
);
