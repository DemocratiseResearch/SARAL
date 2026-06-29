"use client";

import { useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore, ARTIFACT_LABELS } from "@/lib/artifact-store";
import { VideoEditPanel } from "./edit-panels/video-edit-panel";
import { PresentationEditPanel } from "./edit-panels/presentation-edit-panel";
import { BriefEditPanel } from "./edit-panels/brief-edit-panel";

export default function EditModal() {
  const { artifacts, selectedArtifactId, editModalOpen, closeEditModal } =
    useArtifactStore();

  const artifact = artifacts.find((a) => a.id === selectedArtifactId);
  const isBrief = artifact?.type === "business-brief";
  const isPresentation = artifact?.type === "presentation";

  // When user dismisses modal without confirming, restore needsUserAction so
  // the notification reappears. Works for all artifact types regardless of
  // status — business-brief is "done" while presentation is "pending".
  const handleClose = useCallback(() => {
    const s = useArtifactStore.getState();
    if (s.editModalTriggeredByPipeline && s.selectedArtifactId) {
      useArtifactStore.setState((state) => ({
        artifacts: state.artifacts.map((a) =>
          a.id === s.selectedArtifactId ? { ...a, needsUserAction: "edit" } : a,
        ),
      }));
    }
    closeEditModal();
  }, [closeEditModal]);

  if (
    !artifact ||
    (artifact.status !== "done" && artifact.status !== "pending")
  )
    return null;

  return (
    <AnimatePresence>
      {editModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-230 max-sm:max-w-[95vw] max-h-[90vh] flex flex-col relative">
              {/* Header */}
              <div className="flex-none bg-white dark:bg-carddarkbg dark:border-darkcardborder border-b border-[#f5f5f5] px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="font-serif text-[26px] max-lg:text-[24px] max-sm:text-[20px] font-semibold text-ink dark:text-white">
                  {ARTIFACT_LABELS[artifact.type]}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-linen-dark dark:hover:bg-saral-dark w-9 h-9 rounded-lg"
                >
                  <X size={20} />
                </Button>
              </div>

              {isBrief ? (
                <BriefEditPanel artifact={artifact} open={editModalOpen} />
              ) : isPresentation ? (
                <PresentationEditPanel
                  artifact={artifact}
                  open={editModalOpen}
                />
              ) : (
                <VideoEditPanel artifact={artifact} open={editModalOpen} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
