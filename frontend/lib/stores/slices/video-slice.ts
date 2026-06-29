import type { StateCreator } from "zustand";
import { toast } from "sonner";
import {
  getScript,
  confirmScript,
  connectSSE,
  getVideoUrl,
  getAudioSlide,
  triggerVideoGeneration,
  retryVideoRun,
  updateScript as uploadScriptApi,
} from "../../api";
import { usePaperStore } from "../../paper-store";
import { getSSEStatusMessage, getSSEErrorMessage, getPipelineStartMessage } from "../../sse-messages";
import { connectWithRetry, stepToProgress, scriptSectionsFromRaw, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { VideoConfig } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";

export type VideoSlice = {
  startVideoGeneration: (runId: string, videoConfig?: VideoConfig) => void;
  resumeVideoPipeline: (
    artifactId: string,
    originalArtifact: Artifact,
    opts?: { language?: string; voiceGender?: string; slideLanguage?: string; editedScript?: import("../../types").Script },
  ) => void;
  retryVideoArtifact: (id: string, a: Artifact) => void;
};

export const createVideoSlice: StateCreator<ArtifactStore, [], [], VideoSlice> = (set, get) => ({
  startVideoGeneration: (runId, videoConfig) => {
    const id = `video-${Date.now()}`;
    const artifact: Artifact = {
      id,
      type: "video",
      status: "waiting-script",
      progress: 0,
      config: {
        audioLanguage: "English",
        textLanguage: "English",
        voiceGender: "female",
        language: videoConfig?.language ?? "english",
        ...(videoConfig?.slideLanguage ? { slideLanguage: videoConfig.slideLanguage } : {}),
        ...(videoConfig?.pptTemplate ? { pptTemplate: videoConfig.pptTemplate } : {}),
      },
      scripts: [],
      runId,
      imageAssignments: {},
      paperId: usePaperStore.getState().paperId ?? undefined,
      videoPaperRunId: runId,
      statusMessage: getPipelineStartMessage("video"),
    };

    set({ artifacts: [...get().artifacts, artifact], selectedArtifactId: id, generatingModalOpen: true, generatingId: id });

    let confirmedAlready = false;
    const autoConfirmAfterScript = (targetRunId: string) => {
      if (confirmedAlready) return;
      confirmedAlready = true;

      getScript(targetRunId)
        .then((script) => {
          set({ artifacts: patchArtifact(get().artifacts, id, { scripts: scriptSectionsFromRaw(script.sections), rawScript: script }) });
        })
        .catch(() => { /* non-fatal */ });

      const a = get().artifacts.find((x) => x.id === id);
      confirmScript(targetRunId, {
        voice_gender: a?.config.voiceGender,
        language: a?.config.language,
        ...(a?.config.slideLanguage ? { slide_language: a.config.slideLanguage } : {}),
        ...(a?.config.pptTemplate ? { ppt_template: a.config.pptTemplate } : {}),
      }).catch((err) => {
        console.error("[video-slice] auto-confirmScript failed:", err);
        set({
          artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: err instanceof Error ? err.message : "confirm_failed" }),
          generatingModalOpen: false,
          generatingId: null,
        });
      });
    };

    triggerVideoGeneration(runId, videoConfig)
      .then((res) => {
        const newRunId = res.run_id;
        console.log("[video-slice] generate-video triggered: source_run=", runId, "new_run=", newRunId);

        set({ artifacts: patchArtifact(get().artifacts, id, { runId: newRunId }) });
        if (res.completed) autoConfirmAfterScript(newRunId);

        const es = connectWithRetry(
          connectSSE,
          newRunId,
          (event) => {
            set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: getSSEStatusMessage("video", event.step, event.status, event.message) }) });

            const progress = stepToProgress(event.step, event.status);
            if (progress > 0) get().updateProgress(id, Math.min(progress, 95));

            if (event.step === "script_gen" && event.status === "completed") autoConfirmAfterScript(newRunId);

            if (event.step === "pipeline" && event.status === "completed") {
              es.close();
              Promise.allSettled([getVideoUrl(newRunId), getAudioSlide(newRunId)]).then(([dlResult, audioResult]) => {
                set({
                  artifacts: patchArtifact(get().artifacts, id, {
                    downloadUrl: dlResult.status === "fulfilled" ? dlResult.value : undefined,
                    audioSlides: audioResult.status === "fulfilled" ? audioResult.value.slides : undefined,
                  }),
                });
                get().completeGeneration(id);
                toast.success("Your video is ready", { description: "Click the card to preview or download." });
              });
            }

            if (event.status === "failed") {
              es.close();
              const msg = event.message ?? "Pipeline step failed";
              set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg }), generatingModalOpen: false, generatingId: null });
              toast.error("Video generation failed", { description: msg });
            }
          },
          () => {
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: "sse_connection_lost" }), generatingModalOpen: false, generatingId: null });
          },
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to trigger video generation";
        console.error("[video-slice] triggerVideoGeneration failed:", msg);
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg }), generatingModalOpen: false, generatingId: null });
      });
  },

  resumeVideoPipeline: (artifactId, originalArtifact, opts = {}) => {
    const originalRunId = originalArtifact.runId!;
    const resolvedLanguage = opts.language ?? originalArtifact.config.language;
    const newId = `video-${Date.now()}`;

    const newArtifact: Artifact = {
      ...originalArtifact,
      id: newId,
      status: "generating",
      progress: 0,
      runId: undefined,
      downloadUrl: undefined,
      audioSlides: undefined,
      statusMessage: undefined,
      errorMessage: undefined,
      needsUserAction: undefined,
      replacesArtifactId: undefined,
      config: {
        ...originalArtifact.config,
        language: resolvedLanguage,
        audioLanguage: resolvedLanguage,
        textLanguage: resolvedLanguage,
        ...(opts.voiceGender ? { voiceGender: opts.voiceGender as "male" | "female" } : {}),
      },
    };

    const shouldDropSource = originalArtifact.status === "pending";
    const restoredConfig = get().editModalOriginalConfig;
    const baseArtifacts = shouldDropSource
      ? get().artifacts.filter((a) => a.id !== artifactId)
      : patchArtifact(get().artifacts, artifactId, restoredConfig ? { config: restoredConfig } : {});

    set({ artifacts: [...baseArtifacts, newArtifact], generatingModalOpen: true, generatingId: newId });

    const id = newId;

    const startVideoSSEAndConfirm = (targetRunId: string, scriptGenAlreadyDone: boolean) => {
      set({ artifacts: patchArtifact(get().artifacts, id, { runId: targetRunId }) });

      let pipelineCompleted = false;
      let confirmedAlready = false;

      const uploadAndConfirm = () => {
        if (confirmedAlready) return;
        confirmedAlready = true;

        const doConfirm = () => {
          confirmScript(targetRunId, {
            voice_gender: opts.voiceGender ?? originalArtifact.config.voiceGender,
            language: resolvedLanguage,
            ...(opts.slideLanguage ? { slide_language: opts.slideLanguage } : {}),
          }).catch((err) => {
            console.error("[video-slice] confirmScript failed:", err);
            es.close();
            set({
              artifacts: patchArtifact(get().artifacts, id, { status: "pending", needsUserAction: "edit", errorMessage: "confirm_failed" }),
              generatingModalOpen: false,
              generatingId: null,
              editModalOpen: true,
              editModalTriggeredByPipeline: false,
              selectedArtifactId: id,
            });
          });
        };

        if (opts.editedScript) {
          uploadScriptApi(targetRunId, { ...opts.editedScript, run_id: targetRunId, language: resolvedLanguage, voice_gender: opts.voiceGender ?? originalArtifact.config.voiceGender })
            .catch((e) => console.error("[video-slice] uploadScriptApi failed:", e))
            .finally(doConfirm);
        } else {
          doConfirm();
        }
      };

      const es = connectWithRetry(
        connectSSE,
        targetRunId,
        (event) => {
          set({
            artifacts: patchArtifact(get().artifacts, id, {
              progress: Math.min(stepToProgress(event.step, event.status), 95),
              statusMessage: getSSEStatusMessage("video", event.step, event.status, event.message),
            }),
          });

          if (event.step === "script_gen" && event.status === "completed" && !confirmedAlready) uploadAndConfirm();

          if (event.step === "pipeline" && event.status === "completed") {
            if (pipelineCompleted) return;
            pipelineCompleted = true;
            es.close();
            Promise.allSettled([getVideoUrl(targetRunId), getAudioSlide(targetRunId)]).then(([dlResult, audioResult]) => {
              set({
                artifacts: patchArtifact(get().artifacts, id, {
                  downloadUrl: dlResult.status === "fulfilled" ? dlResult.value : undefined,
                  audioSlides: audioResult.status === "fulfilled" ? audioResult.value.slides : undefined,
                }),
              });
              get().completeGeneration(id);
            });
          }

          if (event.status === "failed") {
            es.close();
            set({
              artifacts: patchArtifact(get().artifacts, id, { status: "pending", needsUserAction: "edit", errorMessage: event.message ?? event.step ?? "Pipeline step failed" }),
              generatingModalOpen: false,
              generatingId: null,
              editModalOpen: true,
              editModalTriggeredByPipeline: false,
              selectedArtifactId: id,
            });
          }
        },
        () => {
          set({
            artifacts: patchArtifact(get().artifacts, id, { status: "pending", needsUserAction: "edit", errorMessage: "sse_connection_lost" }),
            generatingModalOpen: false,
            generatingId: null,
            editModalOpen: true,
            editModalTriggeredByPipeline: false,
            selectedArtifactId: id,
          });
        },
      );

      if (scriptGenAlreadyDone) uploadAndConfirm();
    };

    const paperRunId = originalArtifact.videoPaperRunId ?? usePaperStore.getState().runId ?? null;
    if (paperRunId) {
      triggerVideoGeneration(paperRunId)
        .then((res) => {
          const newVideoRunId = res.run_id;
          const isSameRun = newVideoRunId === originalRunId;
          if (isSameRun) set({ artifacts: get().artifacts.filter((a) => a.id !== artifactId) });
          startVideoSSEAndConfirm(newVideoRunId, !!res.completed || isSameRun);
        })
        .catch((err) => {
          console.error("[video-slice] triggerVideoGeneration fallback:", err);
          set({ artifacts: get().artifacts.filter((a) => a.id !== artifactId) });
          startVideoSSEAndConfirm(originalRunId, true);
        });
    } else {
      startVideoSSEAndConfirm(originalRunId, true);
    }
  },

  retryVideoArtifact: (id, a) => {
    if (!a.runId) { get()._failRetry(id, "Missing run id for retry"); return; }

    const runId = a.runId;
    const waitingForScript = a.scripts.length === 0;
    get()._updateRetryState(id, "Retrying video pipeline...");

    let pipelineCompleted = false;
    const es = connectWithRetry(
      connectSSE,
      runId,
      (event) => {
        set({
          artifacts: patchArtifact(get().artifacts, id, {
            progress: Math.min(stepToProgress(event.step, event.status), 95),
            statusMessage: getSSEStatusMessage("video", event.step, event.status, event.message),
          }),
        });

        if (waitingForScript && event.step === "script_gen" && event.status === "completed") {
          es.close();
          getScript(runId)
            .then((script) => {
              set({ artifacts: patchArtifact(get().artifacts, id, { status: "pending", statusMessage: undefined, scripts: scriptSectionsFromRaw(script.sections), rawScript: script, progress: 0 }) });
              get()._openEditIfAllowed(id);
            })
            .catch((err) => { get()._failRetry(id, err instanceof Error ? err.message : getSSEErrorMessage()); });
          return;
        }

        if (event.step === "pipeline" && event.status === "completed") {
          if (pipelineCompleted) return;
          pipelineCompleted = true;
          es.close();
          Promise.allSettled([getVideoUrl(runId), getAudioSlide(runId)])
            .then(([dlResult, audioResult]) => {
              set({
                artifacts: patchArtifact(get().artifacts, id, {
                  downloadUrl: dlResult.status === "fulfilled" ? dlResult.value : undefined,
                  audioSlides: audioResult.status === "fulfilled" ? audioResult.value.slides : undefined,
                }),
              });
              get().completeGeneration(id);
            })
            .catch(() => { get()._failRetry(id, getSSEErrorMessage()); });
        }

        if (event.status === "failed") { es.close(); get()._failRetry(id, getSSEErrorMessage()); }
      },
      () => { get()._failRetry(id, getSSEErrorMessage()); },
    );

    retryVideoRun(runId)
      .then(({ message }) => { set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: message }) }); })
      .catch((err) => { es.close(); get()._failRetry(id, err instanceof Error ? err.message : getSSEErrorMessage()); });
  },
});
