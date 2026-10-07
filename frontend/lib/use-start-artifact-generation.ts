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
    openPosterConfigModal,
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
        poster: () => openPosterConfigModal(paperId ?? ""),
        presentation: () => openPresentationConfigModal(paperId ?? ""),
        podcast: () => openPodcastConfigModal(paperId ?? ""),
        reel: () => openReelConfigModal(paperId ?? ""),
        "x-linkedin": () => startSocialGeneration(runId ?? ""),
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
      openPosterConfigModal,
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
