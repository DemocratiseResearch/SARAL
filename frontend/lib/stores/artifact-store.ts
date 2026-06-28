import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getScript } from "../api";
import { patchArtifact, isModalBlocked } from "./artifact-helpers";
import { MOCK_SCRIPTS } from "./artifact-types";
import type { Artifact, ArtifactType, ArtifactConfig, ScriptSection } from "./artifact-types";
import type { VideoConfig } from "../types";
import type { ArtifactStore } from "./artifact-store-types";
export type { ActiveModal } from "./artifact-store-types";
import { createVideoSlice } from "./slices/video-slice";
import { createPodcastSlice } from "./slices/podcast-slice";
import { createPosterSlice } from "./slices/poster-slice";
import { createPresentationSlice } from "./slices/presentation-slice";
import { createReelSlice } from "./slices/reel-slice";
import { createSocialSlice } from "./slices/social-slice";
import { createBusinessBriefSlice } from "./slices/business-brief-slice";
import { usePaperStore } from "../paper-store";

const INITIAL_STATE = {
  artifacts: [] as Artifact[],
  selectedArtifactId: null as string | null,
  editModalOpen: false,
  editModalTriggeredByPipeline: false,
  editModalOriginalConfig: null as ArtifactConfig | null,
  previewModalOpen: false,
  previewSocialTab: null as "linkedin" | "twitter" | null,
  previewInitialView: "preview" as "preview" | "share-menu",
  previewVideoResume: null as { seconds: number; autoplay: boolean } | null,
  generatingModalOpen: false,
  dismissedArtifactIds: [] as string[],
  generatingId: null as string | null,
  podcastConfigModalOpen: false,
  podcastConfigPaperId: null as string | null,
  videoConfigModalOpen: false,
  videoConfigRunId: null as string | null,
  reelConfigModalOpen: false,
  reelConfigPaperId: null as string | null,
  reelScriptModalOpen: false,
  reelAvatarModalOpen: false,
  presentationConfigModalOpen: false,
  presentationConfigPaperId: null as string | null,
};

