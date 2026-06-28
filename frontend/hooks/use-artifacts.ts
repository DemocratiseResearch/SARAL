"use client";

import { useArtifactStore, selectActiveModal } from "@/lib/artifact-store";
import type { ArtifactType } from "@/lib/artifact-store";

export const useAllArtifacts = () =>
  useArtifactStore((s) => s.artifacts);

export const useArtifactsByType = (type: ArtifactType) =>
  useArtifactStore((s) => s.artifacts.filter((a) => a.type === type));

export const useSelectedArtifact = () =>
  useArtifactStore((s) => s.artifacts.find((a) => a.id === s.selectedArtifactId) ?? null);

export const useIsGenerating = () =>
  useArtifactStore((s) => s.generatingModalOpen);

export const useGeneratingArtifact = () =>
  useArtifactStore((s) =>
    s.generatingId ? s.artifacts.find((a) => a.id === s.generatingId) ?? null : null
  );

export const useArtifactById = (id: string | null) =>
  useArtifactStore((s) => (id ? s.artifacts.find((a) => a.id === id) ?? null : null));

export const useHasArtifacts = () =>
  useArtifactStore((s) => s.artifacts.length > 0);

export const useActiveModal = () =>
  useArtifactStore(selectActiveModal);

export const useArtifactActions = () =>
  useArtifactStore((s) => ({
    openEditModal: s.openEditModal,
    closeEditModal: s.closeEditModal,
    openPreviewModal: s.openPreviewModal,
    closePreviewModal: s.closePreviewModal,
    openGeneratingModal: s.openGeneratingModal,
    closeGeneratingModal: s.closeGeneratingModal,
    setSelectedArtifact: s.setSelectedArtifact,
    retryArtifact: s.retryArtifact,
  }));
