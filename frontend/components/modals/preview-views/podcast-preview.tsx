"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/artifact-store";
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

function PodcastVideoPlayer({
  src,
  playbackRate,
  onRateChange,
}: {
  src: string;
  playbackRate: number;
  onRateChange: (r: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const requestFullscreen = useCallback(() => {
    videoRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div className="relative h-full min-h-0 w-full">
      <video
        ref={videoRef}
        src={src}
        playsInline
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full object-contain cursor-pointer"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 shadow-xl ring-1 ring-black/10 hover:scale-105 transition-transform max-sm:h-16 max-sm:w-16">
            <Play size={32} className="ml-1 text-ink" fill="currentColor" />
          </span>
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent pt-20 max-sm:pt-10">
        <div className="pointer-events-auto flex items-center gap-2 px-3 pb-3 max-sm:gap-1.5 max-sm:px-2 max-sm:pb-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full border-0 bg-white text-ink shadow-md hover:bg-white/90"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={16} className="text-ink" fill="currentColor" />
            ) : (
              <Play size={16} className="ml-0.5 text-ink" fill="currentColor" />
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
            value={Number.isFinite(currentTime) ? Math.min(currentTime, duration || 0) : 0}
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              const t = Number(e.target.value);
              v.currentTime = t;
              setCurrentTime(t);
            }}
          />
          <span className="shrink-0 font-mono text-[10px] text-white/90 tabular-nums min-[400px]:text-[11px]">
            {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            className="shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <SpeedControl rate={playbackRate} onChange={onRateChange} />
          {/* Redundant on phones — the modal header already has a fullscreen
              control, and the row is too tight for it on narrow screens. */}
          <button
            type="button"
            onClick={requestFullscreen}
            className="shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors max-sm:hidden"
            aria-label="Fullscreen"
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PodcastAudioPlayer({
  src,
  playbackRate,
  onRateChange,
}: {
  src: string;
  playbackRate: number;
  onRateChange: (r: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 text-center px-8 w-full max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
        <Headphones size={32} className="text-white/60" />
      </div>
      <p className="font-sans text-[15px] font-semibold text-white">Podcast Audio</p>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <div className="w-full bg-white/[0.08] rounded-xl px-3 py-2.5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md hover:bg-white/90 transition-colors"
        >
          {playing ? (
            <Pause size={14} className="text-ink" fill="currentColor" />
          ) : (
            <Play size={14} className="ml-0.5 text-ink" fill="currentColor" />
          )}
        </button>
        <span className="shrink-0 font-mono text-[11px] text-white/70 tabular-nums">
          {formatMediaTime(currentTime)}
        </span>
        <input
          type="range"
          aria-label="Seek"
          className="h-1.5 flex-1 cursor-pointer accent-white disabled:opacity-40"
          disabled={!Number.isFinite(duration) || duration <= 0}
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step="any"
          value={Number.isFinite(currentTime) ? Math.min(currentTime, duration || 0) : 0}
          onChange={(e) => {
            const a = audioRef.current;
            if (!a) return;
            const t = Number(e.target.value);
            a.currentTime = t;
            setCurrentTime(t);
          }}
        />
        <span className="shrink-0 font-mono text-[11px] text-white/70 tabular-nums">
          {formatMediaTime(duration)}
        </span>
        <SpeedControl rate={playbackRate} onChange={onRateChange} />
      </div>
    </div>
  );
}

interface PodcastPreviewProps {
  artifact: Artifact;
}

export function PodcastPreview({ artifact }: PodcastPreviewProps) {
  const [playbackRate, setPlaybackRate] = useState(1);

  if (artifact.podcastVideoUrl) {
    return (
      <PodcastVideoPlayer
        src={artifact.podcastVideoUrl}
        playbackRate={playbackRate}
        onRateChange={setPlaybackRate}
      />
    );
  }

  if (artifact.downloadUrl) {
    return (
      <PodcastAudioPlayer
        src={artifact.downloadUrl}
        playbackRate={playbackRate}
        onRateChange={setPlaybackRate}
      />
    );
  }

  return (
    <p className="font-sans text-[14px] text-ink-faint">
      Podcast preview not available
    </p>
  );
}
