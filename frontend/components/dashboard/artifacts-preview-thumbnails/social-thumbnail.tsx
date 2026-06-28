"use client";

import { Maximize2 } from "lucide-react";
import type { Artifact } from "@/lib/artifact-store";

interface SocialThumbnailProps {
  artifact: Artifact;
  onExpand: () => void;
  onOpenLinkedInTab: () => void;
  onOpenTwitterTab: () => void;
}

export function SocialThumbnail({
  artifact,
  onExpand,
  onOpenLinkedInTab,
  onOpenTwitterTab,
}: SocialThumbnailProps) {
  const isLinkedIn = !!artifact.linkedInDraft;
  const isX = !!artifact.twitterDraft;

  const showLinkedIn = isLinkedIn || (!isLinkedIn && !isX);
  const showX = isX || (!isLinkedIn && !isX);
  const showBoth = showLinkedIn && showX;

  const handleContainerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onExpand();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open social drafts preview"
      onClick={onExpand}
      onKeyDown={handleContainerKey}
      className="h-full w-full min-h-0 rounded-[10px] bg-linen dark:bg-saral-dark border border-pill-border dark:border-white/10 flex flex-col items-center justify-center gap-3.5 relative group overflow-hidden cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-forest/40"
    >
      {/* Soft brand wash — LinkedIn blue bleeding from the left, X charcoal from the right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_15%_25%,rgba(10,102,194,0.18),transparent_55%),radial-gradient(120%_120%_at_85%_80%,rgba(0,0,0,0.14),transparent_55%)] dark:bg-[radial-gradient(120%_120%_at_15%_25%,rgba(10,102,194,0.30),transparent_55%),radial-gradient(120%_120%_at_85%_80%,rgba(255,255,255,0.08),transparent_55%)]"
      />

      {/* Overlapping brand-tile cluster */}
      <div className={`relative z-10 flex items-center ${showBoth ? "-space-x-2.5" : ""}`}>
        {showLinkedIn && (
          <button
            type="button"
            aria-label="View LinkedIn draft"
            title="View LinkedIn draft"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLinkedInTab();
            }}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#0A66C2] shadow-[0_4px_12px_rgba(10,102,194,0.35)] ring-2 ring-white/90 dark:ring-saral-dark transition-transform duration-150 hover:-translate-y-0.5 hover:-rotate-3 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
            </svg>
          </button>
        )}
        {showX && (
          <button
            type="button"
            aria-label="View X / Twitter draft"
            title="View X / Twitter draft"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTwitterTab();
            }}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-black shadow-[0_4px_12px_rgba(0,0,0,0.35)] ring-2 ring-white/90 dark:ring-saral-dark transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-3 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="white" className="h-4.5 w-4.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.638 5.904-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </button>
        )}
      </div>
      <p className="relative z-10 font-sans text-[11px] text-ink-muted dark:text-white/70 font-medium">
        Social drafts ready
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        title="View drafts"
        aria-label="View drafts"
        className="absolute top-2 right-2 z-20 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-black/40 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/55 text-white"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
