"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore, ARTIFACT_LABELS } from "@/lib/artifact-store";
import type { Artifact } from "@/lib/artifact-store";
import { getSSEStatusMessage, type SSEPipeline } from "@/lib/sse-messages";

type PipelineConfig = { ssePipeline: SSEPipeline; steps: string[] };

function getPipelineConfig(artifact: Artifact): PipelineConfig {
  switch (artifact.type) {
    case "video":
      return {
        ssePipeline: "video",
        steps: ["script_gen", "beamer_compile", "audio_gen", "ffmpeg_stitch"],
      };
    case "podcast":
      return {
        ssePipeline: "podcast",
        steps: [
          "podcast_script_gen",
          "podcast_tts",
          ...(artifact.podcastRenderVideo ? ["ffmpeg_stitch"] : []),
        ],
      };
    case "reel":
      return {
        ssePipeline: "reel",
        steps: ["reel_script_gen", "reel_audio_gen", "reel_video_gen"],
      };
    case "poster":
      return {
        ssePipeline: "poster",
        steps: ["script_gen", "poster_image_extract", "poster_compile"],
      };
    case "presentation":
      return { ssePipeline: "video", steps: ["script_gen", "beamer_compile"] };
    case "x-linkedin":
      return {
        ssePipeline: "social",
        steps: ["linkedin_draft", "twitter_draft"],
      };
    case "business-brief":
      return {
        ssePipeline: "business-brief",
        steps: [
          "business_brief_script",
          "business_brief_prepare_pdf",
          "business_brief_pdf_render",
        ],
      };
    default:
      return { ssePipeline: "video", steps: [] };
  }
}

/** Label: SSE "processing" message with trailing ellipsis stripped */
function stepLabel(pipeline: SSEPipeline, stepKey: string): string {
  return getSSEStatusMessage(pipeline, stepKey, "processing").replace(/…$/, "");
}

/** Match statusMessage to the ordered steps to find which is active. */
function getActiveIdx(
  steps: string[],
  pipeline: SSEPipeline,
  statusMessage: string | undefined,
  progress: number,
): number {
  if (statusMessage) {
    for (let i = 0; i < steps.length; i++) {
      if (
        getSSEStatusMessage(pipeline, steps[i], "processing") === statusMessage
      )
        return i;
    }
  }
  // Fallback: rough estimate from progress
  if (steps.length === 0) return 0;
  return Math.min(
    Math.floor((progress / 100) * steps.length),
    steps.length - 1,
  );
}

export default function GeneratingModal() {
  const {
    artifacts,
    generatingModalOpen,
    generatingId,
    closeGeneratingModal,
    openPreviewModal,
  } = useArtifactStore();

  const artifact = artifacts.find((a) => a.id === generatingId);
  if (!artifact) return null;

  const isDone = artifact.status === "done";
  const { ssePipeline, steps } = getPipelineConfig(artifact);
  const progress = artifact.progress ?? 0;
  const activeIdx = getActiveIdx(
    steps,
    ssePipeline,
    artifact.statusMessage,
    progress,
  );
  const typeLabel = ARTIFACT_LABELS[artifact.type];

  return (
    <AnimatePresence>
      {generatingModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={closeGeneratingModal}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3 pointer-events-none"
          >
            <div className="pointer-events-auto bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-110 max-sm:max-w-[90vw] overflow-hidden">
              <AnimatePresence mode="wait">
                {isDone ? (
                  /* ── Done state ── */
                  <motion.div
                    key="done"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center text-center p-8 max-sm:p-6"
                  >
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: "spring",
                        damping: 14,
                        stiffness: 280,
                      }}
                      className="w-16 h-16 rounded-full bg-saral-forest/[0.12] flex items-center justify-center mb-5"
                    >
                      <Check
                        size={28}
                        strokeWidth={2.5}
                        className="text-saral-forest"
                      />
                    </motion.div>
                    <h3 className="font-sans text-[22px] max-sm:text-[18px] font-bold text-ink dark:text-white mb-2">
                      {typeLabel} Generated!
                    </h3>
                    <p className="font-sans text-[14px] text-ink-muted dark:text-white/60 mb-7">
                      Your {typeLabel.toLowerCase()} is ready to view and share.
                    </p>
                    <div className="flex items-center gap-3 w-full">
                      <Button
                        className="flex-1 h-13 max-sm:h-11 rounded-full bg-saral-forest hover:bg-[#3d4b45] text-white font-sans font-semibold text-[15px] max-sm:text-[14px]"
                        onClick={() => {
                          closeGeneratingModal();
                          openPreviewModal(artifact.id);
                        }}
                      >
                        View {typeLabel}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-13 max-sm:h-11 px-6 rounded-full border-pill-border dark:border-darkcardborder bg-linen dark:bg-white/5 text-ink dark:text-white font-sans font-semibold text-[15px] max-sm:text-[14px] hover:bg-linen-dark dark:hover:bg-white/10"
                        onClick={closeGeneratingModal}
                      >
                        Close
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  /* ── Generating state ── */
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="px-6 pt-6 pb-5 max-sm:px-5 max-sm:pt-5">
                      <h3 className="font-sans text-[18px] max-sm:text-[16px] font-bold text-ink dark:text-white mb-3">
                        Generating {typeLabel}
                      </h3>

                      {/* Step list — labels and descriptions come from sse-messages.ts */}
                      <div className="mt-5 space-y-3.5">
                        {steps.map((stepKey, i) => {
                          const done = i < activeIdx;
                          const active = i === activeIdx;
                          return (
                            <div
                              key={stepKey}
                              className="flex items-start gap-3.5"
                            >
                              <div className="shrink-0 mt-0.5">
                                {done ? (
                                  <div className="w-8 h-8 rounded-full bg-saral-forest flex items-center justify-center">
                                    <Check
                                      size={15}
                                      strokeWidth={2.5}
                                      className="text-white"
                                    />
                                  </div>
                                ) : active ? (
                                  <div className="relative w-8 h-8 flex items-center justify-center">
                                    <span className="absolute inset-0 rounded-full border-2 border-saral-forest animate-ping opacity-60" />
                                    <div className="w-8 h-8 rounded-full border-2 border-saral-forest flex items-center justify-center">
                                      <div className="w-3 h-3 rounded-full bg-saral-forest" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-full border-2 border-pill-border dark:border-darkcardborder flex items-center justify-center">
                                    <div className="w-2.5 h-2.5 rounded-full bg-pill-border dark:bg-darkcardborder" />
                                  </div>
                                )}
                              </div>
                              <div className="pt-1">
                                <p
                                  className={`font-sans text-[14px] leading-snug ${
                                    done
                                      ? "line-through text-ink-faint dark:text-white/30"
                                      : active
                                        ? "font-semibold text-ink dark:text-white"
                                        : "text-ink-faint dark:text-white/30"
                                  }`}
                                >
                                  {stepLabel(ssePipeline, stepKey)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-4 px-6 py-4 max-sm:px-5 bg-linen dark:bg-white/[0.03] border-t border-pill-border dark:border-darkcardborder">
                      <p className="font-sans text-[12px] text-ink-muted dark:text-white/50 leading-snug">
                        Generation continues in the background - you can close
                        this tab & generate other outputs.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={closeGeneratingModal}
                        className="shrink-0 h-auto rounded-full border-pill-border dark:border-darkcardborder bg-white dark:bg-white/5 px-4 py-2 text-[13px] font-semibold text-ink dark:text-white hover:bg-linen-dark dark:hover:bg-white/10 shadow-sm"
                      >
                        Continue in background
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
