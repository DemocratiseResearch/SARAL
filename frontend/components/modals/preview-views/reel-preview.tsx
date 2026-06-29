"use client";

import { Loader2 } from "lucide-react";

interface ReelPreviewProps {
  videoUrl: string | null;
  videoLoading: boolean;
}

export function ReelPreview({ videoUrl, videoLoading }: ReelPreviewProps) {
  if (videoLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin text-white/40" />
        <p className="font-sans text-[13px] text-white/40">Loading reel…</p>
      </div>
    );
  }
  if (!videoUrl) {
    return (
      <p className="font-sans text-[14px] text-ink-faint">
        Reel preview not available
      </p>
    );
  }
  return (
    <video
      src={videoUrl}
      controls
      controlsList="nodownload"
      className="h-full w-auto max-w-full object-contain rounded-md"
    />
  );
}
