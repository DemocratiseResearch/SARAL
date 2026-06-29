import { create } from "zustand";
import { uploadPaper, ingestArxiv, getRunStatus, connectSSE } from "../api";
import type { SSEEvent } from "../types";
import { getSSEStatusMessage, getSSEErrorMessage } from "../sse-messages";
import { usePapersStore } from "./papers-store";

export type ProcessingStatus = "idle" | "uploading" | "processing" | "done" | "error";

export interface PaperMetadata {
  title: string;
  authors: string;
  year: string;
}

interface UploadState {
  file: File | null;
  isPatent: boolean;
  status: ProcessingStatus;
  processingStep: string;
  metadata: PaperMetadata;
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
  /** Create a SavedPaper entry in papers-store from the current upload state. */
  commitPaper: () => string;
  /** Load a previously saved paper's runId/paperId/metadata back into upload state. */
  loadPaper: (id: string) => void;
  reset: () => void;
}

const DEFAULT_METADATA: PaperMetadata = { title: "", authors: "", year: "" };

const INITIAL: Omit<UploadState, keyof Pick<UploadState, "setFile" | "setIsPatent" | "startUpload" | "startArxivIngest" | "setProcessingStep" | "setDone" | "setError" | "setMetadata" | "commitPaper" | "loadPaper" | "reset">> = {
  file: null,
  isPatent: false,
  status: "idle",
  processingStep: "",
  metadata: DEFAULT_METADATA,
  runId: null,
  paperId: null,
  sseConnection: null,
};

export const useUploadStore = create<UploadState>()((set, get) => ({
  ...INITIAL,

  setFile: (file) => set({ file }),
  setIsPatent: (isPatent) => set({ isPatent }),

  startUpload: async () => {
    const { file } = get();
    if (!file) return;
    set({ status: "uploading", processingStep: "Uploading paper…" });

    try {
      const res = await uploadPaper(file);
      set({ runId: res.run_id, paperId: res.paper_id, status: "processing", processingStep: "Processing started…" });

      let metadataCompleted = false;
      const esRef: { close: () => void } = { close: () => {} };

      const completeMetadata = (title: string, authors: string) => {
        if (metadataCompleted) return;
        metadataCompleted = true;
        esRef.close();
        set({
          sseConnection: null,
          status: "done",
          processingStep: getSSEStatusMessage("paper-upload", "metadata_extract", "completed"),
          metadata: { title: title || "", authors: authors || "", year: "" },
        });
      };

      const es = connectSSE(res.run_id, (event: SSEEvent) => {
        set({ processingStep: getSSEStatusMessage("paper-upload", event.step, event.status, event.message) });
        if (event.step === "metadata_extract" && event.status === "completed") {
          completeMetadata(
            typeof event.data?.title === "string" ? event.data.title : "",
            typeof event.data?.authors === "string" ? event.data.authors : "",
          );
        }
        if (event.status === "failed" && !metadataCompleted) {
          metadataCompleted = true;
          esRef.close();
          set({ sseConnection: null });
          get().setError(getSSEErrorMessage());
        }
      }, (err) => {
        console.error("[upload-store] SSE error:", err);
        set({ sseConnection: null });
      });

      esRef.close = () => es.close();
      set({ sseConnection: es });

      getRunStatus(res.run_id).then((run) => {
        const metaStep = (run.steps ?? []).find((s) => s.name === "metadata_extract");
        if (metaStep?.status === "completed") { completeMetadata("", ""); return; }
        if (run.status === "failed" && !metadataCompleted) {
          metadataCompleted = true;
          esRef.close();
          set({ sseConnection: null });
          get().setError(run.error_message || "Pipeline failed");
        }
      }).catch((err) => console.error("[upload-store] /status poll failed:", err));
    } catch {
      set({ status: "error", processingStep: getSSEErrorMessage() });
    }
  },

  startArxivIngest: async (url: string) => {
    set({ status: "uploading", processingStep: "Fetching paper from arXiv…" });

    try {
      const res = await ingestArxiv(url);
      set({ runId: res.run_id, paperId: res.paper_id, status: "processing", processingStep: "Processing started…" });

      let metadataCompleted = false;
      const esRef: { close: () => void } = { close: () => {} };

      const completeMetadata = (title: string, authors: string) => {
        if (metadataCompleted) return;
        metadataCompleted = true;
        esRef.close();
        set({
          sseConnection: null,
          status: "done",
          processingStep: getSSEStatusMessage("paper-upload", "metadata_extract", "completed"),
          metadata: { title: title || "", authors: authors || "", year: "" },
        });
      };

      const es = connectSSE(res.run_id, (event: SSEEvent) => {
        set({ processingStep: getSSEStatusMessage("paper-upload", event.step, event.status, event.message) });
        if (event.step === "metadata_extract" && event.status === "completed") {
          completeMetadata(
            typeof event.data?.title === "string" ? event.data.title : "",
            typeof event.data?.authors === "string" ? event.data.authors : "",
          );
        }
        if (event.status === "failed" && !metadataCompleted) {
          metadataCompleted = true;
          esRef.close();
          set({ sseConnection: null });
          get().setError(getSSEErrorMessage());
        }
      }, (err) => {
        console.error("[upload-store] arXiv SSE error:", err);
        set({ sseConnection: null });
      });

      esRef.close = () => es.close();
      set({ sseConnection: es });

      getRunStatus(res.run_id).then((run) => {
        const metaStep = (run.steps ?? []).find((s) => s.name === "metadata_extract");
        if (metaStep?.status === "completed") { completeMetadata("", ""); return; }
        if (run.status === "failed" && !metadataCompleted) {
          metadataCompleted = true;
          esRef.close();
          set({ sseConnection: null });
          get().setError(run.error_message || "Pipeline failed");
        }
      }).catch((err) => console.error("[upload-store] arXiv /status poll failed:", err));
    } catch (err) {
      set({ status: "error", processingStep: err instanceof Error ? err.message : getSSEErrorMessage() });
    }
  },

  setProcessingStep: (processingStep) => set({ processingStep }),
  setDone: () => set({ status: "done", processingStep: "Complete!" }),
  setError: (msg) => set({ status: "error", processingStep: msg ?? "Something went wrong." }),
  setMetadata: (patch) => set((s) => ({ metadata: { ...s.metadata, ...patch } })),

  commitPaper: () => {
    const { metadata, runId, paperId } = get();
    return usePapersStore.getState().addPaper({
      runId: runId ?? "",
      paperId: paperId ?? "",
      title: metadata.title || "Untitled Paper",
      authors: metadata.authors || "Unknown Authors",
      year: metadata.year || "",
    });
  },

  loadPaper: (id) => {
    const paper = usePapersStore.getState().papers.find((p) => p.id === id || p.paperId === id);
    if (paper) {
      set({
        runId: paper.runId,
        paperId: paper.paperId,
        metadata: { title: paper.title, authors: paper.authors, year: paper.year },
        status: "idle",
      });
    }
  },

  reset: () => {
    const { sseConnection } = get();
    if (sseConnection) sseConnection.close();
    set({ ...INITIAL });
  },
}));
