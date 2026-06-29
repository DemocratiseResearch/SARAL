"use client";

import { useCallback } from "react";
import { useArtifactStore, type ArtifactType } from "@/lib/artifact-store";
import { usePaperStore } from "@/lib/paper-store";

/**
 * Starts generation for an artifact type — same dispatch logic as the legacy sidebar.
 */
export function useStartArtifactGeneration() {
  const {
    startGeneration,
    startPosterGeneration,
    openPresentationConfigModal,
    openPodcastConfigModal,
    openVideoConfigModal,
    openReelConfigModal,
    startSocialGeneration,
  } = useArtifactStore();
  const { runId, paperId } = usePaperStore();

  return useCallback(
    (type: ArtifactType) => {
      const handlers: Partial<Record<ArtifactType, () => void>> = {
        // All immediate-fire types: no modal, sensible defaults baked into
        // the store action. User can tweak after generation via pencil.
        poster: () => startPosterGeneration(paperId ?? ""),
        presentation: () => openPresentationConfigModal(paperId ?? ""),
        podcast: () => openPodcastConfigModal(paperId ?? ""),
        reel: () => openReelConfigModal(paperId ?? ""),
        "x-linkedin": () => startSocialGeneration(runId ?? ""),
        // Video is the only one that asks a question first — the audience
        // pick genuinely changes the narration depth/tone. After the
        // user picks one option, the modal fires the generation; no
        // separate "Generate Video" click needed downstream.
        video: () => openVideoConfigModal(runId ?? ""),
      };
      const handler = handlers[type];
      if (handler) {
        handler();
      } else {
        startGeneration(type);
      }
    },
    [
      startGeneration,
      startPosterGeneration,
      openPresentationConfigModal,
      openPodcastConfigModal,
      openVideoConfigModal,
      openReelConfigModal,
      startSocialGeneration,
      runId,
      paperId,
    ],
  );
}
