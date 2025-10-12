import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiPlay,
  FiPause,
  FiVolume2,
  FiDownload,
  FiShare2,
  FiClock,
  FiFileText,
  FiHeadphones,
  FiSkipBack,
  FiSkipForward,
  FiGlobe
} from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';
import Layout from '../common/Layout';

const PodcastListener = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const audioRef = useRef(null);
  
  // Get podcast data from navigation state
  const podcastData = location.state?.podcastData;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!podcastData) {
      toast.error('No podcast data available');
      navigate('/');
      return;
    }

    // Initialize audio
    if (audioRef.current && (podcastData.audio_filename || podcastData.combined_audio_path)) {
      const audioFileName = podcastData.audio_filename || podcastData.combined_audio_path.split('/').pop();
      const audioUrl = apiService.streamPodcastAudio(audioFileName);
      audioRef.current.src = audioUrl;
    }
  }, [podcastData, navigate]);

  const handleLoadedData = () => {
    setIsLoading(false);
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e) => {
    const progressBar = e.currentTarget;
    const clickX = e.nativeEvent.offsetX;
    const width = progressBar.offsetWidth;
    const newTime = (clickX / width) * duration;
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handlePlaybackRateChange = (rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const skipTime = (seconds) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (podcastData?.audio_filename || podcastData?.combined_audio_path) {
      const audioFileName = podcastData.audio_filename || podcastData.combined_audio_path.split('/').pop();
      const downloadUrl = apiService.downloadPodcastAudio(audioFileName);
      window.open(downloadUrl, '_blank');
    }
  };

  const handleShare = async () => {
    if (navigator.share && podcastData) {
      try {
        await navigator.share({
          title: `Podcast: ${podcastData.uploaded_file}`,
          text: 'Check out this AI-generated research paper podcast!',
          url: window.location.href,
        });
      } catch (error) {
        // Fallback to clipboard
        navigator.clipboard.writeText(window.location.href);
        toast.success('Link copied to clipboard!');
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  if (!podcastData) {
    return (
      <Layout 
        title="Podcast Listener" 
        breadcrumbs={[{ label: 'Podcast Listener', href: '/podcast-listener' }]}
      >
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-neutral-700 rounded-full mb-4">
              <FiHeadphones className="w-8 h-8 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Podcast Data
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please generate a podcast first from the Paper Processing page.
            </p>
            <button
              onClick={() => navigate('/paper-processing')}
              className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors font-medium"
            >
              Go to Paper Processing
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const breadcrumbs = [
    { label: 'Paper Processing', href: '/paper-processing' },
    { label: 'Podcast Listener', href: '/podcast-listener' }
  ];

  return (
    <Layout 
      title="Podcast Listener" 
      breadcrumbs={breadcrumbs}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 text-black dark:text-white mb-4">
            <FiHeadphones className="w-8 h-8" />
            <h2 className="text-2xl font-bold">AI-Generated Research Podcast</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Listen to an engaging discussion about your research paper
          </p>
        </motion.div>

        {/* Main Player Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-lg overflow-hidden"
        >
          {/* Podcast Info */}
          <div className="bg-black text-white p-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">
                  {podcastData.uploaded_file?.replace('.pdf', '') || 'Research Paper Podcast'}
                </h2>
                <div className="flex items-center gap-4 text-gray-300">
                  <div className="flex items-center gap-1">
                    <FiFileText className="w-4 h-4" />
                    <span className="text-sm">
                      {podcastData.total_audio_segments} segments
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FiClock className="w-4 h-4" />
                    <span className="text-sm">
                      {formatTime(duration)}
                    </span>
                  </div>
                  {podcastData.language && (
                    <div className="flex items-center gap-1">
                      <FiGlobe className="w-4 h-4" />
                      <span className="text-sm capitalize">
                        {podcastData.language}
                      </span>
                    </div>
                  )}
                  {podcastData.audio_info?.file_size_mb && (
                    <span className="text-sm">
                      {podcastData.audio_info.file_size_mb} MB
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleShare}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="Share"
                >
                  <FiShare2 className="w-5 h-5" />
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="Download"
                >
                  <FiDownload className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Audio Player */}
          <div className="p-8">
            <audio
              ref={audioRef}
              onLoadedData={handleLoadedData}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Progress Bar */}
            <div className="mb-6">
              <div
                className="w-full h-2 bg-gray-200 dark:bg-neutral-700 rounded-full cursor-pointer border border-blue-200 dark:border-blue-700"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-150"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={() => skipTime(-10)}
                className="p-3 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                title="Rewind 10s"
              >
                <FiSkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="p-4 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 shadow-lg disabled:opacity-50 border-2 border-blue-500"
              >
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <FiPause className="w-8 h-8" />
                ) : (
                  <FiPlay className="w-8 h-8 ml-1" />
                )}
              </button>

              <button
                onClick={() => skipTime(10)}
                className="p-3 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                title="Forward 10s"
              >
                <FiSkipForward className="w-6 h-6" />
              </button>
            </div>

            {/* Secondary Controls */}
            <div className="flex items-center justify-between">
              {/* Volume Control */}
              <div className="flex items-center gap-3">
                <FiVolume2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 accent-blue-500"
                />
              </div>

              {/* Playback Speed */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Speed:</span>
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={`px-2 py-1 text-xs rounded transition-colors font-medium border ${
                      playbackRate === rate
                        ? 'bg-black text-white border-blue-500'
                        : 'bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-neutral-600 border-blue-300 dark:border-blue-600'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dialogue Analysis */}
        {podcastData.analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-lg p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Podcast Analysis
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              {Object.entries(podcastData.analysis.statistics || {}).map(([speaker, stats]) => (
                <div key={speaker} className="p-4 bg-gray-50 dark:bg-neutral-700 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                    {speaker}
                  </h4>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p>Speaking turns: {stats.turns}</p>
                    <p>Total words: {stats.total_words}</p>
                    <p>Avg words per turn: {Math.round(stats.avg_words_per_turn)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <button
            onClick={() => navigate('/paper-processing')}
            className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors font-medium border border-blue-500"
          >
            Generate Another Podcast
          </button>
        </motion.div>
      </div>
    </Layout>
  );
};

export default PodcastListener;
