"use client";

import { useEffect, useState } from "react";
import { getReelVideoUrl, triggerReelDownload } from "@/lib/api";
import { ReelPreview } from "../preview-views/reel-preview";
import type { Artifact } from "@/lib/artifact-store";

interface Props {
  artifact: Artifact;
  onDownload: (handler: () => Promise<void>) => void;
}

export function ReelPreviewContainer({ artifact, onDownload }: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  useEffect(() => {
    if (!artifact.runId) return;
    setVideoLoading(true);
    getReelVideoUrl(artifact.runId)
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null))
      .finally(() => setVideoLoading(false));
  }, [artifact.runId]);

  useEffect(() => {
    onDownload(async () => {
      if (!artifact.runId) throw new Error("No run ID");
      await triggerReelDownload(artifact.runId);
    });
  }, [artifact.runId, onDownload]);

  return (
    <div className="mx-7 my-6 max-sm:mx-5 max-sm:my-4 dark:bg-carddarkbg rounded-lg overflow-hidden bg-[#1a1a1a] relative flex items-center justify-center h-[min(50vh,480px)] max-sm:h-[min(45vh,400px)]">
      <ReelPreview videoUrl={videoUrl} videoLoading={videoLoading} />
    </div>
  );
}
