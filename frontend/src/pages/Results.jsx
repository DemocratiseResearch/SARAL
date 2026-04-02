import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiDownload,
  FiVideo,
  FiFileText,
  FiMic,
  FiRefreshCw,
  FiCheckCircle,
  FiHome,
  FiExternalLink,
  FiEye,
  FiCopy,
  FiCheck,
  FiLinkedin,
  FiX,
  FiPlus,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import { downloadBlob } from "../utils/helpers";
import VideoPlayer from "../components/workflow/VideoPlayer";
import YouTubeLogin from "./YouTubeLogin";
import toast from '../services/toastService';
import Analytics from "../lib/analytics";

// LinkedIn Caption Box Component
const LinkedInCaptionBox = ({ caption, paperId, onXClick}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const captionRef = useRef(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Caption copied to clipboard!");
      
      try {
        Analytics.track('Copied LinkedIn Caption', {
          timestamp: new Date().toISOString(),
          paper_id: paperId
        });
      } catch (e) {}
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy caption");
    }
  };

  useEffect(() => {
    if (isOpen && captionRef.current) {
      setTimeout(() => {
        captionRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest' 
        });
      }, 100);
    }
  }, [isOpen]);

  // Track when caption box is opened
  useEffect(() => {
    if (isOpen) {
      try {
        Analytics.track('Opened LinkedIn Caption Box', {
          timestamp: new Date().toISOString(),
          paper_id: paperId
        });
      } catch (e) {}
    }
  }, [isOpen, paperId]);
 {/* Main Toggle Button */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
      Your Social Media Draft:
      </h3>
  if (!caption) return null;

  return (
    <div className="relative">
      {/* Toggle Button */}
      {/* <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-150 shadow-sm"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <FiLinkedin className="w-4 h-4" />
        <span className="text-sm whitespace-nowrap">Your Draft LinkedIn Post</span>
        {isOpen ? (
          <FiX className="w-4 h-4 ml-1" />
        ) : (
          <FiExternalLink className="w-4 h-4 ml-1" />
        )}
      </motion.button> */}
       {/* Social Media Draft Header */}
      <div className="flex items-center justify-between gap-3">
  
      {/* Main Toggle Button */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
      Your Social Media Draft:
      </h3>

      {/* Separate Small Buttons */}
      <div className="flex items-center gap-2">
    
      <button
      type="button"
      onClick={() => setIsOpen(prev => !prev)}
      className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-150 shadow-sm"
      >
      <FiLinkedin className="w-4 h-4" />
      </button>

      {/* X Button */}
      <button
        type="button"
        onClick={() => {
      setIsOpen(false);
        if (onXClick) onXClick();
    }}
        className="p-2 rounded-lg bg-black hover:bg-gray-900 text-white transition-colors duration-150 shadow-sm"
      >
    <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="w-4 h-4 fill-current"
    >
      <path d="M18.244 2H21.5l-7.65 8.74L22 22h-6.828l-5.348-6.99L3.95 22H.69l8.18-9.35L1 2h6.93l4.83 6.4L18.244 2Zm-2.397 18h1.89L6.192 4H4.2l11.647 16Z"/>
    </svg>
    </button>

      </div>
    </div>

      {/* Caption Box */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={captionRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] z-50"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <FiLinkedin className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    LinkedIn Post Draft
                  </h4>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Caption Content */}
              <div className="p-4 max-h-80 overflow-y-auto">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {caption}
                </p>
              </div>

              {/* Footer with Copy Button */}
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ready to share on LinkedIn
                </p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium transition-all duration-150"
                >
                  {copied ? (
                    <>
                      <FiCheck className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <FiCopy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Info component
const Info = ({ label, value }) => (
  <div className="mb-4 sm:mb-0">
    <label className="text-sm font-sans font-medium text-gray-600 dark:text-gray-400 block mb-1">
      {label}
    </label>
    <p className="text-gray-900 dark:text-gray-100 font-sans break-words text-sm sm:text-base">
      {value}
    </p>
  </div>
);

// Download card
const DownloadCard = ({
  icon: Icon,
  title,
  description,
  onDownload,
  onPreview,
  disabled,
  isLoading = false,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
  >
    <div className="flex items-start space-x-3 sm:space-x-4">
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-300" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base sm:text-lg font-sans font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 font-sans text-sm">
          {description}
        </p>
        <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
          <button
            onClick={async () => {
              if (onDownload) await onDownload();
            }}
            disabled={disabled || isLoading}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base"
          >
            {isLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <FiDownload className="w-4 h-4" />
            )}
            Download
          </button>
          {onPreview && (
            <button
              onClick={() => {
                onPreview();
              }}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base"
            >
              <FiEye className="w-4 h-4" />
              Preview
            </button>
          )}
        </div>
      </div>
    </div>
  </motion.div>
);

// Social share block
const SocialShare = ({ paperId, title }) => {
  const shareUrl = "http://localhost:3000";
  const shareTitle = title || "My Academic Presentation";
  const shareText = `Check out this presentation I created: "${shareTitle}" using SARAL`;

  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  const shareLinks = [
    {
      name: "LinkedIn",
      icon: FiExternalLink,
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      className:
        "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300",
    },
    {
      name: "Twitter",
      icon: FiExternalLink,
      url: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      className:
        "text-sky-500 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300",
    },
  ];

  const handleShare = (link) => {
    try {
      Analytics.track("Shared Presentation", {
        timestamp: new Date().toISOString(),
        paper_id: paperId || null,
        platform: link.name,
      });
    } catch (e) {}
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

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
            <button
              key={link.name}
              onClick={() => handleShare(link)}
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

const Results = () => {
  const {
    setPaperId,
    paperId,
    metadata,
    videoPath,
    audioFiles,
    slides,
    resetWorkflow,
    markStepCompleted,
    completedSteps,
    caption
  } = useWorkflow();
  const [loading, setLoading] = useState({});
  const [linkedInCaption, setLinkedInCaption] = useState(null);
  const navigate = useNavigate();
  const [paperTitle, setPaperTitle] = useState(null);
  const [socialPanel, setSocialPanel] = useState(null);

  // ================= Twitter Thread State =================
  const [twitterThread, setTwitterThread] = useState([]);
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [threadImages, setThreadImages] = useState([]);
  const [threadsGenerated, setThreadsGenerated] = useState(false);
  const [showThreadImages, setShowThreadImages] = useState(false);
  const [showTwitterPanel, setShowTwitterPanel] = useState(false);
  const [copiedTweetIndex, setCopiedTweetIndex] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

const handleCopyEntireThread = async () => {
  if (!twitterThread.length) return;

  const fullThread = twitterThread.join("\n\n");

  await navigator.clipboard.writeText(fullThread);
  setCopiedAll(true);

  setTimeout(() => setCopiedAll(false), 2000);
};

  // Persist paperId
  useEffect(() => {
    if (paperId) sessionStorage.setItem("paperId", paperId);
  }, [paperId]);

  const withLoad = async (key, fn, analyticsName) => {
    setLoading((p) => ({ ...p, [key]: true }));
    try {
      await fn();
      toast.success("Download completed successfully!");
      try {
        Analytics.track(`Downloaded ${analyticsName}`, {
          timestamp: new Date().toISOString(),
          paper_id: paperId || null,
        });
      } catch (e) {}
    } catch (error) {
      toast.error("Download failed. Please try again.");
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const dlVideo = () =>
    withLoad(
      "video",
      async () => {
        const { data } = await apiService.downloadVideo(paperId);
        downloadBlob(data, `presentation_${paperId}.mp4`);
      },
      "Video"
    );

  const dlSlides = () =>
    withLoad(
      "slides",
      async () => {
        const { data } = await apiService.downloadSlides(paperId);
        downloadBlob(data, `slides_${paperId}.pdf`);
      },
      "Slides PDF"
    );

  const dlAudio = (f) =>
    withLoad(
      `aud_${f}`,
      async () => {
        const { data } = await apiService.downloadAudio(paperId, f);
        downloadBlob(data, f);
      },
      "Audio File"
    );
  const generateTwitterThread = async () => {
  if (!paperId) {
    toast.error("Paper ID not found");
    return;
  }

  setTwitterLoading(true);
  setShowThreadImages(false);

  try {
    const res = await apiService.generateTwitterThread(paperId);

    console.log("THREAD DATA:", res.data.thread); // debug

    setTwitterThread(res.data.thread || []);
    setThreadsGenerated(true);

    toast.success("Twitter thread generated");

  } catch (err) {
    toast.error("Failed to generate Twitter thread");
  } finally {
    setTwitterLoading(false);
  }
};

const loadThreadImages = async () => {
  if (!paperId) {
    toast.error("Paper ID not found");
    return;
  }

  try {
    const res = await apiService.listThreadImages(paperId);

    setThreadImages(res.data.images || []);
    setShowThreadImages(true);

  } catch (err) {
    toast.error("Failed to load thread images");
  }
};

// ================= Download All Images =================
const downloadAllThreadImages = async () => {
  if (!paperId) {
    toast.error("Paper ID not found");
    return;
  }

  try {
    const { data } = await apiService.downloadThreadImagesZip(paperId);
    const url = window.URL.createObjectURL(data);

    const a = document.createElement("a");
    a.href = url;
    a.download = `twitter_thread_images_${paperId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    toast.success("All images downloaded successfully");
  } catch (err) {
    toast.error("Failed to download images");
  }
};

// ================= Download Single Image =================
const downloadSingleImage = (filename) => {
  if (!paperId) {
    toast.error("Paper ID not found");
    return;
  }

  const url = apiService.getThreadImageUrl(paperId, filename);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast.success("Downloading image...");
};

  useEffect(() => {
    if (!completedSteps.includes(6)) {
      markStepCompleted(6);
    }
  }, [markStepCompleted, completedSteps]);

  // Fetch metadata including LinkedIn caption
useEffect(() => {
  let mounted = true;
  if (paperId) {
    apiService.getPresentationMetaInfo(paperId)
      .then((res) => {
        console.log("📦 meta info response:", res?.data);
        console.log("📝 caption from meta:", res?.data?.caption);

        if (mounted) {
          setPaperTitle(res?.data?.title || null);
          setLinkedInCaption(res?.data?.caption || null);
        }
      })
      .catch((err) => {
        console.error("❌ meta fetch failed", err);
      });
  }
  return () => (mounted = false);
}, [paperId]);


  useEffect(() => {
    setPaperId(paperId);
  }, [paperId, setPaperId]);

  // Track page view
  useEffect(() => {
    if (!paperId) return;
    try {
      Analytics.track("Video Created Successfully", {
        timestamp: new Date().toISOString(),
        paper_id: paperId,
        has_audio: !!(audioFiles && audioFiles.length > 0),
        has_video: !!videoPath,
        has_slides: !!(slides && slides.length > 0),
        has_linkedin_caption: !!linkedInCaption,
      });
    } catch (e) {}
  }, [paperId, audioFiles, videoPath, slides, linkedInCaption]);

  if (!paperId) {
    const breadcrumbs = [{ label: "Results", href: "/results" }];
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="text-center py-8 sm:py-12 px-4">
          <FiCheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-sans font-semibold text-gray-900 dark:text-white mb-2">
            No Results Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400 font-sans mb-6 text-sm sm:text-base">
            Complete the workflow to see your results here.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gray-900 hover:bg-gray-800 text-white font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base"
          >
            <FiHome className="w-4 h-4 sm:w-5 sm:h-5" />
            Go to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const breadcrumbs = [{ label: "Results", href: "/results" }];

  const handleStartNewPaper = () => {
    try {
      Analytics.track("Start New Paper", {
        timestamp: new Date().toISOString(),
        paper_id: paperId || null,
      });
    } catch (e) {}
    resetWorkflow();
  };

  const handleBackToDashboard = () => {
    try {
      Analytics.track("Back to Dashboard", {
        timestamp: new Date().toISOString(),
        paper_id: paperId || null,
      });
    } catch (e) {}
  };

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <div className="max-w-5xl mx-auto space-y-6 px-4 sm:px-6 lg:px-0">
        {/* Header Section - VideoDisplay Style */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2"
        >
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              Generated Video Presentation
            </h2>
            {metadata?.title && (
              <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
                {metadata.title}
              </p>
            )}
          </div>

          <button
            onClick={() => navigate("/paper-processing")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors duration-150 shrink-0"
          >
            <FiPlus className="w-4 h-4" />
            <span className="whitespace-nowrap">Create New</span>
          </button>
        </motion.div>

        {/* Video Player Section with LinkedIn Caption */}
        {videoPath && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
          >
            {/* Video Container */}
            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden mb-4">
              <VideoPlayer
                src={apiService.getVideoStreamUrl(paperId)}
                title={metadata?.title || "Generated Presentation"}
                paperId={paperId}
              />
            </div>

            {/* Metadata and LinkedIn Caption Row */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              {/* Metadata */}
              {metadata && (
                <div className="space-y-1 flex-1">
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

              
            </div>
          </motion.div>
        )}

        {/* YouTube Upload Section */}
        <div className="mt-2">
          <YouTubeLogin />
        </div>

      {/* Social Media Draft */}
<div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm">

  {/* Header */}
  <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">

    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
      Social Media Draft
    </h3>

    <div className="flex gap-2">

      {/* LinkedIn Button */}
      <button
        onClick={() => setSocialPanel("linkedin")}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
      >
        <FiLinkedin className="w-4 h-4" />
        Your LinkedIn Draft
      </button>

      {/* Twitter Button */}
      <button
        onClick={() => setSocialPanel("twitter")}
         className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
      >
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 fill-current text-black dark:text-white"
      >
    <path d="M18.244 2H21.5l-7.65 8.74L22 22h-6.828l-5.348-6.99L3.95 22H.69l8.18-9.35L1 2h6.93l4.83 6.4L18.244 2Zm-2.397 18h1.89L6.192 4H4.2l11.647 16Z"/>
     </svg>

     Your Twitter Thread
    </button>

    </div>
  </div>

  {/* LinkedIn Panel */}
  {socialPanel === "linkedin" && (
    <div className="p-4 border-t">

      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          LinkedIn Post Draft
        </h4>

        <button
  onClick={async () => {
    await navigator.clipboard.writeText(caption);
    toast.success("LinkedIn caption copied!");
  }}
  className="flex items-center gap-1 px-2 py-1 rounded-md text-sm 
  bg-gray-100 dark:bg-gray-700 
  text-gray-700 dark:text-gray-200 
  hover:bg-gray-200 dark:hover:bg-gray-600 transition"
>
  <FiCopy className="w-4 h-4" />
  Copy
</button>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {caption}
      </p>

    </div>
  )}

  {/* Twitter Panel */}
  {socialPanel === "twitter" && (
    <div className="border-t">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black">
        <h4 className="text-white text-sm font-semibold">
          Twitter / X Thread
        </h4>

        <button onClick={() => setSocialPanel(null)}>
          <FiX className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="p-4 max-h-[400px] overflow-y-auto">

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={() => {
          if (threadsGenerated) {
            setShowThreadImages(false);
            } else {
              generateTwitterThread();
      }
    }}
    disabled={twitterLoading}
    className="px-3 py-1.5 bg-black hover:bg-gray-900 text-white rounded-md text-sm font-medium transition"
  >
    {twitterLoading
      ? "Generating..."
      : threadsGenerated
      ? "View Threads"
      : "Generate Threads"}
  </button>

          <button
            onClick={loadThreadImages}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-md text-sm"
          >
            View Images
          </button>

          <button
            onClick={downloadAllThreadImages}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm"
          >
            Download All
          </button>
        </div>

        {/* Tweets */}
        {!showThreadImages && twitterThread.length > 0 && (
          <div className="space-y-3">
            {twitterThread.map((tweet, index) => (
              <div
                key={index}
                className="relative p-3 bg-gray-50 dark:bg-gray-900 rounded-md text-sm"
              >
                <p className="pr-8 whitespace-pre-wrap">{tweet}</p>

                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(tweet);
                    setCopiedTweetIndex(index);
                    setTimeout(() => setCopiedTweetIndex(null), 2000);
                  }}
                  className="absolute top-2 right-2 text-gray-500"
                >
                  {copiedTweetIndex === index ? (
                    <FiCheck className="w-4 h-4 text-green-600" />
                  ) : (
                    <FiCopy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Thread Images */}
        {showThreadImages && threadImages.length > 0 && (
          <div className="mt-4 space-y-3">
            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Thread Images
            </h5>

            {threadImages.map((img, index) => (
              <div
                key={index}
                className="border rounded-md p-2 bg-gray-50 dark:bg-gray-900"
              >
                <img
                  src={apiService.getThreadImageUrl(paperId, img)}
                  alt={`thread-${index}`}
                  className="w-full rounded-md mb-2"
                />

                <button
                  onClick={() => downloadSingleImage(img)}
                  className="text-sm px-3 py-1 bg-gray-900 text-white rounded-md"
                >
                  Download Image
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )}

</div>

        {/* Downloads */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 sm:space-y-6"
        >
          <h2 className="text-xl sm:text-2xl font-sans font-semibold text-gray-900 dark:text-white">
            Download Your Files
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <DownloadCard
              icon={FiVideo}
              title="Final Video"
              description="Presentation video with narration and slides"
              onDownload={dlVideo}
              onPreview={() => {
                document
                  .querySelector("video")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              disabled={!videoPath}
              isLoading={loading.video}
            />

            <DownloadCard
              icon={FiFileText}
              title="PDF Slides"
              description="Presentation slides in PDF format"
              onDownload={dlSlides}
              onPreview={() => {
                navigate("/slide-creation");
              }}
              disabled={!slides?.length}
              isLoading={loading.slides}
            />
          </div>
        </motion.div>

        {/* Audio Files */}
        {audioFiles?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
          >
            <h3 className="text-lg font-sans font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Individual Audio Files
            </h3>
            <div className="space-y-3">
              {audioFiles.map((f, i) => (
                <div
                  key={f}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50 dark:border-b dark:bg-neutral-800 rounded-md gap-3 sm:gap-4"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 dark:bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      <FiMic className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-sans font-medium text-gray-900 dark:text-gray-100 truncate text-sm sm:text-base">
                        {f}
                      </p>
                      <p className="text-xs sm:text-sm font-sans text-gray-600 dark:text-gray-400">
                        Section {i + 1}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await dlAudio(f);
                    }}
                    disabled={loading[`aud_${f}`]}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base w-full sm:w-auto"
                  >
                    {loading[`aud_${f}`] ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <FiDownload className="w-4 h-4" />
                    )}
                    Download
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        
        
        <SocialShare paperId={paperId} title={metadata?.title} />

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pb-6 sm:pb-8"
        >
          <button
            onClick={handleStartNewPaper}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gray-900 hover:bg-gray-800 text-white font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base"
          >
            <FiRefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
            Start New Paper
          </button>

          <Link
            to="/"
            onClick={handleBackToDashboard}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 font-sans font-medium rounded-md transition-colors duration-150 text-sm sm:text-base"
          >
            <FiHome className="w-4 h-4 sm:w-5 sm:h-5" />
            Back to Dashboard
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
};

export default Results;