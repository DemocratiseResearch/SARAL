import type { StateCreator } from "zustand";
import { startPoster, confirmPoster, connectPosterSSE, getPosterDownload, retryPosterRun } from "../../api";
import { getSSEStatusMessage, getSSEErrorMessage, getPipelineStartMessage } from "../../sse-messages";
import { connectWithRetry, isModalBlocked, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { ArtifactStore } from "../artifact-store-types";

export type PosterSlice = {
  startPosterGeneration: (paperId: string) => void;
  retryPosterArtifact: (id: string, a: Artifact) => void;
};

export const createPosterSlice: StateCreator<ArtifactStore, [], [], PosterSlice> = (set, get) => ({
  startPosterGeneration: (paperId) => {
    if (!paperId) { console.error("[poster-slice] no paperId"); return; }

    const id = `poster-${Date.now()}`;
    const artifact: Artifact = {
      id, type: "poster", status: "generating", progress: 5,
      config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language: "english" },
      scripts: [], imageAssignments: {},
      statusMessage: getPipelineStartMessage("poster"), paperId,
    };

    set({ artifacts: [...get().artifacts, artifact], generatingModalOpen: true, generatingId: id });

    startPoster(paperId)
      .then(({ run_id }) => {
        set({ artifacts: patchArtifact(get().artifacts, id, { runId: run_id }) });

        let scriptGenConfirmed = false;
        let posterCompleted = false;

        const es = connectWithRetry(connectPosterSSE, run_id, (event) => {
          let progress = 5;
          if (event.step === "script_gen") { progress = event.status === "completed" ? 40 : 20; }
          else if (event.step === "poster_image_extract") { progress = event.status === "completed" ? 65 : 50; }
          else if (event.step === "poster_compile") { progress = event.status === "completed" ? 90 : 70; }
          else if (event.step === "pipeline" && event.status === "completed") { progress = 100; }

          set({ artifacts: patchArtifact(get().artifacts, id, { progress, statusMessage: getSSEStatusMessage("poster", event.step, event.status, event.message) }) });

          if (event.step === "script_gen" && event.status === "completed" && !scriptGenConfirmed) {
            scriptGenConfirmed = true;
            const retryConfirm = (attemptsLeft: number, delayMs: number) => {
              confirmPoster(run_id)
                .catch((err) => {
                  const msg = err instanceof Error ? err.message : String(err);
                  if ((msg.includes("not ready") || msg.includes("content_not_ready")) && attemptsLeft > 0) {
                    setTimeout(() => retryConfirm(attemptsLeft - 1, delayMs * 2), delayMs);
                  } else {
                    console.error("[poster-slice] confirmPoster failed:", err);
                    es.close();
                    set({ artifacts: patchArtifact(get().artifacts, id, { status: "error" }), generatingModalOpen: false, generatingId: null });
                  }
                });
            };
            setTimeout(() => retryConfirm(4, 600), 600);
          }

          if (event.step === "pipeline" && event.status === "completed") {
            if (posterCompleted) return;
            posterCompleted = true;
            es.close();
            getPosterDownload(run_id)
              .then(({ download_url }) => {
                set({
                  artifacts: patchArtifact(get().artifacts, id, {
                    status: "done", progress: 100, downloadUrl: download_url,
                    statusMessage: getSSEStatusMessage("poster", "pipeline", "completed"),
                  }),
                });
                setTimeout(() => {
                  if (isModalBlocked(get(), id)) {
                    set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "preview" }) });
                  } else {
                    set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, previewModalOpen: true, previewInitialView: "preview", previewVideoResume: null });
                  }
                }, 800);
              })
              .catch((err) => {
                console.error("[poster-slice] getPosterDownload failed:", err);
                set({ artifacts: patchArtifact(get().artifacts, id, { status: "error" }), generatingModalOpen: false, generatingId: null });
              });
          }

          if (event.status === "failed") {
            console.error("[poster-slice] step failed:", event.step);
            es.close();
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: event.message ?? event.step }), generatingModalOpen: false, generatingId: null });
          }
        }, () => {
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "error" }), generatingModalOpen: false, generatingId: null });
        });
      })
      .catch((err) => {
        console.error("[poster-slice] startPoster failed:", err);
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "error" }), generatingModalOpen: false, generatingId: null });
      });
  },

  retryPosterArtifact: (id, a) => {
    if (!a.runId) { get()._failRetry(id, "Missing run id for retry"); return; }
    const runId = a.runId;
    get()._updateRetryState(id, "Retrying poster pipeline...");

    let scriptGenConfirmed = false;
    let posterCompleted = false;

    const es = connectWithRetry(connectPosterSSE, runId, (event) => {
      let progress = 5;
      if (event.step === "script_gen") { progress = event.status === "completed" ? 40 : 20; }
      else if (event.step === "poster_image_extract") { progress = event.status === "completed" ? 65 : 50; }
      else if (event.step === "poster_compile") { progress = event.status === "completed" ? 90 : 70; }
      else if (event.step === "pipeline" && event.status === "completed") { progress = 100; }

      set({ artifacts: patchArtifact(get().artifacts, id, { progress, statusMessage: getSSEStatusMessage("poster", event.step, event.status, event.message) }) });

      if (event.step === "script_gen" && event.status === "completed" && !scriptGenConfirmed) {
        scriptGenConfirmed = true;
        const retryConfirm = (attemptsLeft: number, delayMs: number) => {
          confirmPoster(runId)
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              if ((msg.includes("not ready") || msg.includes("content_not_ready")) && attemptsLeft > 0) {
                setTimeout(() => retryConfirm(attemptsLeft - 1, delayMs * 2), delayMs);
              } else {
                es.close();
                get()._failRetry(id, getSSEErrorMessage());
              }
            });
        };
        setTimeout(() => retryConfirm(4, 600), 600);
      }

      if (event.step === "pipeline" && event.status === "completed") {
        if (posterCompleted) return;
        posterCompleted = true;
        es.close();
        getPosterDownload(runId)
          .then(({ download_url }) => {
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "done", progress: 100, downloadUrl: download_url, statusMessage: getSSEStatusMessage("poster", "pipeline", "completed") }) });
            setTimeout(() => get()._openPreviewIfAllowed(id), 800);
          })
          .catch(() => { get()._failRetry(id, getSSEErrorMessage()); });
      }

      if (event.status === "failed") { es.close(); get()._failRetry(id, event.message ?? getSSEErrorMessage()); }
    }, () => { get()._failRetry(id, getSSEErrorMessage()); });

    retryPosterRun(runId)
      .then(({ message }) => { set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: message }) }); })
      .catch((err) => { es.close(); get()._failRetry(id, err instanceof Error ? err.message : getSSEErrorMessage()); });
  },
});