export const useArtifactStore = create<ArtifactStore>()(
  persist(
    (set, get, api) => ({
      ...INITIAL_STATE,

      // Each createXSlice(set, get, api) call returns a plain object of closures.
      // The closures capture `set` and `get` which are the top-level store's
      // setState/getState — so get() inside any slice method returns the full
      // merged store, letting slices call each other's methods. This is the
      // standard Zustand slice pattern (pmnd.rs/zustand/guides/slices-pattern).
      ...createVideoSlice(set, get, api),
      ...createPodcastSlice(set, get, api),
      ...createPosterSlice(set, get, api),
      ...createPresentationSlice(set, get, api),
      ...createReelSlice(set, get, api),
      ...createSocialSlice(set, get, api),
      ...createBusinessBriefSlice(set, get, api),

      // ── Internal helpers used by slices ───────────────────────────────────

      _failRetry: (id, msg) => {
        set({
          artifacts: get().artifacts.map((x: Artifact) => x.id !== id ? x : {
            ...x, status: "error" as const, errorMessage: msg, statusMessage: msg,
            ...(x.type === "reel" ? { reelStage: "failed" as const, reelErrorMessage: msg } : {}),
            ...(x.type === "podcast" ? { podcastStep: "error" as const } : {}),
          }),
          generatingModalOpen: false, generatingId: null,
        });
      },

      _updateRetryState: (id, msg) => {
        set({
          artifacts: get().artifacts.map((x: Artifact) => x.id !== id ? x : {
            ...x, status: "generating" as const, progress: 5,
            errorMessage: undefined, statusMessage: msg, needsUserAction: undefined,
            ...(x.type === "reel" ? { reelStage: "rendering" as const, reelErrorMessage: undefined } : {}),
            ...(x.type === "podcast" ? { podcastStep: undefined } : {}),
          }),
          generatingModalOpen: true, generatingId: id,
        });
      },

      _openPreviewIfAllowed: (id) => {
        if (isModalBlocked(get(), id)) {
          set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "preview" }) });
        } else {
          set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, previewModalOpen: true, previewInitialView: "preview", previewVideoResume: null });
        }
      },

      _openEditIfAllowed: (id) => {
        if (isModalBlocked(get(), id)) {
          set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "edit" }) });
        } else {
          set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, editModalOpen: true, editModalTriggeredByPipeline: true });
        }
      },

      // ── startGeneration dispatcher ─────────────────────────────────────────
      startGeneration: (type: ArtifactType, runId?: string, videoConfig?: VideoConfig) => {
        if (type === "video" && runId) { get().startVideoGeneration(runId, videoConfig); return; }
        if (type === "business-brief") { get().startBusinessBriefGeneration(); return; }
        if (type === "presentation") { get().startPresentationGeneration(usePaperStore.getState().paperId ?? ""); return; }

        // Remaining types use mock progress for now
        const id = `${type}-${Date.now()}`;
        const artifact: Artifact = {
          id, type, status: "generating", progress: 0,
          config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language: videoConfig?.language ?? "english" },
          scripts: [], runId, imageAssignments: {},
          paperId: usePaperStore.getState().paperId ?? undefined,
        };
        set({ artifacts: [...get().artifacts, artifact], generatingModalOpen: true, generatingId: id });
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 15 + 5;
          if (progress >= 100) { clearInterval(interval); get().completeGeneration(id); }
          else { get().updateProgress(id, Math.min(progress, 95)); }
        }, 500);
      },

      // ── updateProgress / completeGeneration ───────────────────────────────

      updateProgress: (id, progress) => {
        set({ artifacts: patchArtifact(get().artifacts, id, { progress }) });
      },

      completeGeneration: (id) => {
        const artifact = get().artifacts.find((a: Artifact) => a.id === id);

        if (artifact?.type === "presentation") {
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "done", progress: 100 }) });
          setTimeout(() => { set({ generatingModalOpen: false, generatingId: null }); }, 800);
          return;
        }

        if (artifact?.type === "video" && artifact.runId) {
          const replacedId = artifact.replacesArtifactId;
          const dropReplaced = (arts: Artifact[]) => replacedId ? arts.filter((a: Artifact) => a.id !== replacedId) : arts;
          getScript(artifact.runId)
            .then((script) => {
              const sections: ScriptSection[] = script.sections.map((s) => ({
                id: s.id, label: s.id.charAt(0).toUpperCase() + s.id.slice(1),
                voiceoverScript: s.narration, bulletPoints: s.bullets,
              }));
              set({ artifacts: dropReplaced(get().artifacts).map((a: Artifact) => a.id === id ? { ...a, status: "done" as const, progress: 100, scripts: sections, rawScript: script, replacesArtifactId: undefined } : a) });
            })
            .catch(() => {
              set({ artifacts: dropReplaced(get().artifacts).map((a: Artifact) => a.id === id ? { ...a, status: "done" as const, progress: 100, replacesArtifactId: undefined } : a) });
            });
        } else {
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "done", progress: 100, scripts: MOCK_SCRIPTS }) });
        }

        setTimeout(() => { set({ generatingModalOpen: false, generatingId: null }); }, 800);
      },

      // ── retryArtifact dispatcher ──────────────────────────────────────────

      retryArtifact: (id) => {
        const a = get().artifacts.find((x: Artifact) => x.id === id);
        if (!a || a.status !== "error") return;
        switch (a.type) {
          case "video": get().retryVideoArtifact(id, a); break;
          case "podcast": get().retryPodcastArtifact(id, a); break;
          case "poster": get().retryPosterArtifact(id, a); break;
          case "reel": get().retryReelArtifact(id, a); break;
          case "x-linkedin": if (a.runId) get().startSocialGeneration(a.runId); break;
          case "business-brief": get().startBusinessBriefGeneration(); break;
          case "presentation": get().startPresentationGeneration(usePaperStore.getState().paperId ?? ""); break;
        }
      },

      // ── resumePipeline ────────────────────────────────────────────────────

      resumePipeline: (artifactId, opts = {}) => {
        const original = get().artifacts.find((a: Artifact) => a.id === artifactId);
        if (!original?.runId) return;
        if (original.type === "presentation") {
          console.warn("[artifact-store] presentation uses confirmPresentationDeck, not resumePipeline");
          return;
        }
        get().resumeVideoPipeline(artifactId, original, opts);
      },

      // ── UI state actions ──────────────────────────────────────────────────

      setSelectedArtifact: (id) => { set({ selectedArtifactId: id }); },

      openEditModal: (id) => {
        const artifact = get().artifacts.find((a: Artifact) => a.id === id);
        set({
          selectedArtifactId: id, editModalOpen: true,
          editModalTriggeredByPipeline: !!artifact?.needsUserAction,
          editModalOriginalConfig: artifact ? { ...artifact.config } : null,
          artifacts: patchArtifact(get().artifacts, id, { needsUserAction: undefined }),
        });
      },

      closeEditModal: () => {
        set({ editModalOpen: false, editModalTriggeredByPipeline: false, editModalOriginalConfig: null });
      },

      openPreviewModal: (id, opts) => {
        set({
          selectedArtifactId: id, previewModalOpen: true,
          previewSocialTab: opts?.socialTab ?? null,
          previewInitialView: opts?.initialView ?? "preview",
          previewVideoResume: opts?.videoResume ?? null,
          artifacts: patchArtifact(get().artifacts, id, { needsUserAction: undefined }),
        });
      },

      closePreviewModal: () => {
        set({ previewModalOpen: false, previewSocialTab: null, previewInitialView: "preview", previewVideoResume: null });
      },

      openGeneratingModal: (id) => { set({ generatingId: id, generatingModalOpen: true }); },

      closeGeneratingModal: () => {
        const { generatingId } = get();
        set({
          generatingModalOpen: false,
          dismissedArtifactIds: generatingId ? [...get().dismissedArtifactIds, generatingId] : get().dismissedArtifactIds,
        });
      },

      updateConfig: (id, config) => {
        set({ artifacts: get().artifacts.map((a: Artifact) => a.id === id ? { ...a, config: { ...a.config, ...config } } : a) });
      },

      updateScript: (artifactId, sectionId, field, value) => {
        set({
          artifacts: get().artifacts.map((a: Artifact) => a.id !== artifactId ? a : {
            ...a, scripts: a.scripts.map((s) => s.id === sectionId ? { ...s, [field]: value } : s),
          }),
        });
      },

      updateBriefSection: (artifactId, sectionKey, content) => {
        set({
          artifacts: get().artifacts.map((a: Artifact) => a.id !== artifactId ? a : {
            ...a, briefSections: { ...a.briefSections, [sectionKey]: content },
          }),
        });
      },

      setImageAssignment: (artifactId, sectionId, imageIndex) => {
        set({
          artifacts: get().artifacts.map((a: Artifact) => {
            if (a.id !== artifactId) return a;
            if (imageIndex < 0) {
              const assignments = { ...a.imageAssignments };
              delete assignments[sectionId];
              return { ...a, imageAssignments: assignments };
            }
            return { ...a, imageAssignments: { ...a.imageAssignments, [sectionId]: imageIndex } };
          }),
        });
      },

      // ── Config modal open/close pairs ─────────────────────────────────────

      openPodcastConfigModal: (paperId) => { set({ podcastConfigModalOpen: true, podcastConfigPaperId: paperId }); },
      closePodcastConfigModal: () => { set({ podcastConfigModalOpen: false, podcastConfigPaperId: null }); },

      openPresentationConfigModal: (paperId) => { set({ presentationConfigModalOpen: true, presentationConfigPaperId: paperId }); },
      closePresentationConfigModal: () => { set({ presentationConfigModalOpen: false, presentationConfigPaperId: null }); },

      openVideoConfigModal: (runId) => { set({ videoConfigModalOpen: true, videoConfigRunId: runId }); },
      closeVideoConfigModal: () => { set({ videoConfigModalOpen: false, videoConfigRunId: null }); },

      confirmVideoConfig: (config) => {
        const runId = get().videoConfigRunId;
        set({ videoConfigModalOpen: false, videoConfigRunId: null });
        if (!runId) { console.warn("[artifact-store] confirmVideoConfig: no runId in modal state"); return; }
        get().startGeneration("video", runId, config);
      },

      openReelConfigModal: (paperId) => { set({ reelConfigModalOpen: true, reelConfigPaperId: paperId }); },
      closeReelConfigModal: () => { set({ reelConfigModalOpen: false, reelConfigPaperId: null, selectedArtifactId: null }); },

      reset: () => { set({ ...INITIAL_STATE }); },
    }),
    {
      name: "saral-artifact-store",
      partialize: (state) => ({
        // Only persist completed/error artifacts — in-progress ones lose their SSE on refresh.
        // Strip pdfBlobUrl: blob: URLs are session-scoped and become dangling refs after reload.
        artifacts: state.artifacts
          .filter((a) => a.status === "done" || a.status === "error")
          .map((a) => { const copy = { ...a }; delete copy.pdfBlobUrl; return copy; }),
      }),
    },
  ),
);

