"use client";

import { Maximize2, Play } from "lucide-react";
import type { Artifact } from "@/lib/artifact-store";

interface PodcastThumbnailProps {
  artifact: Artifact;
  onPlay: () => void;
  onExpand: () => void;
}

export function PodcastThumbnail({
  artifact,
  onPlay,
  onExpand,
}: PodcastThumbnailProps) {
  const videoUrl = artifact.podcastVideoUrl;

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
      aria-label="Open full preview"
      onClick={onExpand}
      onKeyDown={handleContainerKey}
      className="h-full w-full min-h-0 overflow-hidden rounded-[10px] relative group bg-[#1a1a1a] cursor-pointer transition-shadow hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-gold/50"
    >
      {videoUrl && (
        <video
          src={videoUrl}
          className="w-full h-full object-cover brightness-75"
          preload="metadata"
          muted
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="w-12 h-12 cursor-pointer rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-all hover:scale-105 active:scale-95"
          aria-label="Play"
        >
          <Play size={20} className="text-saral-gold fill-saral-gold ml-0.5" />
        </button>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        title="Open full preview"
        aria-label="Open full preview"
        className="absolute top-2 right-2 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-black/55 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/75 text-white"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
