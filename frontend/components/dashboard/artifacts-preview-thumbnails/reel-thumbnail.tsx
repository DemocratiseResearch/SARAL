"use client";

import { useEffect, useState } from "react";
import { Loader2, Maximize2, Play } from "lucide-react";
import type { Artifact } from "@/lib/artifact-store";
import { getReelVideoUrl } from "@/lib/api";

interface ReelThumbnailProps {
  artifact: Artifact;
  onPlay: () => void;
  onExpand: () => void;
}

export function ReelThumbnail({
  artifact,
  onPlay,
  onExpand,
}: ReelThumbnailProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artifact.runId) return;
    setLoading(true);
    getReelVideoUrl(artifact.runId)
      .then((url) => setVideoUrl(url))
      .catch(() => setVideoUrl(null))
      .finally(() => setLoading(false));
  }, [artifact.runId]);

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
      className="h-full w-full min-h-0 overflow-hidden rounded-[10px] relative group bg-black flex items-center justify-center cursor-pointer transition-shadow hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-forest/50"
    >
      {loading ? (
        <Loader2 size={22} className="text-white/50 animate-spin" />
      ) : videoUrl ? (
        <>
          <video
            src={videoUrl}
            className="h-full w-auto max-w-full object-contain brightness-90"
            preload="metadata"
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="w-12 h-12 cursor-pointer rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-all hover:scale-105 active:scale-95"
              aria-label="Play"
            >
              <Play
                size={20}
                className="ml-0.5 fill-saral-forest text-saral-forest"
              />
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
        </>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="w-12 h-12 cursor-pointer rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          aria-label="Preview"
        >
          <Play size={20} className="text-white fill-white ml-0.5" />
        </button>
      )}
    </div>
  );
}
