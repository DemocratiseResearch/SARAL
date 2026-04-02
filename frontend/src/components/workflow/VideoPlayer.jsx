// src/components/workflow/VideoPlayer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FiMic, FiVideo, FiPlay, FiPause, FiDownload,
  FiSettings, FiVolume2, FiMusic, FiArrowRight, FiExternalLink
} from 'react-icons/fi';
import LoadingSpinner from '../common/LoadingSpinner';
import Analytics from '../../lib/analytics';

const VideoPlayer = ({ src, title, paperId }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // watchedSeconds accumulates total time user spent while video was playing
  const watchedSecondsRef = useRef(0);
  // lastPlayTimestamp is set when playback starts (Date.now / performance.now)
  const lastPlayTimestampRef = useRef(null);
  // lastRecordedTime used to compute seeks (from -> to)
  const lastRecordedTimeRef = useRef(0);
  // avoid double-tracking ended events
  const endedTrackedRef = useRef(false);

  // helper to get a small video_id (prefer server-provided id if available)
  const videoId = paperId || (() => {
    try {
      // derive a short id from src if present
      return src ? `src:${src.slice(-12)}` : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      // track loaded metadata
      Analytics.track('Video Loaded', {
        video_id: videoId,
        paper_id: paperId || null,
        duration_seconds: video.duration || 0,
        src_present: !!src,
      });
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      lastRecordedTimeRef.current = video.currentTime;
    };

    const onPlay = () => {
      // mark start of a playing interval
      lastPlayTimestampRef.current = Date.now();
      setIsPlaying(true);
      Analytics.track('Video Play', {
        video_id: videoId,
        paper_id: paperId || null,
        current_time: Math.round(video.currentTime),
      });
    };

    const onPause = () => {
      // finalize the watching interval
      if (lastPlayTimestampRef.current) {
        const deltaMs = Date.now() - lastPlayTimestampRef.current;
        watchedSecondsRef.current += deltaMs / 1000;
        lastPlayTimestampRef.current = null;
      }
      setIsPlaying(false);

      // send watched metric on pause
      const watched = Math.round(watchedSecondsRef.current);
      const pct = duration > 0 ? (watchedSecondsRef.current / duration) : 0;
      Analytics.track('Video Pause', {
        video_id: videoId,
        paper_id: paperId || null,
        current_time: Math.round(video.currentTime),
        watched_seconds: watched,
        watched_pct: Number(pct.toFixed(3)),
      });
    };

    const onEnded = () => {
      // finalize any remaining watching
      if (lastPlayTimestampRef.current) {
        const deltaMs = Date.now() - lastPlayTimestampRef.current;
        watchedSecondsRef.current += deltaMs / 1000;
        lastPlayTimestampRef.current = null;
      }
      setIsPlaying(false);

      // guard against duplicate ended events
      if (!endedTrackedRef.current) {
        endedTrackedRef.current = true;
        const watched = Math.round(watchedSecondsRef.current);
        const pct = duration > 0 ? (watchedSecondsRef.current / duration) : 0;
        Analytics.track('Video Ended', {
          video_id: videoId,
          paper_id: paperId || null,
          total_watched_seconds: watched,
          watched_pct: Number(pct.toFixed(3)),
        });
      }
    };

    const onSeeking = () => {
      // record from time before seek starts
      const from = video.currentTime;
      Analytics.track('Video Seek Start', {
        video_id: videoId,
        paper_id: paperId || null,
        from: Math.round(from),
      });
    };

    const onSeeked = () => {
      // record to time after seek completes
      const to = video.currentTime;
      Analytics.track('Video Seek End', {
        video_id: videoId,
        paper_id: paperId || null,
        to: Math.round(to),
      });
      // update lastRecordedTimeRef for accuracy
      lastRecordedTimeRef.current = video.currentTime;
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);

    return () => {
      // cleanup listeners
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, paperId, videoId, duration]);

  // Unmount cleanup - send a final watch snapshot if user navigates away without pause/end
  useEffect(() => {
    return () => {
      // finalize any running play interval
      if (lastPlayTimestampRef.current) {
        const deltaMs = Date.now() - lastPlayTimestampRef.current;
        watchedSecondsRef.current += deltaMs / 1000;
        lastPlayTimestampRef.current = null;
      }

      // send a final "Video Unmount" event with watched seconds
      const watched = Math.round(watchedSecondsRef.current);
      const pct = duration > 0 ? (watchedSecondsRef.current / duration) : 0;
      if (watched > 0) {
        Analytics.track('Video Unmount', {
          video_id: videoId,
          paper_id: paperId || null,
          watched_seconds: watched,
          watched_pct: Number(pct.toFixed(3)),
          current_time: Math.round(lastRecordedTimeRef.current || 0),
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, videoId, paperId]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {
        // ignore play errors (autoplay policies)
      });
    } else {
      video.pause();
    }
    // isPlaying will update via event listeners
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const from = video.currentTime;
    const to = pos * duration;

    // finalize any running watch interval up to seek start
    if (lastPlayTimestampRef.current) {
      const deltaMs = Date.now() - lastPlayTimestampRef.current;
      watchedSecondsRef.current += deltaMs / 1000;
      lastPlayTimestampRef.current = Date.now(); // restart timing at seek end once playing resumes
    }

    video.currentTime = to;

    Analytics.track('Video Seek', {
      video_id: videoId,
      paper_id: paperId || null,
      from: Math.round(from),
      to: Math.round(to),
    });

    setCurrentTime(to);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      }
      Analytics.track('Video Fullscreen Enter', { video_id: videoId, paper_id: paperId || null });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      Analytics.track('Video Fullscreen Exit', { video_id: videoId, paper_id: paperId || null });
    }
    setIsFullscreen(!isFullscreen);
  };

  const formatTime = (time) => {
    if (!time || Number.isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="bg-black rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700"
    >
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          playsInline
          preload="metadata"
        />

        {/* Video Controls Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
          {/* Play/Pause Button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="w-16 h-16 bg-neutral-900/40 hover:bg-neutral-900/60 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 border border-white/20"
            >
              {isPlaying ? (
                <FiPause className="w-8 h-8 text-white" />
              ) : (
                <FiPlay className="w-8 h-8 text-white ml-1" />
              )}
            </button>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            {/* Progress Bar */}
            <div className="mb-3">
              <div
                className="w-full h-2 bg-neutral-600/40 rounded-full cursor-pointer hover:bg-neutral-600/60 transition-colors duration-200"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-blue-500 hover:bg-blue-400 rounded-full transition-all duration-200"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Control Bar */}
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-4">
                <button
                  onClick={togglePlay}
                  className="hover:text-blue-400 transition-colors duration-200 p-1 rounded"
                >
                  {isPlaying ? <FiPause className="w-5 h-5" /> : <FiPlay className="w-5 h-5" />}
                </button>
                <div className="flex items-center space-x-2">
                  <FiVolume2 className="w-4 h-4 text-neutral-300" />
                  <span className="text-sm font-medium text-neutral-200">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleFullscreen}
                  className="hover:text-blue-400 transition-colors duration-200 p-1 rounded"
                  title="Toggle fullscreen"
                >
                  <FiExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State Overlay */}
        {!duration && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/20">
            <div className="flex items-center space-x-2 text-white">
              <LoadingSpinner size="sm" />
              <span className="text-sm font-medium">Loading video...</span>
            </div>
          </div>
        )}
      </div>

      {/* Video Info */}
      {title && (
        <div className="px-4 py-3 bg-neutral-100 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
          <h4 className="text-sm font-medium text-neutral-900 dark:text-white truncate">
            {title}
          </h4>
          {paperId && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Paper ID: {paperId}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
