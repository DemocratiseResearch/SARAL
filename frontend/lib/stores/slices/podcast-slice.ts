import type { StateCreator } from "zustand";
import {
  startPodcast,
  connectPodcastSSE,
  getPodcastScript,
  getPodcastAudio,
  getPodcastVideoUrl,
  retryPodcastRun,
} from "../../api";
import { getSSEStatusMessage, getSSEErrorMessage, getPipelineStartMessage } from "../../sse-messages";
import { connectWithRetry, isModalBlocked, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { PodcastAudioResponse, PodcastScript } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";

export type PodcastSlice = {
  startPodcastGeneration: (
    paperId: string,
    opts?: {
      language?: string;
      hostAGender?: "female" | "male";
      hostBGender?: "female" | "male";
      renderVideo?: boolean;
      replacesArtifactId?: string;
    },
  ) => void;
  retryPodcastArtifact: (id: string, a: Artifact) => void;
};

export const createPodcastSlice: StateCreator<ArtifactStore, [], [], PodcastSlice> = (set, get) => ({
  startPodcastGeneration: (paperId, opts = {}) => {
    if (!paperId) { console.error("[podcast-slice] no paperId"); return; }

    const id = `podcast-${Date.now()}`;
    const language = opts.language ?? "english";
    const hostAGender = opts.hostAGender ?? "female";
    const hostBGender = opts.hostBGender ?? "male";
    const renderVideo = opts.renderVideo ?? true;
    const sourceArtifact = opts.replacesArtifactId
      ? get().artifacts.find((a: Artifact) => a.id === opts.replacesArtifactId && a.status === "done")
      : undefined;

    const artifact: Artifact = {
      id, type: "podcast", status: "generating", progress: 5,
      config: { audioLanguage: language, textLanguage: language, voiceGender: hostAGender, language },
      scripts: [], imageAssignments: {},
      statusMessage: getPipelineStartMessage("podcast"),
      podcastRenderVideo: renderVideo, paperId,
      replacesArtifactId: sourceArtifact?.id,
    };

    set({ artifacts: [...get().artifacts, artifact], generatingModalOpen: true, generatingId: id, podcastConfigModalOpen: false, podcastConfigPaperId: null });

    startPodcast({ paper_id: paperId, language, host_a_gender: hostAGender, host_b_gender: hostBGender, render_video: renderVideo })
      .then(({ run_id }) => {
        set({ artifacts: patchArtifact(get().artifacts, id, { runId: run_id }) });

        let podcastCompleted = false;
        connectWithRetry(connectPodcastSSE, run_id, (event) => {
          let progress = 5;
          let nextStep: Artifact["podcastStep"];
          if (event.step === "podcast_script_gen") { nextStep = "script_gen"; progress = event.status === "completed" ? 45 : 20; }
          else if (event.step === "podcast_tts") { nextStep = "tts"; progress = event.status === "completed" ? 75 : 55; }
          else if (event.step === "ffmpeg_stitch") { nextStep = "ffmpeg_stitch"; progress = event.status === "completed" ? 100 : 85; }
          else if (event.step === "complete" || (event.step === "pipeline" && event.status === "completed")) { nextStep = "complete"; progress = 100; }

          set({ artifacts: patchArtifact(get().artifacts, id, { progress, statusMessage: getSSEStatusMessage("podcast", event.step, event.status, event.message), podcastStep: nextStep }) });

          if (event.step === "complete" || (event.step === "pipeline" && event.status === "completed")) {
            if (podcastCompleted) return;
            podcastCompleted = true;
            const fetchVideo = get().artifacts.find((a: Artifact) => a.id === id)?.podcastRenderVideo !== false;

            Promise.allSettled<[Promise<PodcastScript>, Promise<PodcastAudioResponse>, Promise<string | null>]>([
              getPodcastScript(run_id) as Promise<PodcastScript>,
              getPodcastAudio(run_id) as Promise<PodcastAudioResponse>,
              (fetchVideo ? getPodcastVideoUrl(run_id) : Promise.resolve(null)) as Promise<string | null>,
            ]).then(([scriptResult, audioResult, videoResult]) => {
              const replacedId = get().artifacts.find((a: Artifact) => a.id === id)?.replacesArtifactId;
              const updated = get().artifacts
                .filter((a: Artifact) => (replacedId ? a.id !== replacedId : true))
                .map((a: Artifact) => a.id !== id ? a : {
                  ...a, status: "done" as const, progress: 100,
                  downloadUrl: audioResult.status === "fulfilled" ? audioResult.value.url : a.downloadUrl,
                  podcastScript: scriptResult.status === "fulfilled" ? scriptResult.value : a.podcastScript,
                  podcastVideoUrl: videoResult.status === "fulfilled" ? videoResult.value ?? a.podcastVideoUrl : a.podcastVideoUrl,
                  statusMessage: getSSEStatusMessage("podcast", "pipeline", "completed"),
                  replacesArtifactId: undefined,
                });
              set({ artifacts: updated });
              setTimeout(() => {
                if (isModalBlocked(get(), id)) {
                  set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "preview" }) });
                } else {
                  set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, previewModalOpen: true, previewInitialView: "preview", previewVideoResume: null });
                }
              }, 800);
            }).catch((err) => {
              console.error("[podcast-slice] completion fetch failed:", err);
              set({ artifacts: patchArtifact(get().artifacts, id, { status: "error" }), generatingModalOpen: false, generatingId: null });
            });
          }

          if (event.status === "failed") {
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", podcastStep: "error" }), generatingModalOpen: false, generatingId: null });
          }
        }, () => {
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", podcastStep: "error" }), generatingModalOpen: false, generatingId: null });
        });
      })
      .catch((err) => {
        console.error("[podcast-slice] startPodcast failed:", err);
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", statusMessage: getSSEErrorMessage() }), generatingModalOpen: false, generatingId: null });
      });
  },

  retryPodcastArtifact: (id, a) => {
    if (!a.runId) { get()._failRetry(id, "Missing run id for retry"); return; }
    const runId = a.runId;
    get()._updateRetryState(id, "Retrying podcast pipeline...");
    let podcastCompleted = false;

    const es = connectWithRetry(connectPodcastSSE, runId, (event) => {
      let progress = 5;
      let nextStep: Artifact["podcastStep"];
      if (event.step === "podcast_script_gen") { nextStep = "script_gen"; progress = event.status === "completed" ? 45 : 20; }
      else if (event.step === "podcast_tts") { nextStep = "tts"; progress = event.status === "completed" ? 75 : 55; }
      else if (event.step === "ffmpeg_stitch") { nextStep = "ffmpeg_stitch"; progress = event.status === "completed" ? 100 : 85; }
      else if (event.step === "complete" || (event.step === "pipeline" && event.status === "completed")) { nextStep = "complete"; progress = 100; }

      set({ artifacts: patchArtifact(get().artifacts, id, { progress, statusMessage: getSSEStatusMessage("podcast", event.step, event.status, event.message), podcastStep: nextStep }) });

      if (event.step === "complete" || (event.step === "pipeline" && event.status === "completed")) {
        if (podcastCompleted) return;
        podcastCompleted = true;
        es.close();
        const fetchVideo = get().artifacts.find((x: Artifact) => x.id === id)?.podcastRenderVideo !== false;
        Promise.allSettled<[Promise<PodcastScript>, Promise<PodcastAudioResponse>, Promise<string | null>]>([
          getPodcastScript(runId) as Promise<PodcastScript>,
          getPodcastAudio(runId) as Promise<PodcastAudioResponse>,
          (fetchVideo ? getPodcastVideoUrl(runId) : Promise.resolve(null)) as Promise<string | null>,
        ]).then(([scriptResult, audioResult, videoResult]) => {
          set({
            artifacts: get().artifacts.map((x: Artifact) => x.id !== id ? x : {
              ...x, status: "done" as const, progress: 100,
              downloadUrl: audioResult.status === "fulfilled" ? audioResult.value.url : x.downloadUrl,
              podcastScript: scriptResult.status === "fulfilled" ? scriptResult.value : x.podcastScript,
              podcastVideoUrl: videoResult.status === "fulfilled" ? videoResult.value ?? x.podcastVideoUrl : x.podcastVideoUrl,
              statusMessage: getSSEStatusMessage("podcast", "pipeline", "completed"),
            }),
          });
          setTimeout(() => get()._openPreviewIfAllowed(id), 800);
        }).catch(() => { get()._failRetry(id, getSSEErrorMessage()); });
      }

      if (event.status === "failed") { es.close(); get()._failRetry(id, getSSEErrorMessage()); }
    }, () => { get()._failRetry(id, getSSEErrorMessage()); });

    retryPodcastRun(runId)
      .then(({ message }) => { set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: message }) }); })
      .catch((err) => { es.close(); get()._failRetry(id, err instanceof Error ? err.message : getSSEErrorMessage()); });
  },
});