import type { ActiveModal } from "./artifact-store-types";

/** Derives the active modal from flat store state. Use via useActiveModal() hook. */
export function selectActiveModal(s: ArtifactStore): ActiveModal {
  if (s.editModalOpen && s.selectedArtifactId)
    return { type: "edit", artifactId: s.selectedArtifactId, triggeredByPipeline: s.editModalTriggeredByPipeline, originalConfig: s.editModalOriginalConfig };
  if (s.previewModalOpen && s.selectedArtifactId)
    return { type: "preview", artifactId: s.selectedArtifactId, socialTab: s.previewSocialTab, initialView: s.previewInitialView, videoResume: s.previewVideoResume };
  if (s.generatingModalOpen && s.generatingId)
    return { type: "generating", artifactId: s.generatingId };
  if (s.videoConfigModalOpen && s.videoConfigRunId)
    return { type: "config-video", runId: s.videoConfigRunId };
  if (s.podcastConfigModalOpen && s.podcastConfigPaperId)
    return { type: "config-podcast", paperId: s.podcastConfigPaperId };
  if (s.reelConfigModalOpen && s.reelConfigPaperId)
    return { type: "config-reel", paperId: s.reelConfigPaperId };
  if (s.presentationConfigModalOpen && s.presentationConfigPaperId)
    return { type: "config-presentation", paperId: s.presentationConfigPaperId };
  if (s.reelScriptModalOpen && s.selectedArtifactId)
    return { type: "reel-script", artifactId: s.selectedArtifactId };
  if (s.reelAvatarModalOpen && s.selectedArtifactId)
    return { type: "reel-avatar", artifactId: s.selectedArtifactId };
  return { type: "none" };
}
