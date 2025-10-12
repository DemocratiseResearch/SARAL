import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiUpload,
  FiFile,
  FiX,
  FiGlobe,
  FiCheck,
  FiFileText,
  FiAlertCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { apiService } from '../../services/api';
import { useWorkflow } from '../../contexts/WorkflowContext';
import LoadingSpinner from '../common/LoadingSpinner';
import YouTubeLogin from '../../pages/YouTubeLogin';
import VideoPlayer from "../workflow/VideoPlayer";
import { useNavigate } from 'react-router-dom';

const UploadTypeCard = ({ type, onSelect, icon: Icon, title, description, isActive }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => onSelect(type)}
    className={`w-full p-6 rounded-xl border transition-all duration-150 text-left ${
      isActive
        ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/50'
        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
    }`}
  >
    <Icon className={`w-6 h-6 mb-3 ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`} />
    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </motion.button>
);

const FileDisplay = ({ file, onRemove }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    className="bg-white dark:bg-neutral-800 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
          <FiFile className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
        </div>
      </div>
      <button onClick={onRemove} className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors duration-150">
        <FiX className="w-5 h-5" />
      </button>
    </div>
  </motion.div>
);

const PaperUpload = () => {
  const { setLoading, setPaperId, setMetadata, setImages, paperId, setIsProcessed } = useWorkflow();

  const [uploadType, setUploadType] = useState('file');
  const [arxivUrl, setArxivUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('english');

  // separate loading states for each action
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const [isImportingArxiv, setIsImportingArxiv] = useState(false);
   const [isImportingArxivToVideo, setIsImportingArxivToVideo] = useState(false);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [isGeneratingReel, setIsGeneratingReel] = useState(false);

  // video url from convert to video response
  const [videoUrl, setVideoUrl] = useState(null);

  // streamUrl fetched from apiService.getVideoStreamUrl(paperId)
  const [streamUrl, setStreamUrl] = useState(null);
  
  // Generated content states
  const [generatedPodcast, setGeneratedPodcast] = useState(null);
  const [generatedReel, setGeneratedReel] = useState(null);
  
  const navigate = useNavigate();
  //  Restore paperId from sessionStorage on mount
  
  // useEffect(() => {
  //   const storedPaperId = sessionStorage.getItem("paperId");
  //   if (storedPaperId && !paperId) {
  //     setPaperId(storedPaperId);
  //   }
  // }, []); 

  //  Fetch stream URL whenever paperId changes
  useEffect(() => {
    let mounted = true;

    if (!paperId) {
      setStreamUrl(null);
      return;
    }

    try {
      const maybe = apiService.getPresentationVideoStreamUrl(paperId);
      console.log("getVideoStreamUrl returned:", maybe);

      if (maybe && typeof maybe.then === "function") {
        // async
        maybe
          .then((url) => {
            if (mounted) {
              if (url) {
                setStreamUrl(url);
                setVideoUrl(url); // ✅ show immediately
              } else {
                setStreamUrl(null);
              }
            }
          })
          .catch((err) => {
            console.warn("getVideoStreamUrl error:", err);
            if (mounted) setStreamUrl(null);
          });
      } else {
        // sync
        setStreamUrl(maybe || null);
        setVideoUrl(maybe || null);
      }
    } catch (err) {
      console.warn("getVideoStreamUrl threw:", err);
      if (mounted) setStreamUrl(null);
    }

    return () => {
      mounted = false;
    };
  }, [paperId]);

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      const file = acceptedFiles[0];

      if (rejectedFiles.length > 0) {
        const error = rejectedFiles[0].errors[0];
        if (error.code === 'file-too-large') {
          toast.error('File size too large. Please upload a smaller file.');
        } else if (error.code === 'file-invalid-type') {
          toast.error(`Please upload a ${uploadType === 'file' ? 'ZIP' : 'PDF'} file`);
        } else {
          toast.error('File upload failed. Please try again.');
        }
        return;
      }

      if (file) {
        setUploadedFile(file);
        toast.success('File selected successfully');
      }
    },
    [uploadType]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: uploadType === 'file' ? { 'application/zip': ['.zip'] } : { 'application/pdf': ['.pdf'] },
    multiple: false,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  const handleArxivSubmit = async () => {
    console.log("arxivUrl", arxivUrl)
    if (!arxivUrl.trim()) {
      toast.error('Please enter an arXiv URL');
      return;
    }
    if (!arxivUrl.includes('arxiv.org') && !arxivUrl.includes("biorxiv.org")) {
      toast.error('Please enter a valid arXiv or bioRxiv URL');
      return;
    }


    setIsImportingArxiv(true);
    setLoading(true);

    try {
      const response = await apiService.scrapeArxiv(arxivUrl);
      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata);
      setImages(image_files);
      setIsProcessed(true);

      toast.success('Paper processed successfully!');
    } catch (error) {
      console.error('arXiv processing error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to process arXiv paper';
      toast.error(errorMessage);
    } finally {
      setIsImportingArxiv(false);
      setLoading(false);
    }
  };

   const handleArxivToVideoSubmit = async () => {
    if (!arxivUrl.trim()) {
      toast.error('Please enter an arXiv URL');
      return;
    }
    if (!arxivUrl.includes('arxiv.org')) {
      toast.error('Please enter a valid arXiv URL');
      return;
    }

    setIsImportingArxivToVideo(true);
    setLoading(true);

    try {
      const response = await apiService.scrapeArxivToVideo(arxivUrl);
      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata);
      setImages(image_files);
      sessionStorage.setItem("paperId", paper_id);

      toast.success('Paper processed successfully!');
      navigate('/video-display');
    } catch (error) {
      console.error('arXiv processing error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to process arXiv paper';
      toast.error(errorMessage);
    } finally {
      setIsImportingArxivToVideo(false);
      setLoading(false);
    }
  };


  const handleFileUpload = async () => {
    if (!uploadedFile) {
      toast.error(`Please select a ${uploadType === 'file' ? 'ZIP' : 'PDF'} file`);
      return;
    }

    setIsProcessingUpload(true);
    setLoading(true);
    setVideoUrl(null);
    setStreamUrl(null);

    try {
      let response;
      if (uploadType === 'file') {
        response = await apiService.uploadZip(uploadedFile);
      } else {
        response = await apiService.uploadPdf(uploadedFile);
      }

      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata || { title: '', authors: '', date: '' });
      setImages(image_files || []);
      setIsProcessed(true);

      toast.success(`${uploadType === 'file' ? 'LaTeX' : 'PDF'} processed successfully!`);
    } catch (error) {
      console.error(`Error uploading ${uploadType}:`, error);
      const errorMessage = error.response?.data?.detail || `Failed to process ${uploadType} file`;
      toast.error(errorMessage);
    } finally {
      setIsProcessingUpload(false);
      setLoading(false);
    }
  };

  const handleConvertVideo = async () => {
    if (!uploadedFile) {
      toast.error(`Please select a ${uploadType === 'file' ? 'ZIP' : 'PDF'} file`);
      return;
    }

    setIsConvertingVideo(true);
    setLoading(true);
    setVideoUrl(null);

    try {
      let response;
      if (uploadType === 'file') {
        response = await apiService.uploadZipToVideo(uploadedFile);
      } else {
        response = await apiService.uploadPdfToVideo(uploadedFile);
      }

      const { paper_id, metadata, image_files, video_url } = response.data;

      setPaperId(paper_id);
      setIsProcessed(false);
      sessionStorage.setItem("paperId", paper_id);
      console.log("paper_id", paper_id)
      console.log("video_url", video_url)
      setImages(image_files || []);
      if (paper_id) {
        // setVideoUrl(video_url);
        toast.success('Video generated successfully!');
        navigate('/video-display');
      } else {
        console.log("no video url is present")
        toast('Video generation request submitted. It may take a while to appear.');
      }
      // if (video_url) {
      //   setVideoUrl(video_url);
      //   toast.success('Video generated successfully!');
      //   // navigate('/video-display');
      // } else {
      //   console.log("no video url is present")
      //   // toast('Video generation request submitted. It may take a while to appear.');
      // }
    } catch (error) {
      console.error('Error converting to video:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to convert to video';
      toast.error(errorMessage);
    } finally {
      setIsConvertingVideo(false);
      setLoading(false);
    }
  };

  const handleGeneratePodcast = async () => {
    if (!uploadedFile) {
      toast.error(`Please select a ${uploadType === 'file' ? 'ZIP' : 'PDF'} file`);
      return;
    }

    // Only allow PDF files for podcast generation
    if (uploadType !== 'pdf') {
      toast.error('Podcast generation is only available for PDF files');
      return;
    }

    setIsGeneratingPodcast(true);
    setLoading(true);

    try {
      const response = await apiService.generatePodcast(uploadedFile, selectedLanguage);
      
      console.log('Podcast generated:', response.data);
      toast.success(`Podcast generated successfully in ${selectedLanguage}!`);
      
      // Store podcast data for inline display
      setGeneratedPodcast(response.data);
      
    } catch (error) {
      console.error('Error generating podcast:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to generate podcast';
      toast.error(errorMessage);
    } finally {
      setIsGeneratingPodcast(false);
      setLoading(false);
    }
  };

  const handleGenerateReel = async () => {
    if (!uploadedFile) {
      toast.error(`Please select a ${uploadType === 'file' ? 'ZIP' : 'PDF'} file`);
      return;
    }

    // Only allow PDF files for reel generation
    if (uploadType !== 'pdf') {
      toast.error('Reel generation is only available for PDF files');
      return;
    }

    setIsGeneratingReel(true);
    setLoading(true);

    try {
      const response = await apiService.generateReel(uploadedFile, selectedLanguage);
      
      console.log('Reel generated:', response.data);
      toast.success(`Reel generated successfully in ${selectedLanguage}!`);
      
      // Store reel data for inline display
      setGeneratedReel(response.data);
      
    } catch (error) {
      console.error('Error generating reel:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to generate reel';
      toast.error(errorMessage);
    } finally {
      setIsGeneratingReel(false);
      setLoading(false);
    }
  };

  const uploadTypes = [
    {
      type: 'file',
      icon: FiUpload,
      title: 'LaTeX Source',
      description: 'Upload ZIP file containing LaTeX source code and figures'
    },
    {
      type: 'pdf',
      icon: FiFileText,
      title: 'PDF Document',
      description: 'Upload research paper as PDF (text and images will be extracted)'
    },
    {
      type: 'arxiv',
      icon: FiGlobe,
      title: 'arXiv Import',
      description: 'Import paper directly from arXiv using URL'
    }
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6"
      >
        {/* loading bar */}
        {(isProcessingUpload || isConvertingVideo || isImportingArxiv || isImportingArxivToVideo || isGeneratingPodcast || isGeneratingReel) && (
          <div className="h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4">
            <div className="h-full w-full animate-pulse bg-gray-700 dark:bg-gray-400" />
          </div>
        )}

        <div>
          <div className="grid md:grid-cols-3 gap-4">
            {uploadTypes.map((typeConfig) => (
              <UploadTypeCard
                key={typeConfig.type}
                type={typeConfig.type}
                onSelect={(type) => {
                  setUploadType(type);
                  setUploadedFile(null);
                  setArxivUrl('');
                  setVideoUrl(null);
                }}
                icon={typeConfig.icon}
                title={typeConfig.title}
                description={typeConfig.description}
                isActive={uploadType === typeConfig.type}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {(uploadType === 'file' || uploadType === 'pdf') && (
            <motion.div
              key={`${uploadType}-upload`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                  isDragActive && !isDragReject
                    ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                    : isDragReject
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <input {...getInputProps()} />
                <FiUpload className={`w-12 h-12 mx-auto mb-4 ${isDragReject ? 'text-red-400' : 'text-gray-400'}`} />

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {isDragActive ? (isDragReject ? 'Invalid file type' : `Drop your ${uploadType === 'file' ? 'ZIP' : 'PDF'} file here`) : `Upload ${uploadType === 'file' ? 'LaTeX Source' : 'PDF File'}`}
                </h3>

                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Drag and drop your {uploadType === 'file' ? 'ZIP' : 'PDF'} file here, or click to browse
                </p>

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Maximum file size: 50MB</p>
                  <p>Accepted format: {uploadType === 'file' ? 'ZIP' : 'PDF'} files only</p>
                </div>
              </div>

              <AnimatePresence>
                {uploadedFile && <FileDisplay file={uploadedFile} onRemove={() => setUploadedFile(null)} />}
              </AnimatePresence>

              {/* Language Selection for Podcast */}
              {uploadedFile && uploadType === 'pdf' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
                >
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Podcast Language
                  </label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="tamil">Tamil</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Select the language for your AI-generated podcast
                  </p>
                </motion.div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={handleFileUpload}
                  disabled={!uploadedFile || isProcessingUpload}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md ${
                    !uploadedFile || isProcessingUpload ? 'bg-gray-400 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'
                  } font-medium transition-colors duration-150 text-sm`}
                >
                  {isProcessingUpload ? <LoadingSpinner size="sm" /> : <FiCheck className="w-4 h-4" />}
                  {isProcessingUpload
                    ? `Processing...`
                    : `Process ${uploadType === 'file' ? 'LaTeX' : 'PDF'}`
                  }
                </button>
                <button
                  onClick={handleConvertVideo}
                  disabled={!uploadedFile || isConvertingVideo}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md ${
                    !uploadedFile || isConvertingVideo ? 'bg-gray-400 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  } font-medium transition-colors duration-150 text-sm`}
                >
                  {isConvertingVideo ? <LoadingSpinner size="sm" /> : <FiCheck className="w-4 h-4" />}
                  {isConvertingVideo ? 'Converting...' : 'To Video'}
                </button>
                <button
                  onClick={handleGeneratePodcast}
                  disabled={!uploadedFile || isGeneratingPodcast || uploadType !== 'pdf'}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md ${
                    !uploadedFile || isGeneratingPodcast || uploadType !== 'pdf' ? 'bg-gray-400 text-white' : 'bg-green-600 hover:bg-green-500 text-white'
                  } font-medium transition-colors duration-150 text-sm`}
                >
                  {isGeneratingPodcast ? <LoadingSpinner size="sm" /> : <FiCheck className="w-4 h-4" />}
                  {isGeneratingPodcast ? 'Generating...' : (uploadType === 'pdf' ? 'To Podcast' : 'PDF Only')}
                </button>
                <button
                  onClick={handleGenerateReel}
                  disabled={!uploadedFile || isGeneratingReel || uploadType !== 'pdf'}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md ${
                    !uploadedFile || isGeneratingReel || uploadType !== 'pdf' ? 'bg-gray-400 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
                  } font-medium transition-colors duration-150 text-sm`}
                >
                  {isGeneratingReel ? <LoadingSpinner size="sm" /> : <FiCheck className="w-4 h-4" />}
                  {isGeneratingReel ? 'Creating...' : (uploadType === 'pdf' ? 'To Reel' : 'PDF Only')}
                </button>
              </div>

              {/* ✅ Video block */}
              {streamUrl && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="bg-white dark:bg-gray-900 rounded-md p-3 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
                >
                  <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
                    <VideoPlayer 
                      src={streamUrl} 
                      title="Generated Presentation"
                      paperId={paperId}
                    />
                  </div>
                  <div className="mt-2">
                    <YouTubeLogin />
                  </div>
                </motion.div>
              )}

              {/* Generated Podcast Display */}
              {generatedPodcast && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
                >
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2">
                    🎧 Generated Podcast ({generatedPodcast.language})
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Audio Player */}
                    {generatedPodcast.audio_filename && (
                      <div className="bg-white dark:bg-gray-800 rounded-md p-3">
                        <audio 
                          controls 
                          className="w-full"
                          src={`${process.env.NODE_ENV === 'production' 
                            ? process.env.REACT_APP_API_URL 
                            : 'http://localhost:8000'}/api/podcast/stream_audio/${generatedPodcast.audio_filename}`}
                        >
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}
                    
                    {/* Podcast Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-green-700 dark:text-green-300">Duration:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {generatedPodcast.audio_info?.duration_minutes?.toFixed(1)} minutes
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-green-700 dark:text-green-300">Segments:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {generatedPodcast.total_audio_segments}
                        </span>
                      </div>
                    </div>

                    {/* Download Button */}
                    {generatedPodcast.audio_filename && (
                      <a
                        href={`${process.env.NODE_ENV === 'production' 
                          ? process.env.REACT_APP_API_URL 
                          : 'http://localhost:8000'}/api/podcast/download_audio/${generatedPodcast.audio_filename}`}
                        download
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
                      >
                        <FiCheck className="w-4 h-4" />
                        Download Podcast
                      </a>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Generated Reel Display */}
              {generatedReel && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
                >
                  <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
                    🎬 Generated Reel ({generatedReel.language})
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Video Player */}
                    {(generatedReel.video_filename || generatedReel.success) && (
                      <div className="bg-white dark:bg-gray-800 rounded-md p-3">
                        <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
                          <video 
                            controls 
                            className="w-full h-full object-cover"
                            src={apiService.streamReelVideo('reel_output.mp4')}
                          >
                            Your browser does not support the video element.
                          </video>
                        </div>
                      </div>
                    )}
                    
                    {/* Reel Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-purple-700 dark:text-purple-300">Audio Files:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {generatedReel.audio_files_count}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-purple-700 dark:text-purple-300">Dialogue Length:</span>
                        <span className="ml-2 text-gray-600 dark:text-gray-400">
                          {generatedReel.dialogue_length} chars
                        </span>
                      </div>
                    </div>

                    {/* Download Button */}
                    {(generatedReel.video_filename || generatedReel.success) && (
                      <a
                        href={apiService.downloadReelVideo('reel_output.mp4')}
                        download="reel_output.mp4"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors"
                      >
                        <FiCheck className="w-4 h-4" />
                        Download Reel
                      </a>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {uploadType === 'arxiv' && (
            <motion.div
              key="arxiv-input"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">arXiv Paper URL</label>
                <input
                  type="url"
                  value={arxivUrl}
                  onChange={(e) => setArxivUrl(e.target.value)}
                  placeholder="https://arxiv.org/abs/2301.00000"
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Enter the URL of an arXiv paper (e.g., https://arxiv.org/abs/2301.00000)</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleArxivSubmit}
                  disabled={!arxivUrl.trim() || isImportingArxiv}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150"
                >
                  {isImportingArxiv ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Importing...
                    </>
                  ) : (
                    <>
                      {/* <FiGlobe className="w-5 h-5" /> */}
                      Process arXiv 
                      <br/>
                      (custom video generation)
                    </>
                  )}
                </button>

                <button
                  onClick={handleArxivToVideoSubmit}
                  disabled={!arxivUrl.trim() || isImportingArxivToVideo}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-400 text-white font-medium transition-colors duration-150"
                >
                  {isImportingArxivToVideo ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <FiGlobe className="w-5 h-5" />
                      One click to Video
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default PaperUpload;
