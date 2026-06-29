import type { StateCreator } from "zustand";
import { generateBusinessBrief, getBusinessBrief, fetchBusinessBriefPdfBlob, connectBusinessBriefSSE } from "../../api";
import { getSSEStatusMessage } from "../../sse-messages";
import { patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { ArtifactStore } from "../artifact-store-types";
import { usePaperStore } from "../../paper-store";

export type BusinessBriefSlice = {
  startBusinessBriefGeneration: () => void;
};

export const createBusinessBriefSlice: StateCreator<ArtifactStore, [], [], BusinessBriefSlice> = (set, get) => ({
  startBusinessBriefGeneration: () => {
    const paperId = usePaperStore.getState().paperId;
    const id = `business-brief-${Date.now()}`;
    const artifact: Artifact = {
      id, type: "business-brief", status: "generating", progress: 10,
      config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language: "english" },
      scripts: [], imageAssignments: {},
    };

    if (!paperId) {
      set({ artifacts: [...get().artifacts, { ...artifact, status: "error", errorMessage: "No active paper — open a paper first" }], generatingModalOpen: true, generatingId: id });
      return;
    }

    set({ artifacts: [...get().artifacts, { ...artifact, paperId }], generatingModalOpen: true, generatingId: id });

    let estimatedProgress = 10;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let briefCompleted = false;
    let progressCeiling = 60;

    const fail = (msg: string) => {
      if (briefCompleted) return;
      briefCompleted = true;
      if (progressTimer) clearInterval(progressTimer);
      set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg, progress: 0 }) });
      setTimeout(() => { set({ generatingModalOpen: false, generatingId: null }); }, 1200);
    };

    const completeBrief = async () => {
      if (briefCompleted) return;
      briefCompleted = true;
      if (progressTimer) clearInterval(progressTimer);

      let sections: Record<string, string> | undefined;
      let modelVersion: "v1" | "v2" = "v1";
      try {
        const brief = await getBusinessBrief(paperId);
        sections = brief.sections;
        modelVersion = brief.model_version ?? "v1";
      } catch { /* ignore */ }

      let pdfBlobUrl: string | undefined;
      try {
        const blob = await fetchBusinessBriefPdfBlob(paperId);
        pdfBlobUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn("[brief-slice] PDF fetch failed — marking done without blob", err);
      }

      set({ artifacts: patchArtifact(get().artifacts, id, { status: "done", progress: 100, briefSections: sections, briefModelVersion: modelVersion, pdfBlobUrl }), selectedArtifactId: id });
      setTimeout(() => { set({ generatingModalOpen: false, generatingId: null }); }, 600);
    };

    const startPolling = (intervalMs: number, maxAttempts: number) => {
      if (briefCompleted) return;
      let attempts = 0;
      const timer = setInterval(async () => {
        if (briefCompleted) { clearInterval(timer); return; }
        attempts++;
        try {
          const brief = await getBusinessBrief(paperId);
          if (brief.status === "completed") { clearInterval(timer); await completeBrief(); }
          else if (brief.status === "failed") { clearInterval(timer); fail(brief.error_message ?? "Brief generation failed"); }
          else if (attempts >= maxAttempts) { clearInterval(timer); fail("poll_timeout"); }
        } catch {
          if (attempts >= maxAttempts) { clearInterval(timer); fail("poll_timeout"); }
        }
      }, intervalMs);
    };

    generateBusinessBrief(paperId)
      .then(() => {
        progressTimer = setInterval(() => {
          estimatedProgress = Math.min(estimatedProgress + 5, progressCeiling);
          get().updateProgress(id, estimatedProgress);
        }, 3000);

        setTimeout(() => startPolling(5000, 24), 12000);

        const sse = connectBusinessBriefSSE(paperId, async (event) => {
          if (event.status === "processing") {
            if (event.step === "business_brief_prepare_pdf") { progressCeiling = 75; estimatedProgress = Math.max(estimatedProgress, 55); get().updateProgress(id, estimatedProgress); }
            else if (event.step === "business_brief_pdf_render") { progressCeiling = 95; estimatedProgress = Math.max(estimatedProgress, 80); get().updateProgress(id, estimatedProgress); }
            set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: getSSEStatusMessage("business-brief", event.step, event.status, event.message) }) });
            return;
          }
          if (event.status === "completed") {
            if (event.step === "business_brief_pdf_render") { sse.close(); await completeBrief(); }
            else { set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: getSSEStatusMessage("business-brief", event.step, event.status, event.message) }) }); }
          } else if (event.status === "failed") {
            sse.close();
            briefCompleted = true;
            fail(event.message ?? "Pipeline step failed");
          }
        }, (err) => {
          console.warn("[brief-slice] SSE connection dropped, falling back to poll:", err);
          startPolling(4000, 30);
        });
      })
      .catch((err: unknown) => {
        fail(err instanceof Error ? err.message : "Failed to start generation");
      });
  },
});
