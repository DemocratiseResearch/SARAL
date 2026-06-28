"use client";

import { ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore } from "@/lib/artifact-store";
import { usePaperStore } from "@/lib/paper-store";

/** Shared hint banner: sky tint reads as informational (vs. neutral cream or brand gradient). */
const HINT_BANNER_CLASS =
  "bg-sky-50 border border-sky-200/80 dark:bg-sky-950/40 dark:border-sky-800/60";

const HINT_ICON_TILE_CLASS = "bg-sky-600 dark:bg-sky-500 text-white";

export interface PaperHintInfographicProps {
  /** Opens the mobile sheet to pick an artifact type to generate (paper detail only). */
  onOpenGenerateSheet?: () => void;
}

/** Mobile sheet CTA. Always rendered on mobile so users on small screens
 *  get a discoverable tap-target into the artifact-picker sheet — both
 *  when there's nothing generated yet (acts as primary CTA) and when
 *  there are artifacts (acts as "generate another"). Hidden on lg+ where
 *  the inline empty-state grid + tab strip cover both cases. */
export function PaperHintInfographic({
  onOpenGenerateSheet,
}: PaperHintInfographicProps) {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const paperId = usePaperStore((s) => s.paperId);

  const hasPaperArtifacts = artifacts.some(
    (a) =>
      a.paperId === paperId &&
      (a.status === "done" ||
        a.status === "pending" ||
        a.status === "generating" ||
        a.status === "waiting-script"),
  );

  // Mobile sheet path — show whenever a sheet opener is wired (the paper
  // detail screen), regardless of whether artifacts exist yet. Copy adapts
  // to the state so the button reads naturally either way.
  if (!onOpenGenerateSheet) return null;

  const headline = hasPaperArtifacts
    ? "Switch between tabs below or click here"
    : "Tap to choose what to create";
  const subline = "Generate videos, podcasts, posters etc.";

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpenGenerateSheet}
      aria-label={headline}
      className={`group lg:hidden w-full h-auto cursor-pointer justify-start rounded-[14px] px-3.5 py-3 mb-4 sm:mb-5
          shadow-none ${HINT_BANNER_CLASS}
          hover:bg-sky-100/90 dark:hover:bg-sky-900/50 active:scale-[0.995]
          flex items-center gap-2.5 text-left font-normal
          transition-[background-color,transform] duration-200 ease-out
          focus-visible:ring-2 focus-visible:ring-sky-400/45 focus-visible:ring-offset-2`}
    >
      <div
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] ${HINT_ICON_TILE_CLASS}`}
      >
        <Info className="size-3 shrink-0" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <p className="font-sans font-bold text-xs tracking-tight text-ink dark:text-white leading-tight">
          {headline}
        </p>
        <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 leading-snug">
          {subline}
        </p>
      </div>
      <span
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full p-0 leading-none transition-transform duration-200 group-active:translate-x-0.5 ${HINT_ICON_TILE_CLASS}`}
        aria-hidden
      >
        <ChevronRight className="size-3.5" strokeWidth={2.5} aria-hidden />
      </span>
    </Button>
  );
}
