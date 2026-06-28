"use client";

import EditModal from "@/components/modals/edit-modal";
import PreviewModal from "@/components/modals/preview-modal";
import GeneratingModal from "@/components/modals/generating-modal";
import PodcastConfigModal from "@/components/modals/podcast-config-modal";
import VideoConfigModal from "@/components/modals/video-config-modal";
import ReelConfigModal from "@/components/modals/reel-config-modal";
import ReelScriptModal from "@/components/modals/reel-script-modal";
import ReelAvatarModal from "@/components/modals/reel-avatar-modal";
import PresentationConfigModal from "@/components/modals/presentation-config-modal";
import { useArtifactStore } from "@/lib/artifact-store";

/**
 * Global mount for artifact modals on every /dashboard/** route so SSE / async
 * completions can open UI while the user is on the papers list or a paper page
 * that is still loading metadata.
 */
export default function DashboardArtifactModals() {
  const { editModalOpen, previewModalOpen, generatingModalOpen } =
    useArtifactStore();

  return (
    <>
      {editModalOpen && <EditModal />}
      {previewModalOpen && <PreviewModal />}
      {generatingModalOpen && <GeneratingModal />}
      <PodcastConfigModal />
      <VideoConfigModal />
      <ReelConfigModal />
      <ReelScriptModal />
      <ReelAvatarModal />
      <PresentationConfigModal />
    </>
  );
}
