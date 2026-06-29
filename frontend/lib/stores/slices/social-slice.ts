import type { StateCreator } from "zustand";
import { connectSSE, triggerLinkedInDraft, triggerTwitterDraft, getLinkedInDraft, getTwitterDraft } from "../../api";
import { getSSEStatusMessage, getSSEErrorMessage, getPipelineStartMessage } from "../../sse-messages";
import { connectWithRetry, isModalBlocked, patchArtifact } from "../artifact-helpers";
import type { Artifact } from "../artifact-types";
import type { LinkedInDraft, TwitterDraft, SSEEvent } from "../../types";
import type { ArtifactStore } from "../artifact-store-types";
import { usePaperStore } from "../../paper-store";

export type SocialSlice = {
  startSocialGeneration: (runId: string) => void;
};

export const createSocialSlice: StateCreator<ArtifactStore, [], [], SocialSlice> = (set, get) => ({
  startSocialGeneration: (runId) => {
    if (!runId) { console.error("[social-slice] no runId"); return; }

    const id = `x-linkedin-${Date.now()}`;
    const artifact: Artifact = {
      id, type: "x-linkedin", status: "generating", progress: 5,
      config: { audioLanguage: "English", textLanguage: "English", voiceGender: "female", language: "english" },
      scripts: [], runId, imageAssignments: {},
      statusMessage: getPipelineStartMessage("social"),
      paperId: usePaperStore.getState().paperId ?? undefined,
    };

    set({ artifacts: [...get().artifacts, artifact], generatingModalOpen: true, generatingId: id });

    let liDone = false;
    let twDone = false;
    let liDraft: LinkedInDraft | undefined;
    let twDraft: TwitterDraft | undefined;

    const fail = (msg: string) => {
      console.error("[social-slice] generation failed:", msg);
      set({ artifacts: patchArtifact(get().artifacts, id, { status: "error", errorMessage: msg, progress: 0 }), generatingModalOpen: false, generatingId: null });
    };

    const checkBothDone = () => {
      if (!liDone || !twDone) return;
      set({
        artifacts: patchArtifact(get().artifacts, id, {
          status: "done", progress: 100, linkedInDraft: liDraft, twitterDraft: twDraft,
          statusMessage: getSSEStatusMessage("social", "_done", "completed"),
        }),
      });
      setTimeout(() => {
        if (isModalBlocked(get(), id)) {
          set({ generatingModalOpen: false, generatingId: null, artifacts: patchArtifact(get().artifacts, id, { needsUserAction: "preview" }) });
        } else {
          set({ generatingModalOpen: false, generatingId: null, selectedArtifactId: id, previewModalOpen: true, previewInitialView: "preview", previewVideoResume: null });
        }
      }, 600);
    };

    const es = connectWithRetry(connectSSE, runId, (event: SSEEvent) => {
      if (event.step === "linkedin_draft" && event.status === "processing") {
        set({ artifacts: patchArtifact(get().artifacts, id, { progress: 30, statusMessage: getSSEStatusMessage("social", "linkedin_draft", "processing") }) });
      }
      if (event.step === "twitter_draft" && event.status === "processing") {
        set({ artifacts: patchArtifact(get().artifacts, id, { progress: 60, statusMessage: getSSEStatusMessage("social", "twitter_draft", "processing") }) });
      }
      if (event.step === "linkedin_draft" && event.status === "completed") {
        getLinkedInDraft(runId)
          .then((draft) => { liDraft = draft; liDone = true; set({ artifacts: patchArtifact(get().artifacts, id, { progress: 70 }) }); checkBothDone(); })
          .catch((err) => fail(err instanceof Error ? err.message : "LinkedIn draft fetch failed"));
      }
      if (event.step === "twitter_draft" && event.status === "completed") {
        getTwitterDraft(runId)
          .then((draft) => { twDraft = draft; twDone = true; set({ artifacts: patchArtifact(get().artifacts, id, { progress: 90 }) }); checkBothDone(); })
          .catch((err) => fail(err instanceof Error ? err.message : "Twitter draft fetch failed"));
      }
      if (event.status === "failed" && (event.step === "linkedin_draft" || event.step === "twitter_draft")) {
        es.close();
        fail(getSSEErrorMessage());
      }
    }, () => { fail(getSSEErrorMessage()); });

    Promise.allSettled([triggerLinkedInDraft(runId), triggerTwitterDraft(runId)])
      .then(([liResult, twResult]) => {
        if (liResult.status === "rejected") console.error("[social-slice] triggerLinkedInDraft failed:", liResult.reason);
        if (twResult.status === "rejected") console.error("[social-slice] triggerTwitterDraft failed:", twResult.reason);
        if (liResult.status === "rejected" && twResult.status === "rejected") {
          es.close();
          fail("Failed to start social draft generation");
        }
      });
  },
});
