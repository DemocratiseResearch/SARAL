import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDownload, FiYoutube, FiArrowLeft, FiCheck, FiAlertCircle, FiExternalLink } from 'react-icons/fi';
import { apiService } from '../services/api';
import { useWorkflow } from '../contexts/WorkflowContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import VideoPlayer from '../components/workflow/VideoPlayer';
import YouTubeLogin from '../pages/YouTubeLogin';
import Layout from '../components/common/Layout'; // Import the Layout component

const VideoDisplay = () => {
  const { paperId } = useWorkflow();
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState(null)
  const [paperTitle, setPaperTitle] = useState()
  const [isLoading, setIsLoading] = useState(true);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [showYouTubeUpload, setShowYouTubeUpload] = useState(false);
  console.log("paperId", paperId)
  console.log("metadata", metadata)
  useEffect(() => {
    const fetchVideoUrl = async () => {
      if (!paperId) {
        setIsLoading(false);
        return;
      }

      try {
        const url = await apiService.getPresentationVideoStreamUrl(paperId);
        if (url) {
          setStreamUrl(url);
          toast.success('Video loaded successfully!');
        } else {
          toast.error('Video not found. Please generate the video first.');
        }
      } catch (error) {
        console.error('Error fetching video:', error);
        toast.error('Failed to load video');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoUrl();
  }, [paperId]);


  useEffect(() => {
      let mounted = true;

      if (paperId) {
        try {
          const maybe = apiService.getPresentationMetaInfo(paperId);
          if (maybe && typeof maybe.then === "function") {
            maybe
              .then((data) => {
                if (mounted) {
                  console.log("data from maeta info", data)
                  console.log("title", data?.title)
                  setMetadata(data.data)
                  setPaperTitle(data?.title || null);   // ✅ uses "title" from API response
                }
              })
              .catch(() => {
                if (mounted) setPaperTitle(null);
              });
          } else {
            setPaperTitle(maybe?.title || null);  // ✅ safe for sync return too
          }
        } catch {
          if (mounted) setPaperTitle(null);
        }
      }

      return () => {
        mounted = false; // cleanup
      };
    }, [paperId]);


  const handleDownloadVideo = async () => {
    if (!paperId) return;

    setDownloadLoading(true);
    try {
      const response = await apiService.downloadPresentationVideo(paperId);
      const blob = new Blob([response.data], { type: 'video/mp4' });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${metadata?.title || 'presentation'}_video.mp4`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Video downloaded successfully!');
    } catch (error) {
      console.error('Error downloading video:', error);
      toast.error('Failed to download video');
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleUploadToYouTube = () => {
    setShowYouTubeUpload(true);
  };

  const SocialShare = ({ metadata = {}, streamUrl = null }) => {
    console.log("metadata in share", metadata)
    console.log("streamUrl", streamUrl)
    console.log("title", metadata.title)
    const shareUrl = streamUrl || 'https://saral.democratiseresearch.in';
    const shareTitle = metadata.title || 'My Academic Presentation';
    // const shareText = `Check out this presentation I created of my work: "${shareTitle}" using SARAL "${streamUrl} Saralify your research: https://saral.democratiseresearch.in #democratiseResearch`;


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

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
      >
        <div className="text-center">
          <h3 className="text-lg font-sans font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Share Your Presentation
          </h3>
          <p className="text-gray-600 dark:text-gray-400 font-sans text-sm mb-4">
            Let others know about your academic presentation
          </p>

          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {shareLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 ${link.className} text-sm sm:text-base font-sans font-medium`}
                aria-label={`Share on ${link.name}`}
              >
                <link.icon className="w-4 h-4" />
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  const breadcrumbs = [
    { label: "Video", href: "/video-display" },
  ];

  if (isLoading) {
    return (
        <Layout title="Generated Video" breadcrumbs={breadcrumbs}>
            <div className="max-w-5xl mx-auto space-y-8">
                <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-neutral-800 rounded-xl p-12
                            border border-neutral-200 dark:border-neutral-700
                            flex flex-col items-center justify-center"
                >
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-gray-600 dark:text-gray-400">Loading video...</p>
                </motion.div>
            </div>
      </Layout>
    );
  }

  if (!paperId || !streamUrl) {
    return (
        <Layout title="Generated Video" breadcrumbs={breadcrumbs}>
            <div className="max-w-5xl mx-auto space-y-8">
                <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-neutral-800 rounded-xl p-12
                            border border-neutral-200 dark:border-neutral-700
                            text-center"
                >
                <FiAlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No Video Available
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Please generate a video first using the "One click to Video" button.
                </p>
                <button
                    onClick={() => window.history.back()}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-md
                                bg-gray-900 hover:bg-gray-800 text-white font-medium
                                transition-colors duration-150"
                >
                    <FiArrowLeft className="w-4 h-4" />
                    Go Back
                </button>
                </motion.div>
            </div>
      </Layout>
    );
  }

  return (
    <Layout title="Generated Video" breadcrumbs={breadcrumbs}>
        <div className="max-w-5xl mx-auto space-y-8">
        {/* Header is now handled by Layout, this section can be removed or simplified */}

        {/* Video Player Card */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-6
                    border border-neutral-200 dark:border-neutral-700 space-y-6"
        >
            {/* Video Player */}
            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
            <VideoPlayer
                src={streamUrl}
                title={metadata?.title || "Generated Presentation"}
                paperId={paperId}
            />
            </div>

            {/* Video Info */}
            {metadata && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                {metadata.authors && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Authors:</span> {metadata.authors}
                </p>
                )}
                {metadata.date && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Date:</span> {metadata.date}
                </p>
                )}
            </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
                onClick={handleDownloadVideo}
                disabled={downloadLoading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                        rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400
                        text-white font-medium transition-colors duration-150
                        disabled:cursor-not-allowed"
            >
                {downloadLoading ? (
                <>
                    <LoadingSpinner size="sm" />
                    Downloading...
                </>
                ) : (
                <>
                    <FiDownload className="w-5 h-5" />
                    Download Video
                </>
                )}
            </button>

            <button
                onClick={handleUploadToYouTube}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                        rounded-md bg-red-600 hover:bg-red-500 text-white
                        font-medium transition-colors duration-150"
            >
                <FiYoutube className="w-5 h-5" />
                Upload to YouTube
            </button>
            </div>
        </motion.div>

        {/* YouTube Upload Section */}
        {showYouTubeUpload && (
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-6
                        border border-neutral-200 dark:border-neutral-700 space-y-4"
            >
            <div className="flex items-center gap-3 mb-4">
                <FiYoutube className="w-6 h-6 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Upload to YouTube
                </h3>
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


        {/* Info Card */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4
                    border border-gray-200 dark:border-gray-700"
        >
            <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">Tip:</span>{' '}
            You can download the video for offline viewing or upload it directly to YouTube.
            The video includes automatic narration based on your paper content.
            </p>
        </motion.div>
        </div>
    </Layout>
  );
};

export default VideoDisplay;
