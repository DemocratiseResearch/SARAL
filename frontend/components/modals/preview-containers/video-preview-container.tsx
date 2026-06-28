"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useArtifactStore } from "@/lib/artifact-store";
import { getVideoUrl, triggerVideoDownload } from "@/lib/api";
import { VideoPreview } from "../preview-views/video-preview";
import type { Artifact } from "@/lib/artifact-store";

interface Props {
  artifact: Artifact;
  isFullscreen: boolean;
  onDownload: (handler: () => Promise<void>) => void;
}

export function VideoPreviewContainer({ artifact, isFullscreen, onDownload }: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [subsOn, setSubsOn] = useState(false);
  const playbackRef = useRef<{ seconds: number; autoplay: boolean }>({ seconds: 0, autoplay: false });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSubsOn(window.localStorage.getItem("saral_video_subs") === "on");
    }
  }, []);

  useEffect(() => {
    if (!artifact.runId) return;
    setVideoLoading(true);
    getVideoUrl(artifact.runId, { subs: subsOn })
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null))
      .finally(() => setVideoLoading(false));
  }, [artifact.runId, subsOn]);

  const updateSubsOn = useCallback((next: boolean) => {
    const { seconds, autoplay } = playbackRef.current;
    if (seconds > 0.1) {
      useArtifactStore.setState({ previewVideoResume: { seconds, autoplay } });
    }
    setSubsOn(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("saral_video_subs", next ? "on" : "off");
    }
  }, []);

  useEffect(() => {
    onDownload(async () => {
      if (!artifact.runId) throw new Error("No run ID");
      await triggerVideoDownload(artifact.runId, { subs: subsOn });
    });
  }, [artifact.runId, subsOn, onDownload]);

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <label htmlFor="subs-toggle" className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer select-none">
          <span className="font-sans text-[12px] font-medium text-ink-muted dark:text-white/70">Subtitles</span>
          <Switch id="subs-toggle" size="sm" checked={subsOn} onCheckedChange={updateSubsOn} />
        </label>
      </div>
      <div className={`mx-7 my-6 max-sm:mx-5 max-sm:my-4 dark:bg-carddarkbg rounded-lg overflow-hidden bg-[#1a1a1a] relative flex items-center justify-center aspect-video max-sm:aspect-auto max-sm:h-[min(42vh,320px)] ${isFullscreen ? "flex-1 min-h-0 mx-0 my-0 rounded-none" : ""}`}>
        <VideoPreview videoUrl={videoUrl} videoLoading={videoLoading} playbackStateRef={playbackRef} />
      </div>
    </>
  );
}
