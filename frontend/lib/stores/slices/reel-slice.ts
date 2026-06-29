import type { StateCreator } from "zustand";
import {
  startReel,
  connectReelSSE,
  getReelScript,
  updateReelScript,
  selectReelAvatars,
  finalizeReel,
  retryReelRun,
} from "../../api";
import { getSSEStatusMessage, getSSEErrorMessage, getPipelineStartMessage } from "../../sse-messages";
import { connectWithRetry, isModalBlocked, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { ReelScript, ReelTurn } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";

const DEFAULT_REEL_LANGUAGE = "english";

export type ReelSlice = {
  startReelGeneration: (paperId: string, language?: string, replacesArtifactId?: string) => void;
  saveReelScript: (artifactId: string, turns: ReelTurn[]) => Promise<void>;
  proceedToReelAvatars: (artifactId: string) => void;
  selectReelAvatarAndFinalize: (artifactId: string, pair: string, person1Url: string, person2Url: string) => Promise<void>;
  closeReelScriptModal: () => void;
  closeReelAvatarModal: () => void;
  reopenReelStageModal: (artifactId: string) => void;
  retryReelArtifact: (id: string, a: Artifact) => void;
};

export const createReelSlice: StateCreator<ArtifactStore, [], [], ReelSlice> = (set, get) => ({
  startReelGeneration: (paperId, language, replacesArtifactId) => {
    if (!paperId) { console.error("[reel-slice] no paperId"); return; }

    const sourceArtifact = replacesArtifactId
      ? get().artifacts.find((a: Artifact) => a.id === replacesArtifactId && a.status === "done")
      : undefined;
    const resolvedReplacesId = sourceArtifact?.id;
    const lang = language ?? DEFAULT_REEL_LANGUAGE;
    const id = `reel-${Date.now()}`;

    const artifact: Artifact = {
      id, type: "reel", status: "generating", progress: 5,
      config: { audioLanguage: lang, textLanguage: lang, voiceGender: "female", language: lang },
      scripts: [], imageAssignments: {},
      statusMessage: getPipelineStartMessage("reel"),
      reelStage: "starting", reelLanguage: lang, paperId,
      ...(resolvedReplacesId ? { replacesArtifactId: resolvedReplacesId } : {}),
    };

    set({ artifacts: [...get().artifacts, artifact], generatingModalOpen: true, generatingId: id, reelConfigModalOpen: false, reelConfigPaperId: null });

    startReel({ paper_id: paperId, language: lang })
      .then(({ run_id }) => {
        set({ artifacts: patchArtifact(get().artifacts, id, { runId: run_id }) });

        const handle = connectWithRetry(connectReelSSE, run_id, (event) => {
          if (event.status === "failed") {
            handle.close();
            const errMsg = event.message ?? event.step ?? "Pipeline step failed";
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", reelStage: "failed", reelErrorMessage: errMsg, errorMessage: errMsg, statusMessage: errMsg }), generatingModalOpen: false, generatingId: null });
            return;
          }

          let progress: number | undefined;
          let stage: Artifact["reelStage"] | undefined;
          if (event.step === "reel_script_gen") { progress = event.status === "completed" ? 25 : 12; }
          else if (event.step === "reel_audio_gen") { progress = event.status === "completed" ? 65 : 45; }
          else if (event.step === "reel_video_gen") { progress = event.status === "completed" ? 95 : 80; }
          else if (event.step === "pipeline" && event.status === "completed") { progress = 100; stage = "done"; }

          set({
            artifacts: patchArtifact(get().artifacts, id, {
              ...(progress !== undefined ? { progress } : {}),
              ...(stage ? { reelStage: stage } : {}),
              statusMessage: getSSEStatusMessage("reel", event.step, event.status, event.message),
            }),
          });

          if (event.step === "reel_script_gen" && event.status === "completed") {
            getReelScript(run_id)
              .then((script) => {
                const blocked = isModalBlocked(get(), id);
                set({
                  artifacts: patchArtifact(get().artifacts, id, {
                    reelScript: script, reelStage: "script_review",
                    statusMessage: getSSEStatusMessage("reel", "reel_script_gen", "completed"),
                    ...(blocked ? { needsUserAction: "edit" as const } : {}),
                  }),
                  generatingModalOpen: false, generatingId: null,
                  ...(blocked ? {} : { selectedArtifactId: id, reelScriptModalOpen: true }),
                });
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", reelStage: "failed", reelErrorMessage: msg, errorMessage: msg }), generatingModalOpen: false, generatingId: null });
              });
          }

          if (event.step === "pipeline" && event.status === "completed") {
            handle.close();
            const replacedId = get().artifacts.find((a: Artifact) => a.id === id)?.replacesArtifactId;
            const updated = get().artifacts
              .filter((a: Artifact) => (replacedId ? a.id !== replacedId : true))
              .map((a: Artifact) => a.id !== id ? a : { ...a, status: "done" as const, progress: 100, reelStage: "done" as const, statusMessage: getSSEStatusMessage("reel", "pipeline", "completed"), replacesArtifactId: undefined });
            set({ artifacts: updated });
            setTimeout(() => {
              if (isModalBlocked(get(), id)) {
                set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "preview" }) });
              } else {
                set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, previewModalOpen: true, previewInitialView: "preview", previewVideoResume: null });
              }
            }, 800);
          }
        }, () => {
          const errMsg = "sse_connection_lost";
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", reelStage: "failed", reelErrorMessage: errMsg, errorMessage: errMsg, statusMessage: errMsg }), generatingModalOpen: false, generatingId: null });
        });

        set({ artifacts: patchArtifact(get().artifacts, id, { reelStreamHandle: handle }) });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[reel-slice] startReel failed:", msg);
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", reelStage: "failed", reelErrorMessage: msg, errorMessage: msg, statusMessage: msg }), generatingModalOpen: false, generatingId: null });
      });
  },

  saveReelScript: async (artifactId, turns) => {
    const a = get().artifacts.find((x: Artifact) => x.id === artifactId);
    if (!a?.runId || !a.reelScript) return;
    const body: ReelScript = { ...a.reelScript, run_id: a.runId, turns };
    const updated = await updateReelScript(a.runId, body);
    set({ artifacts: patchArtifact(get().artifacts, artifactId, { reelScript: updated }) });
  },

  proceedToReelAvatars: (artifactId) => {
    set({
      artifacts: patchArtifact(get().artifacts, artifactId, { reelStage: "avatar_pick", needsUserAction: undefined }),
      reelScriptModalOpen: false, reelAvatarModalOpen: true, selectedArtifactId: artifactId,
    });
  },

  selectReelAvatarAndFinalize: async (artifactId, pair, person1Url, person2Url) => {
    const a = get().artifacts.find((x: Artifact) => x.id === artifactId);
    if (!a?.runId) return;
    const runId = a.runId;

    await selectReelAvatars(runId, pair);

    set({
      artifacts: patchArtifact(get().artifacts, artifactId, {
        reelSelectedPair: pair, reelAvatarPreview: { person1Url, person2Url },
        reelStage: "rendering", progress: 35,
        statusMessage: getSSEStatusMessage("reel", "reel_audio_gen", "processing"),
      }),
      reelAvatarModalOpen: false, generatingModalOpen: true, generatingId: artifactId,
    });

    try {
      await finalizeReel(runId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reel-slice] finalizeReel failed:", msg);
      set({ artifacts: patchArtifact(get().artifacts, artifactId, { status: "error", reelStage: "failed", reelErrorMessage: msg }), generatingModalOpen: false, generatingId: null });
    }
  },

  closeReelScriptModal: () => { set({ reelScriptModalOpen: false }); },

  closeReelAvatarModal: () => { set({ reelAvatarModalOpen: false }); },

  reopenReelStageModal: (artifactId) => {
    const a = get().artifacts.find((x: Artifact) => x.id === artifactId);
    if (!a) return;
    set({ selectedArtifactId: artifactId, artifacts: patchArtifact(get().artifacts, artifactId, { needsUserAction: undefined }) });
    if (a.reelStage === "script_review") { set({ reelScriptModalOpen: true }); }
    else if (a.reelStage === "avatar_pick") { set({ reelAvatarModalOpen: true }); }
    else if (a.reelStage === "rendering") { set({ generatingModalOpen: true, generatingId: artifactId }); }
  },

  retryReelArtifact: (id, a) => {
    if (!a.runId) { get()._failRetry(id, "Missing run id for retry"); return; }
    const runId = a.runId;
    get()._updateRetryState(id, "Retrying reel pipeline...");

    const es = connectWithRetry(connectReelSSE, runId, (event) => {
      if (event.status === "failed") { es.close(); get()._failRetry(id, event.message ?? getSSEErrorMessage()); return; }

      let progress: number | undefined;
      let stage: Artifact["reelStage"] | undefined;
      if (event.step === "reel_script_gen") { progress = event.status === "completed" ? 25 : 12; }
      else if (event.step === "reel_audio_gen") { progress = event.status === "completed" ? 65 : 45; }
      else if (event.step === "reel_video_gen") { progress = event.status === "completed" ? 95 : 80; }
      else if (event.step === "pipeline" && event.status === "completed") { progress = 100; stage = "done"; }

      set({
        artifacts: patchArtifact(get().artifacts, id, {
          ...(progress !== undefined ? { progress } : {}),
          ...(stage ? { reelStage: stage } : {}),
          statusMessage: getSSEStatusMessage("reel", event.step, event.status, event.message),
        }),
      });

      if (event.step === "reel_script_gen" && event.status === "completed") {
        es.close();
        getReelScript(runId)
          .then((script) => {
            set({ artifacts: patchArtifact(get().artifacts, id, { reelScript: script, reelStage: "script_review", statusMessage: getSSEStatusMessage("reel", "reel_script_gen", "completed") }) });
            get()._openEditIfAllowed(id);
          })
          .catch(() => { get()._failRetry(id, getSSEErrorMessage()); });
        return;
      }

      if (event.step === "pipeline" && event.status === "completed") {
        es.close();
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "done", progress: 100, reelStage: "done", statusMessage: getSSEStatusMessage("reel", "pipeline", "completed") }) });
        setTimeout(() => get()._openPreviewIfAllowed(id), 800);
      }
    }, () => { get()._failRetry(id, getSSEErrorMessage()); });

    retryReelRun(runId)
      .then(({ message }) => { set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: message }) }); })
      .catch((err) => { es.close(); get()._failRetry(id, err instanceof Error ? err.message : getSSEErrorMessage()); });
  },
});
