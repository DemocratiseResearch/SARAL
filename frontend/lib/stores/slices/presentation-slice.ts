import type { StateCreator } from "zustand";
import {
  startPaperToSlides,
  connectPaperToSlidesSSE,
  getPaperToSlidesScript,
  updatePaperToSlidesScript,
  confirmPaperToSlides,
  getPaperToSlidesDeck,
} from "../../api";
import { scriptSectionsFromRaw, isModalBlocked, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { Script, SSEEvent } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";

export type PresentationSlice = {
  startPresentationGeneration: (paperId: string, language?: string, pptTemplate?: string) => void;
  confirmPresentationDeck: (artifactId: string, language?: string, outputFormat?: "ppt" | "beamer_pdf", editedScript?: Script) => void;
};

export const createPresentationSlice: StateCreator<ArtifactStore, [], [], PresentationSlice> = (set, get) => ({
  startPresentationGeneration: (paperId, language = "english", pptTemplate = "") => {
    if (!paperId) {
      const id = `presentation-${Date.now()}`;
      set({
        artifacts: [...get().artifacts, {
          id, type: "presentation", status: "error", progress: 0,
          config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language: "english", presentationOutputFormat: "ppt" },
          scripts: [], imageAssignments: {}, paperId,
          errorMessage: "Open a paper first, or upload PDF via Paper to Video so extraction completes.",
        }],
      });
      return;
    }

    const id = `presentation-${Date.now()}`;
    const artifact: Artifact = {
      id, type: "presentation", status: "waiting-script", progress: 5,
      config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language, presentationOutputFormat: "beamer_pdf", ...(pptTemplate ? { pptTemplate } : {}) },
      scripts: [], imageAssignments: {},
      statusMessage: "Starting slide deck pipeline…", paperId,
    };

    set({ artifacts: [...get().artifacts, artifact], selectedArtifactId: id, generatingModalOpen: true, generatingId: id });

    startPaperToSlides(paperId)
      .then(({ run_id }) => {
        set({ artifacts: patchArtifact(get().artifacts, id, { runId: run_id, progress: 15 }) });

        const es = connectPaperToSlidesSSE(run_id, (event: SSEEvent) => {
          set({
            artifacts: patchArtifact(get().artifacts, id, {
              statusMessage: event.message,
              progress: event.step === "script_gen" && event.status === "completed" ? 45
                : event.step === "script_gen" && event.status === "processing" ? 35
                : get().artifacts.find((a: Artifact) => a.id === id)?.progress,
            }),
          });

          if (event.step === "script_gen" && event.status === "completed") {
            es.close();
            getPaperToSlidesScript(run_id)
              .then((script) => {
                set({
                  artifacts: patchArtifact(get().artifacts, id, {
                    status: "pending", statusMessage: "Building slides…",
                    scripts: scriptSectionsFromRaw(script.sections), rawScript: script,
                  }),
                });
                get().confirmPresentationDeck(id, language);
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg, progress: 0 }), generatingModalOpen: false, generatingId: null });
              });
          }

          if (event.status === "failed") {
            es.close();
            set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: event.message }), generatingModalOpen: false, generatingId: null });
          }
        }, (err) => {
          console.error("[presentation-slice] SSE connection error:", err);
        });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[presentation-slice] startPaperToSlides failed:", msg);
        set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg }), generatingModalOpen: false, generatingId: null });
      });
  },

  confirmPresentationDeck: (artifactId, language, outputFormat, editedScript) => {
    const original = get().artifacts.find((a: Artifact) => a.id === artifactId);
    if (original?.type !== "presentation" || !original.runId || original.status === "generating") return;

    const originalRunId = original.runId;
    const resolvedLanguage = language ?? original.config.language;
    const resolvedOutputFormat: "ppt" | "beamer_pdf" =
      outputFormat ?? (original.config.presentationOutputFormat === "beamer_pdf" ? "beamer_pdf" : "ppt");
    const pptTemplate = original.config.pptTemplate;

    const newId = `presentation-${Date.now()}`;
    const newArtifact: Artifact = {
      ...original, id: newId, status: "generating", progress: 15,
      statusMessage: "Building slides…",
      slidesPdfUrl: undefined, slidesPptxUrl: undefined, downloadUrl: undefined,
      errorMessage: undefined, needsUserAction: undefined, replacesArtifactId: undefined,
      config: { ...original.config, ...(resolvedLanguage ? { language: resolvedLanguage } : {}), presentationOutputFormat: resolvedOutputFormat },
    };

    const shouldDropSource = original.status === "pending";
    const id = newId;
    const restoredConfig = get().editModalOriginalConfig;

    const baseArtifacts = shouldDropSource
      ? get().artifacts.filter((a: Artifact) => a.id !== artifactId)
      : get().artifacts.map((a: Artifact) => a.id === artifactId && restoredConfig ? { ...a, config: restoredConfig } : a);

    set({ artifacts: [...baseArtifacts, newArtifact], generatingModalOpen: true, generatingId: id, selectedArtifactId: id });

    const runBuild = (targetRunId: string, waitForScriptGen: boolean) => {
      if (targetRunId !== originalRunId) {
        set({ artifacts: patchArtifact(get().artifacts, id, { runId: targetRunId }) });
      }

      let deckFinalized = false;
      let scriptConfirmedAlready = false;
      let capturedCompileVersion: number | undefined;

      const doConfirm = () => {
        if (scriptConfirmedAlready) return;
        scriptConfirmedAlready = true;
        confirmPaperToSlides(targetRunId, {
          output_format: resolvedOutputFormat,
          language: resolvedLanguage,
          ...(pptTemplate ? { ppt_template: pptTemplate } : {}),
        }).catch((err) => {
          console.error("[presentation-slice] confirm failed:", err);
          es.close();
          const msg = err instanceof Error ? err.message : String(err);
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg }), generatingModalOpen: false, generatingId: null });
        });
      };

      const es = connectPaperToSlidesSSE(targetRunId, (event: SSEEvent) => {
        const rawVersion = event.data?.compile_version;
        if ((event.step === "beamer_compile" || event.step === "pipeline") && typeof rawVersion === "number" && rawVersion > 0) {
          capturedCompileVersion = rawVersion;
        }

        const progress = event.step === "beamer_compile"
          ? event.status === "completed" ? 98 : event.status === "processing" ? 70 : 55
          : event.step === "pipeline"
            ? event.status === "completed" ? 98 : 75
            : event.status === "processing" ? 50 : 35;

        get().updateProgress(id, Math.min(progress, 95));
        set({ artifacts: patchArtifact(get().artifacts, id, { statusMessage: event.message }) });

        if (waitForScriptGen && event.step === "script_gen" && event.status === "completed") {
          const scriptToUpload = editedScript ? { ...editedScript, run_id: targetRunId, language: resolvedLanguage } : null;
          const upload = scriptToUpload
            ? updatePaperToSlidesScript(targetRunId, scriptToUpload).catch((e) => console.error("[presentation-slice] script upload failed:", e))
            : Promise.resolve();
          upload.finally(doConfirm);
        }

        const compileDone = (event.step === "beamer_compile" || event.step === "pipeline") && event.status === "completed";
        if (compileDone && !deckFinalized) {
          deckFinalized = true;
          es.close();
          getPaperToSlidesDeck(targetRunId, { compileVersion: capturedCompileVersion })
            .then((deck) => {
              const primary = deck.slides_pptx_url ?? deck.slides_pdf_url ?? undefined;
              set({
                artifacts: patchArtifact(get().artifacts, id, {
                  status: "done", progress: 100,
                  slidesPdfUrl: deck.slides_pdf_url,
                  slidesPptxUrl: deck.slides_pptx_url,
                  downloadUrl: primary,
                  statusMessage: "Your deck is ready",
                  replacesArtifactId: undefined,
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
              console.error("[presentation-slice] getPaperToSlidesDeck failed:", err);
              set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: err instanceof Error ? err.message : "Failed to load download links" }), generatingModalOpen: false, generatingId: null });
            });
        }

        if (event.status === "failed") {
          es.close();
          set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: event.message || "Deck build failed" }), generatingModalOpen: false, generatingId: null });
        }
      });

      if (!waitForScriptGen) doConfirm();
    };

    if (editedScript && original.paperId) {
      startPaperToSlides(original.paperId)
        .then(({ run_id: newRunId }) => { runBuild(newRunId, true); })
        .catch((err) => {
          console.error("[presentation-slice] startPaperToSlides (re-gen) failed:", err);
          set({ artifacts: get().artifacts.filter((a: Artifact) => a.id !== id), generatingModalOpen: false, generatingId: null });
        });
    } else {
      runBuild(originalRunId, false);
    }
  },
});
