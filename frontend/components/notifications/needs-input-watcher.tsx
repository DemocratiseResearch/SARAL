"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Sparkles, X, AlertCircle } from "lucide-react";
import {
  useArtifactStore,
  ARTIFACT_LABELS,
  type Artifact,
} from "@/lib/artifact-store";
import { formatArtifactError } from "@/lib/sse-messages";

const ORIGINAL_TITLE = "Saral AI — Academic Papers to Educational Artifacts";

function isPending(a: Artifact) {
  return !!a.needsUserAction;
}

function isErrored(a: Artifact) {
  return a.status === "error";
}

export default function NeedsInputWatcher() {
  // Track which artifact IDs we've already toasted, so we don't refire on
  // every store update.
  const toastedRef = useRef<Set<string>>(new Set());
  const errorToastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Subscribe imperatively so we can diff prev/next state.
    const unsub = useArtifactStore.subscribe((state, prev) => {
      // 1. Toast newly-pending artifacts
      const prevPendingIds = new Set(
        prev.artifacts.filter(isPending).map((a) => a.id),
      );
      const currentPendingIds = new Set(
        state.artifacts.filter(isPending).map((a) => a.id),
      );

      // Auto-dismiss toasts for artifacts that are no longer pending
      // (e.g. edit modal opened — openEditModal clears needsUserAction).
      // We intentionally do NOT delete from toastedRef here — keeping the ID
      // suppresses a re-toast if handleClose restores needsUserAction without
      // the user confirming. The ID is only cleaned up in step 3 below.
      for (const id of prevPendingIds) {
        if (!currentPendingIds.has(id)) {
          toast.dismiss(`needs-input-${id}`);
        }
      }

      const justBecamePending = state.artifacts.filter(
        (a) => isPending(a) && !prevPendingIds.has(a.id),
      );

      for (const a of justBecamePending) {
        if (toastedRef.current.has(a.id)) continue;
        toastedRef.current.add(a.id);
        const label = ARTIFACT_LABELS[a.type];
        const description =
          a.needsUserAction === "edit" && a.type !== "business-brief"
            ? "Review and edit the result to continue"
            : "Tap to preview the result";

        const handleOpen = () => {
          const s = useArtifactStore.getState();
          // Re-read fresh artifact in case state changed between toast emission
          // and click (e.g. reel transitioned from rendering → done).
          const fresh = s.artifacts.find((x) => x.id === a.id) ?? a;
          const isReelMidPipeline =
            fresh.type === "reel" &&
            fresh.reelStage !== "done" &&
            fresh.reelStage !== "failed";
          if (isReelMidPipeline) {
            s.reopenReelStageModal(fresh.id);
          } else if (
            fresh.needsUserAction === "edit" &&
            fresh.type !== "business-brief"
          ) {
            s.openEditModal(fresh.id);
          } else {
            s.openPreviewModal(fresh.id);
          }
        };

        toast.custom(
          (id) => (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                handleOpen();
                toast.dismiss(id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpen();
                  toast.dismiss(id);
                }
              }}
              className="group relative flex w-90 cursor-pointer items-start gap-3 rounded-[14px] border border-pill-border bg-white dark:bg-carddarkbg p-3.5 pr-9 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-forest/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff5e6] text-[#b45309]">
                <Sparkles size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13.5px] font-bold text-ink dark:text-white">
                  {label} is ready for review
                </p>
                <p className="mt-0.5 font-sans text-[12px] leading-snug text-ink-muted dark:text-white/70">
                  {description}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(id);
                }}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-linen-dark hover:text-ink dark:text-white"
              >
                <X size={13} />
              </button>
            </div>
          ),
          // Stable ID so we can programmatically dismiss when the edit modal opens
          { id: `needs-input-${a.id}`, duration: Infinity },
        );
      }

      // 2. Toast newly-errored artifacts
      const prevErroredIds = new Set(
        prev.artifacts.filter(isErrored).map((a) => a.id),
      );
      const justErrored = state.artifacts.filter(
        (a) => isErrored(a) && !prevErroredIds.has(a.id),
      );

      for (const a of justErrored) {
        if (errorToastedRef.current.has(a.id)) continue;
        errorToastedRef.current.add(a.id);
        const label = ARTIFACT_LABELS[a.type];
        const { title, detail } = formatArtifactError(a.errorMessage);

        const handleRetry = () => {
          useArtifactStore.getState().retryArtifact(a.id);
        };

        toast.custom(
          (id) => (
            <div
              role="alert"
              className="group relative flex w-90 items-start gap-3 rounded-[14px] border border-red-200 bg-white p-3.5 pr-9 shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-red-500/30 dark:bg-carddarkbg"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400">
                <AlertCircle size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13.5px] font-bold text-ink dark:text-white">
                  {label}: {title}
                </p>
                <p className="mt-0.5 font-sans text-[12px] leading-snug text-ink-muted dark:text-white/70">
                  {detail}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleRetry();
                    toast.dismiss(id);
                  }}
                  className="mt-2 font-sans text-[12px] font-semibold text-red-600 underline-offset-2 hover:underline"
                >
                  Try again
                </button>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => toast.dismiss(id)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-red-50 hover:text-red-500"
              >
                <X size={13} />
              </button>
            </div>
          ),
          { duration: 12000 },
        );
      }

      // Clear error-toasted set for artifacts that are no longer errored
      // (e.g. user retried — so a future error can re-toast)
      const currentErroredIds = new Set(
        state.artifacts.filter(isErrored).map((a) => a.id),
      );
      for (const id of errorToastedRef.current) {
        if (!currentErroredIds.has(id)) errorToastedRef.current.delete(id);
      }

      // 3. Forget acknowledged artifacts so a future re-flip can re-toast.
      // Only clean up IDs where the artifact is truly resolved: either gone,
      // done, or errored. If the artifact is still generating/pending (modal
      // was opened temporarily), keep the ID to suppress spurious re-toasts
      // when handleClose restores needsUserAction.
      for (const id of toastedRef.current) {
        if (!currentPendingIds.has(id)) {
          const artifact = state.artifacts.find((a) => a.id === id);
          const isActiveButModalOpened =
            artifact &&
            (artifact.status === "generating" || artifact.status === "pending");
          if (!isActiveButModalOpened) {
            toastedRef.current.delete(id);
          }
        }
      }

      // 4. Update document title with pending count
      const count = currentPendingIds.size;
      if (typeof document !== "undefined") {
        document.title =
          count > 0 ? `(${count}) Action needed — Saral AI` : ORIGINAL_TITLE;
      }
    });

    // Initial title sync (subscribe doesn't fire on mount)
    const initialCount = useArtifactStore
      .getState()
      .artifacts.filter(isPending).length;
    if (initialCount > 0) {
      document.title = `(${initialCount}) Action needed — Saral AI`;
    }

    return () => {
      unsub();
      document.title = ORIGINAL_TITLE;
    };
  }, []);

  return null;
}
