"use client";

import { useMemo } from "react";
import { Bell } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useArtifactStore,
  ARTIFACT_LABELS,
  type Artifact,
} from "@/lib/artifact-store";

function isPending(a: Artifact) {
  // Status may be "done", "idle" or other states when the pipeline pauses
  // for input — the source of truth is needsUserAction itself.
  return !!a.needsUserAction;
}

export default function NeedsInputBell() {
  const router = useRouter();
  const pathname = usePathname();
  // Select the stable array reference; derive the filtered list via useMemo
  // so we don't return a new array from the selector on every render
  // (Zustand uses Object.is for change detection — new array = infinite loop).
  const artifacts = useArtifactStore((s) => s.artifacts);
  const pendingArtifacts = useMemo(
    () => artifacts.filter(isPending),
    [artifacts],
  );
  const count = pendingArtifacts.length;

  // The pill used to say "needs input" for every notification, which was
  // a misleading promise of work — most pending items are just "your
  // output is ready, open it to view" (needsUserAction === "preview"),
  // not anything that genuinely requires the user to fill in or edit
  // something. Adapt the wording to what's actually there:
  //
  //   - all preview-only      → "X ready"         (just notifying)
  //   - any edit              → "X needs review"  (genuine ask)
  //
  // Dropdown header tracks the same distinction, and each row keeps its
  // own per-artifact sub-action label.
  const editCount = useMemo(
    () =>
      pendingArtifacts.filter(
        (a) => a.needsUserAction === "edit" && a.type !== "business-brief",
      ).length,
    [pendingArtifacts],
  );
  // Pill label adapts to what's ACTUALLY in the notification list:
  //   - all items are just "your output is ready, view it"  → "Ready to view"
  //   - all items genuinely need editing/reviewing          → "Needs review"
  //   - mixed bag (some ready + some need edit)             → "Updates"
  // Previous logic flipped to "Needs review" the instant even one edit
  // item appeared, which mislabelled the other ready-to-view items in
  // the same pill (e.g. 4 ready + 1 to edit was showing "Needs review ·
  // 5", scaring the user into thinking five things needed action).
  const allEdit = editCount === count;
  const noEdit = editCount === 0;
  const pillLabel = noEdit
    ? "Ready to view"
    : allEdit
      ? "Needs review"
      : "Updates";
  // Dropdown header intentionally uses different wording so the panel
  // doesn't echo the pill — avoids the "same label twice" feel.
  const dropdownHeader = noEdit
    ? "Recent outputs"
    : allEdit
      ? "Pending action"
      : "Recent activity";

  const handleReview = (a: Artifact) => {
    const s = useArtifactStore.getState();
    const isReelMidPipeline =
      a.type === "reel" && a.reelStage !== "done" && a.reelStage !== "failed";

    // Set modal state first (store is global — the paper page will pick it up
    // once mounted, or open immediately if already on the right page).
    if (isReelMidPipeline) {
      s.reopenReelStageModal(a.id);
    } else if (
      a.needsUserAction === "edit" &&
      a.type !== "business-brief"
    ) {
      s.openEditModal(a.id);
    } else {
      s.openPreviewModal(a.id);
    }

    // Navigate to the paper page only if not already there.
    if (a.paperId) {
      const targetPath = `/dashboard/paper/${a.paperId}`;
      if (pathname !== targetPath) {
        router.push(targetPath);
      }
    }
  };

  if (count === 0) {
    return (
      <button
        type="button"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted dark:text-white/70 hover:bg-[#f5f5f5] hover:text-ink dark:text-white"
        disabled
      >
        <Bell size={17} />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${pillLabel} (${count})`}
          className="relative flex h-9 max-w-[min(100%,12rem)] items-center gap-2 truncate rounded-full border border-[#f4d79e] bg-[#fff8eb] pl-1.5 pr-3 font-sans text-[12.5px] font-semibold text-[#7c4a06] hover:bg-[#ffefd0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45309]/40 sm:max-w-none"
        >
          {/* Numbered amber badge — replaces the bare pulsing dot. The
              count lives here as a glanceable chip, leaving the label
              text clean ("Ready to view") instead of "Ready to view · 2". */}
          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70" />
            <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 font-sans text-[11px] font-bold leading-none text-white">
              {count > 9 ? "9+" : count}
            </span>
          </span>
          {pillLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-70 rounded-cta border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder p-1.5 shadow-lg"
      >
        <DropdownMenuLabel className="px-2.5 py-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:text-white/70">
          {dropdownHeader}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#f0ece4] dark:bg-darkcardborder" />
        {pendingArtifacts.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() => handleReview(a)}
            className="cursor-pointer flex-col items-start gap-0.5 rounded-[8px] px-2.5 py-2 font-sans"
          >
            <span className="text-[13px] font-semibold text-ink dark:text-white">
              {ARTIFACT_LABELS[a.type]}
            </span>
            {a.needsUserAction === "edit" && a.type !== "business-brief" && (
              <span className="text-[11.5px] text-ink-muted dark:text-white/70">
                Review and edit
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
