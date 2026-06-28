"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Play } from "lucide-react";
import { type Artifact, useArtifactStore } from "@/lib/artifact-store";
import { getVideoUrl } from "@/lib/api";
import type { OpenPreviewModalOpts, VideoCardPlaybackRef } from "./shared";

interface VideoThumbnailProps {
  artifact: Artifact;
  onPlay: () => void;
  onExpand: (opts?: OpenPreviewModalOpts) => void;
  /** Lets the card "View" button pause/sync the same inline `<video>`. */
  playbackRef?: VideoCardPlaybackRef;
}

export function VideoThumbnail({
  artifact,
  onPlay,
  onExpand,
  playbackRef,
}: VideoThumbnailProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewModalOpen = useArtifactStore((s) => s.previewModalOpen);
  const selectedArtifactId = useArtifactStore((s) => s.selectedArtifactId);

  const loadVideo = useCallback(async () => {
    if (!artifact.runId || artifact.type !== "video") return;
    setLoading(true);
    try {
      const url = await getVideoUrl(artifact.runId);
      setVideoUrl(url);
    } catch {
      setVideoUrl(null);
    } finally {
      setLoading(false);
    }
  }, [artifact.runId, artifact.type]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  const pauseInline = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, []);

  const getResumeOpts = useCallback(():
    | Pick<OpenPreviewModalOpts, "videoResume">
    | undefined => {
    const v = videoRef.current;
    if (!videoUrl || !v) return undefined;
    const hasMeaningfulProgress = v.currentTime > 0.5 || !v.paused;
    if (!hasMeaningfulProgress) return undefined;
    return { videoResume: { seconds: v.currentTime, autoplay: !v.paused } };
  }, [videoUrl]);

  useEffect(() => {
    if (!playbackRef) return;
    playbackRef.current = { pause: pauseInline, getResumeOpts };
    return () => {
      playbackRef.current = null;
    };
  }, [playbackRef, pauseInline, getResumeOpts]);

  useEffect(() => {
    if (
      previewModalOpen &&
      selectedArtifactId === artifact.id &&
      videoRef.current
    ) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, [previewModalOpen, selectedArtifactId, artifact.id]);

  const handlePlayClick = () => {
    if (videoUrl && videoRef.current) {
      if (playing) {
        videoRef.current.pause();
        setPlaying(false);
      } else {
        videoRef.current.play();
        setPlaying(true);
      }
    } else {
      onPlay();
    }
  };

  const handleExpand = () => {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setPlaying(false);
    }
    onExpand();
  };

  const handleContainerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleExpand();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open full preview"
      onClick={handleExpand}
      onKeyDown={handleContainerKey}
      className="h-full w-full min-h-0 overflow-hidden rounded-[10px] relative group bg-black cursor-pointer transition-shadow hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-forest/50"
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
          <Loader2 size={22} className="text-white/50 animate-spin" />
        </div>
      ) : videoUrl ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            className={`w-full h-full object-cover transition-all duration-300 ${playing ? "blur-0" : "blur-sm brightness-75"}`}
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
          />

          <div className="absolute inset-0 flex items-center justify-center">
            {playing ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayClick();
                }}
                className="w-12 h-12 cursor-pointer rounded-full bg-black/50 flex items-center justify-center shadow-lg hover:bg-black/70 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Pause"
              >
                <span className="flex gap-[5px]">
                  <span className="w-[4px] h-[18px] bg-white rounded-sm" />
                  <span className="w-[4px] h-[18px] bg-white rounded-sm" />
                </span>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayClick();
                }}
                className="w-12 h-12 cursor-pointer rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-all hover:scale-105 active:scale-95"
                aria-label="Play"
              >
                <Play
                  size={20}
                  className="ml-0.5 fill-saral-forest text-saral-forest"
                />
              </button>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            title="Open full preview"
            aria-label="Open full preview"
            className="absolute top-2 right-2 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-black/55 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/75 text-white"
          >
            <Maximize2 size={14} />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]">
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            title="Open full preview"
            aria-label="Open full preview"
            className="absolute top-2 right-2 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-white/15 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white/25 text-white"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
