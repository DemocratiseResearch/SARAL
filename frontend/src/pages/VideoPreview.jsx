// VideoPreview.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from "react-router-dom";
import { motion } from 'framer-motion';
import {
  FiDownload, FiVideo, FiFileText, FiMic,
  FiRefreshCw, FiCheckCircle, FiHome, FiPlay,
  FiPause, FiVolume2, FiExternalLink, FiEye
} from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/common/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useWorkflow } from '../contexts/WorkflowContext';
import { apiService } from '../services/api';
import { downloadBlob } from '../utils/helpers';
import VideoPlayer from "../components/workflow/VideoPlayer";
import YouTubeLogin from './YouTubeLogin';
import toast from 'react-hot-toast';


/* ───────────────────────────── Info Row ───────────────────────────── */
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

/* ───────────────────────────── DownloadCard ───────────────────────────── */
const DownloadCard = ({ 
  icon: Icon, 
  title, 
  description, 
  onDownload, 
  onPreview, 
  disabled, 
  isLoading = false 
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
            onClick={onDownload}
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
              onClick={onPreview}
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


const SocialShare = ({ metadata = {}, streamUrl = null }) => {
  console.log("metadata in share", metadata)
  console.log("streamUrl", streamUrl)
  console.log("title", metadata.title)
  const shareUrl = streamUrl || 'https://saral.democratiseresearch.in';
  const LinkedInUrl = 'https://saral.democratiseresearch.in'
  const shareTitle = metadata.title || 'My Academic Presentation';
  // const shareText = `Check out this presentation I created of my work: "${shareTitle}" using SARAL "${streamUrl} Saralify your research: https://saral.democratiseresearch.in #democratiseResearch`;
  

  const shareText = `Check out this presentation I created of our work: "${shareTitle}" using SARAL ${streamUrl}

Saralify your research.

#democratiseResearch`;

  console.log("shareUrl", shareUrl)
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);
  const LinkendInEncodedUrl = encodeURIComponent(LinkedInUrl)
  const encodedTitle = encodeURIComponent(shareTitle);
  const linkedInShareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${LinkendInEncodedUrl}`;

  const shareLinks = [
    {
    name: 'LinkedIn',
    icon: FiExternalLink,
    url: linkedInShareLink,
    className: 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
  },
  //   {
  //   name: 'LinkedIn',
  //   icon: FiExternalLink,
  //   // Use the feed share endpoint instead
  //   url: `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`Check out this presentation I created: "${shareTitle}"\n\n${shareUrl}\n\nCreated with SARAL\n\n#democratiseResearch`)}`,
  //   className: 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
  // },
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


/* ───────────────────────────── VideoPreview Component ───────────────────────────── */
const VideoPreview = () => {
 const location = useLocation();
  const { video_url, paper_id, title } = location.state || {};
  console.log("video_url", video_url)
  const {  videoPath, audioFiles, slides, resetWorkflow, markStepCompleted, completedSteps } = useWorkflow();
  const [loading, setLoading] = useState({});
  const navigate = useNavigate();
  const [paperTitle, setPaperTitle] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState({})
  console.log("metadata", metadata)
  const paperId = sessionStorage.getItem("paperId");
  console.log("Retrieved paperId:", paperId);
  
  const withLoad = async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }));
    try { 
      await fn(); 
      toast.success('Download completed successfully!');
    } catch (error) {
      toast.error('Download failed. Please try again.');
    } finally { 
      setLoading(p => ({ ...p, [key]: false })); 
    }
  };

  const handleStartNewPaper = () => {
    resetWorkflow();            // clear workflow state
    navigate("/paper-processing");  // redirect to paper-processing
  };

  const dlVideo = () => withLoad('video', async () => {
    const { data } = await apiService.downloadPresentationVideo(paperId);
    downloadBlob(data, `presentation_${paperId}.mp4`);
  });

  const dlSlides = () => withLoad('slides', async () => {
    const { data } = await apiService.downloadPresentationSlides(paperId);
    downloadBlob(data, `slides_${paperId}.pdf`);
  });

  const dlAudio = f => withLoad(`aud_${f}`, async () => {
    const { data } = await apiService.downloadAudio(paperId, f);
    downloadBlob(data, f);
  });
  useEffect(() => {
    if (!completedSteps.includes(6)) {
      markStepCompleted(6);
    }
  }, [markStepCompleted, completedSteps]);

  const breadcrumbs = [
    { label: 'Results', href: '/results' }
  ];

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


  useEffect(() => {
    let mounted = true;
    if (!paperId) return;

    try {
      const maybe = apiService.getPresentationVideoStreamUrl(paperId);
      if (maybe && typeof maybe.then === "function") {
        maybe
          .then((url) => {
            console.log("streamurl data", url)
            if (mounted) setStreamUrl(url || null);
          })
          .catch(() => {
            if (mounted) setStreamUrl(null);
          });
      } else {
        setStreamUrl(maybe || null);
      }
    } catch {
      if (mounted) setStreamUrl(null);
    }

    return () => {
      mounted = false;
    };
  }, [paperId]);

  if (!paperId) {
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

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-0">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-center"
        >
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 sm:mb-6">
            <FiCheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600 dark:text-gray-300" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
            🎉 Video uploaded to YouTube successfully!
          </h1>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 font-sans max-w-2xl mx-auto px-4">
            Video presentation of your academic paper has been successfully uploaded to YouTube.
          </p>
        </motion.div>

        <SocialShare metadata={metadata} streamUrl={video_url} />

        {/* Metadata */}
        {metadata && Object.keys(metadata).length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="bg-white dark:bg-neutral-800 rounded-md p-4 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
          >
            <h2 className="text-lg sm:text-xl font-sans font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Paper Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <Info label="Title" value={metadata.title} />
              <Info label="Authors" value={metadata.authors} />
              <Info label="Date" value={metadata.date} />
              <Info label="Paper ID" value={<span className="font-mono text-xs sm:text-sm break-all">{paperId}</span>} />
            </div>
          </motion.div>
        )}

        {/* Video Preview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-white dark:bg-gray-900 rounded-md p-3 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
        >
          <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
            <VideoPlayer 
              src={apiService.getPresentationVideoStreamUrl(paperId)} 
              title="Generated Presentation"
              paperId={paperId}
            />
          </div>
        </motion.div>

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
              isLoading={loading.video} 
            />
            
            <DownloadCard 
              icon={FiFileText} 
              title="PDF Slides" 
              description="Presentation slides in PDF format" 
              onDownload={dlSlides} 
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
                <div key={f} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50 dark:border-b dark:bg-neutral-800 rounded-md gap-3 sm:gap-4">
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
                    onClick={() => dlAudio(f)}
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
        
        

        {/* Action Buttons */}
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

export default VideoPreview;