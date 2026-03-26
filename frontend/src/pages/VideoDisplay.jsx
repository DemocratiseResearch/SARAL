import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiDownload, FiYoutube, FiCheck, FiAlertCircle, FiExternalLink, FiPlus } from 'react-icons/fi';
import { apiService } from '../services/api';
import { useWorkflow } from '../contexts/WorkflowContext';
import toast from '../services/toastService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import VideoPlayer from '../components/workflow/VideoPlayer';
import YouTubeLogin from '../pages/YouTubeLogin';
import Analytics from '../lib/analytics';
import Layout from '../components/common/Layout';
import ProcessingStatus from '../components/common/ProcessingStatus';

const VideoDisplay = () => {
  const { paperId, setPaperId } = useWorkflow();
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [showYouTubeUpload, setShowYouTubeUpload] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const breadcrumbs = [{ label: 'Video Generation', href: '/video-display' }];
  const youTubeSectionRef = useRef(null);
  const videoLoadedRef = useRef(false);
  const youTubeViewedRef = useRef(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const fetchVideoUrl = async () => {
      const localPaperId = sessionStorage.getItem('paperId') || paperId;
      if (!localPaperId) {
        setIsLoading(false);
        return;
      }

      try {
        const url = await apiService.getPresentationVideoStreamUrl(localPaperId);
        if (url) {
          setStreamUrl(url);
          toast.success('Video loaded successfully!');
          if (!videoLoadedRef.current) {
            videoLoadedRef.current = true;
            try {
              Analytics.track('Video Generated Successfully', {
                timestamp: new Date().toISOString(),
                paper_id: localPaperId || null,
                stream_url_present: true
              });
            } catch (err) {}
          }
        } else {
          setIsPolling(true);
        }
      } catch (error) {
        console.error('Error fetching video:', error);
        toast.error('Failed to load video');
        setIsPolling(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoUrl();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [paperId]);

  useEffect(() => {
    const raw = sessionStorage.getItem('oneclick_video_action');
    if (!raw) return;
    let action;
    try {
      action = JSON.parse(raw);
    } catch {
      action = null;
    }
    if (!action) return;
    const existingKey = `oneclick_video_started_${action.timestamp || 'na'}`;
    if (sessionStorage.getItem(existingKey)) return;
    sessionStorage.setItem(existingKey, '1');

    const runAction = async () => {
      try {
        setIsLoading(true);
        if (action.type === 'arxiv') {
          const resp = await apiService.scrapeArxivToVideo(action.arxivUrl, action.ttsSource);
          const paper_id = resp?.data?.paper_id;
          if (paper_id) {
            sessionStorage.setItem('paperId', paper_id);
            setPaperId(paper_id);
          }
        } else if (action.type === 'staged_file') {
          const resp = await apiService.convertStagedFileToVideo(action.stagedId, action.ttsSource, { uploadType: action.uploadType });
          const paper_id = resp?.data?.paper_id;
          if (paper_id) {
            sessionStorage.setItem('paperId', paper_id);
            setPaperId(paper_id);
          }
        }
        sessionStorage.removeItem('oneclick_video_action');
        setIsPolling(true);
      } catch (err) {
        console.error('Failed to start one-click job from VideoDisplay', err);
        toast.error('Failed to start video generation. Please try again.');
        sessionStorage.removeItem('oneclick_video_action');
      } finally {
        setIsLoading(false);
      }
    };

    runAction();
  }, [setPaperId]);

  useEffect(() => {
    if (!isPolling) return;
    const localPaperId = sessionStorage.getItem('paperId') || paperId;
    if (!localPaperId) return;
    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      try {
        const url = await apiService.getPresentationVideoStreamUrl(localPaperId);
        if (url) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStreamUrl(url);
          setIsPolling(false);
          toast.success('Video is ready!');
          try {
            Analytics.track('Video Stream Ready', {
              timestamp: new Date().toISOString(),
              paper_id: localPaperId || null
            });
          } catch (err) {}
        }
      } catch (err) {
        console.debug('poll error', err);
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isPolling, paperId]);

  useEffect(() => {
    let mounted = true;
    const localPaperId = sessionStorage.getItem('paperId') || paperId;
    if (localPaperId) {
      try {
        const maybe = apiService.getPresentationMetaInfo(localPaperId);
        if (maybe && typeof maybe.then === "function") {
          maybe
            .then((data) => {
              if (mounted) {
                setMetadata(data.data);
              }
            })
            .catch(() => {
              if (mounted) setMetadata(null);
            });
        } else {
          setMetadata(maybe?.data || null);
        }
      } catch {
        if (mounted) setMetadata(null);
      }
    }
    return () => {
      mounted = false;
    };
  }, [paperId]);

  const handleDownloadVideo = async () => {
    const localPaperId = sessionStorage.getItem('paperId') || paperId;
    if (!localPaperId) return;

    setDownloadLoading(true);
    try {
      const response = await apiService.downloadPresentationVideo(localPaperId);
      const blob = new Blob([response.data], { type: 'video/mp4' });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${(metadata?.title || 'presentation').replace(/\s+/g, '_')}_video.mp4`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Video downloaded successfully!');

      try {
        Analytics.track('Downloaded Video', {
          timestamp: new Date().toISOString(),
          paper_id: localPaperId || null,
          file_name: `${(metadata?.title || 'presentation').replace(/\s+/g, '_')}_video.mp4`
        });
      } catch (err) {}
    } catch (error) {
      console.error('Error downloading video:', error);
      toast.error('Failed to download video');
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleUploadToYouTube = () => {
    try {
      Analytics.track('Upload to YouTube Clicked', {
        timestamp: new Date().toISOString(),
        paper_id: sessionStorage.getItem('paperId') || paperId || null,
        video_stream_url_present: !!streamUrl
      });
    } catch (err) {}

    setShowYouTubeUpload(true);
  };

  useEffect(() => {
    if (!showYouTubeUpload) return;
    const el = youTubeSectionRef.current;

    if (!youTubeViewedRef.current) {
      youTubeViewedRef.current = true;
      try {
        Analytics.track('YouTube Upload Section Viewed', {
          timestamp: new Date().toISOString(),
          paper_id: sessionStorage.getItem('paperId') || paperId || null
        });
      } catch (err) {}
    }

    if (!el) return;
    const t = setTimeout(() => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
        el.classList.add('ring-4', 'ring-yellow-300', 'ring-opacity-60');
        setTimeout(() => el.classList.remove('ring-4', 'ring-yellow-300', 'ring-opacity-60'), 1500);
      } catch (err) {
        window.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
      }
    }, 120);

    return () => clearTimeout(t);
  }, [showYouTubeUpload, paperId]);

  const SocialShare = ({ metadata = {}, streamUrl = null }) => {
    const shareUrl = streamUrl || 'https://saral.democratiseresearch.in';
    const shareTitle = metadata.title || 'My Academic Presentation';
    const shareText = `Check out this presentation I created of our work: "${shareTitle}" using SARAL

Saralify your research: https://saral.democratiseresearch.in

#democratiseResearch`;
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(shareTitle);

    const shareLinks = [
      {
        name: 'LinkedIn',
        icon: FiExternalLink,
        url: `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}&summary=${encodedText}&source=Saral%20AI`,
        className:
          'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
      },
      {
        name: 'Twitter',
        icon: FiExternalLink,
        url: `https://twitter.com/intent/tweet?text=${encodedText}`,
        className: 'text-sky-500 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300'
      },
    ];

    const handleShareClick = (e, link) => {
      e.preventDefault();
      try {
        Analytics.track('Shared Presentation', {
          timestamp: new Date().toISOString(),
          site: link.name,
          paper_id: sessionStorage.getItem('paperId') || paperId || null,
          share_url: shareUrl
        });
      } catch (err) {}

      window.open(link.url, '_blank', 'noopener,noreferrer');
    };

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
        <div className="text-center">
          <h3 className="text-lg font-sans font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Share Your Presentation
          </h3>
          <p className="text-gray-600 dark:text-gray-400 font-sans text-sm mb-4">
            Let others know about your academic presentation
          </p>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {shareLinks.map((link) => (
              <button
                key={link.name}
                onClick={(e) => handleShareClick(e, link)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${link.className} text-sm sm:text-base font-sans font-medium`}
                aria-label={`Share on ${link.name}`}
              >
                <link.icon className="w-4 h-4" />
                {link.name}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading video...</p>
          </motion.div>
        </div>
      </Layout>
    );
  }

  if (!streamUrl && (sessionStorage.getItem('paperId') || paperId)) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 text-center">
            <ProcessingStatus mode="video" pendingAction={null} />
            <div className="mt-4">
              <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors duration-150">
                Go Back
              </button>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  if (!sessionStorage.getItem('paperId') && !paperId) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border border-neutral-200 dark:border-neutral-700 text-center">
            <FiAlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Video Available</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Please generate a video first using the "One click to Video" button.</p>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors duration-150">
              Go Back
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <div className="max-w-4xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Generated Video Presentation</h2>
            {metadata?.title && <p className="text-gray-600 dark:text-gray-400 mt-1">{metadata.title}</p>}
          </div>

          <button
            onClick={() => window.location.href = "/paper-processing"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors duration-150 shrink-0"
          >
            <FiPlus className="w-4 h-4" />
            <span className="whitespace-nowrap">Create New</span>
          </button>

        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
          <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
            <VideoPlayer src={streamUrl} title={metadata?.title || "Generated Presentation"} paperId={sessionStorage.getItem('paperId') || paperId} />
          </div>

          {metadata && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              {metadata.authors && <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium">Authors:</span> {metadata.authors}</p>}
              {metadata.date && <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium">Date:</span> {metadata.date}</p>}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={handleDownloadVideo} disabled={downloadLoading} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150 disabled:cursor-not-allowed">
              {downloadLoading ? (<><LoadingSpinner size="sm" /> Downloading...</>) : (<><FiDownload className="w-5 h-5" /> Download Video</>)}
            </button>

            <button onClick={handleUploadToYouTube} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors duration-150">
              <FiYoutube className="w-5 h-5" /> Upload to YouTube
            </button>
          </div>
        </motion.div>

        {showYouTubeUpload && (
          <motion.div ref={youTubeSectionRef} tabIndex={-1} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <FiYoutube className="w-6 h-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload to YouTube</h3>
            </div>

            <YouTubeLogin />

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <div className="flex gap-3">
                <FiCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Ready to upload</p>
                  <p>Your video presentation is ready to be uploaded to YouTube. Connect your account above to continue.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <SocialShare metadata={metadata || {}} streamUrl={streamUrl} />
      </div>
    </Layout>
  );
};

export default VideoDisplay;