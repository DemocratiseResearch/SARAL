"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore } from "@/lib/artifact-store";
import { formatMediaTime } from "@/lib/utils";

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function SpeedControl({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (r: number) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="min-w-[36px] rounded-md bg-white/10 px-2 py-1 font-mono text-[11px] font-semibold text-white hover:bg-white/20 transition-colors"
      >
        {rate === 1 ? "1×" : `${rate}×`}
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 flex flex-col gap-0.5 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 p-1 shadow-xl z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={`w-full px-4 py-1 rounded-md font-mono text-[12px] font-medium transition-colors text-left whitespace-nowrap ${
                s === rate
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {s === 1 ? "1×" : `${s}×`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Custom controls — native `controls` play glyph can desync from actual playback (esp. after programmatic `play()`). */
function PreviewArtifactVideo({
  src,
  onLoadedMeta,
  playbackStateRef,
}: {
  src: string;
  /** Run seek/autoplay resume once `loadedmetadata` fires */
  onLoadedMeta: (video: HTMLVideoElement) => void;
  /** Live mirror of playback state. Parent reads this before swapping `src` (e.g. on subtitle toggle) to resume from the same spot. */
  playbackStateRef?: React.RefObject<{
    seconds: number;
    autoplay: boolean;
  } | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackRate(1);
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (
        el.closest(
          'button, a[href], input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return;
      }
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [src, togglePlay]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <video
        ref={videoRef}
        src={src}
        playsInline
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full object-contain cursor-pointer"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          onLoadedMeta(v);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrentTime(v.currentTime);
          if (playbackStateRef?.current) {
            playbackStateRef.current.seconds = v.currentTime;
          }
        }}
        onPlay={() => {
          setPlaying(true);
          if (playbackStateRef?.current) {
            playbackStateRef.current.autoplay = true;
          }
        }}
        onPause={() => {
          setPlaying(false);
          if (playbackStateRef?.current) {
            playbackStateRef.current.autoplay = false;
          }
        }}
        onEnded={() => {
          setPlaying(false);
          if (playbackStateRef?.current) {
            playbackStateRef.current.autoplay = false;
          }
        }}
      />
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30 cursor-pointer"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 shadow-xl ring-1 ring-black/10 transition-transform hover:scale-105 max-sm:h-16 max-sm:w-16">
            <Play size={32} className="ml-1 text-ink" fill="currentColor" />
          </span>
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent pt-20 max-sm:pt-10">
        <div className="pointer-events-auto flex items-center gap-3 px-3 pb-3 max-sm:gap-2 max-sm:px-2 max-sm:pb-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-11 w-11 max-sm:h-9 max-sm:w-9 shrink-0 rounded-full border-0 bg-white text-ink shadow-md hover:bg-white/90"
            aria-label={playing ? "Pause video" : "Play video"}
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={22} className="text-ink" fill="currentColor" />
            ) : (
              <Play size={22} className="ml-0.5 text-ink" fill="currentColor" />
            )}
          </Button>
          <input
            type="range"
            aria-label="Seek"
            className="h-1.5 flex-1 cursor-pointer accent-white disabled:opacity-40"
            disabled={!Number.isFinite(duration) || duration <= 0}
            min={0}
            max={Number.isFinite(duration) && duration > 0 ? duration : 0}
            step="any"
            value={
              Number.isFinite(currentTime) && Number.isFinite(duration)
                ? Math.min(currentTime, duration)
                : 0
            }
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              const t = Number(e.target.value);
              v.currentTime = t;
              setCurrentTime(t);
            }}
          />
          <span className="shrink-0 text-right font-mono text-[10px] text-white/90 tabular-nums min-[400px]:text-[11px]">
            {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
          </span>
          <SpeedControl rate={playbackRate} onChange={setPlaybackRate} />
        </div>
      </div>
    </div>
  );
}

interface VideoPreviewProps {
  videoUrl: string | null;
  videoLoading: boolean;
  playbackStateRef?: React.RefObject<{
    seconds: number;
    autoplay: boolean;
  } | null>;
}

export function VideoPreview({
  videoUrl,
  videoLoading,
  playbackStateRef,
}: VideoPreviewProps) {
  if (videoLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin text-white/40" />
        <p className="font-sans text-[13px] text-white/40">Loading video…</p>
      </div>
    );
  }
  if (!videoUrl) {
    return (
      <p className="font-sans text-[14px] max-sm:text-[12px] text-ink-faint">
        Video preview not available
      </p>
    );
  }
  return (
    <PreviewArtifactVideo
      src={videoUrl}
      playbackStateRef={playbackStateRef}
      onLoadedMeta={(v) => {
        const r = useArtifactStore.getState().previewVideoResume;
        if (r) {
          useArtifactStore.setState({ previewVideoResume: null });
          const dur = v.duration;
          let t = r.seconds;
          if (Number.isFinite(dur) && dur > 0) {
            t = Math.min(r.seconds, Math.max(0, dur - 0.05));
          }
          try {
            v.currentTime = t;
          } catch {
            /* ignore */
          }
          if (r.autoplay) void v.play();
        }
      }}
    />
  );
}
