"use client";

import { Maximize2, Play } from "lucide-react";
import type { Artifact } from "@/lib/artifact-store";

interface GenericThumbnailProps {
  artifact: Artifact;
  color: string;
  onPlay: () => void;
  onExpand: () => void;
}

export function GenericThumbnail({
  artifact,
  color,
  onPlay,
  onExpand,
}: GenericThumbnailProps) {
  return (
    <div
      className="h-full w-full min-h-0 flex items-center justify-center relative group overflow-hidden rounded-[10px]"
      style={{ backgroundColor: color + "40" }}
    >
      {artifact.downloadUrl ? (
        <span className="font-sans text-[11px] text-ink-muted dark:text-white/70">
          Preview available
        </span>
      ) : (
        <button
          onClick={onPlay}
          className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-saral-forest transition-colors hover:bg-saral-forest/85"
          aria-label="Preview"
        >
          <Play size={20} className="text-white fill-white ml-0.5" />
        </button>
      )}
      <button
        onClick={onExpand}
        title="Open in preview"
        className="absolute top-2 right-2 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-black/40 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/55 text-white"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
