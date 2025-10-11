// src/pages/PaperProcessing.jsx (updated)
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiUpload, FiMessageSquare, FiVideo, FiMic, FiImage, FiFile } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import Layout from '../components/common/Layout';
import PaperUpload from '../components/forms/PaperUpload';
import MetadataEditor from '../components/forms/MetadataEditor';
import { useWorkflow } from '../contexts/WorkflowContext';
import { apiService } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PosterGenerator from '../components/workflow/PosterGenerator';
import { useDropzone } from 'react-dropzone';

const ChoiceCard = ({ icon: Icon, title, description, onClick, disabled }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    disabled={disabled}
    className="w-full p-6 rounded-xl border transition-all duration-150 text-left bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-50"
  >
    <Icon className="w-8 h-8 mb-4 text-gray-700 dark:text-gray-300" />
    <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-2">{title}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </motion.button>
);


const PaperProcessing = () => {
  const { paperId, isProcessed, setPaperId, setMetadata, setImages } = useWorkflow();
  const navigate = useNavigate();
  const [view, setView] = useState('choice'); // 'choice', 'video', 'chat', 'podcast', 'poster'
  const [chatLoading, setChatLoading] = useState(false);
  const [chatFile, setChatFile] = useState(null);

  // Podcast state
  const [podcastFile, setPodcastFile] = useState(null);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [podcastLoadingMessage, setPodcastLoadingMessage] = useState('');
  const [podcastUrl, setPodcastUrl] = useState('');
  const [podcastError, setPodcastError] = useState('');

  // For poster upload
  const [posterFile, setPosterFile] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);

  const onPosterDrop = useCallback((acceptedFiles) => {
      setPosterFile(acceptedFiles[0]);
  }, []);

  const { getRootProps: getPosterRootProps, getInputProps: getPosterInputProps, isDragActive: isPosterDragActive } = useDropzone({
      onDrop: onPosterDrop,
      accept: { 'application/pdf': ['.pdf'] },
      multiple: false,
  });

  const handlePosterUpload = async () => {
      if (!posterFile) {
          toast.error("Please select a PDF file.");
          return;
      }
      setPosterLoading(true);
      try {
          const response = await apiService.uploadPdf(posterFile);
          const { paper_id, metadata, image_files } = response.data;
          setPaperId(paper_id);
          setMetadata(metadata);
          setImages(image_files);
          toast.success("Paper uploaded successfully. You can now generate the poster.");
      } catch (error) {
          toast.error("Failed to upload paper for poster generation.");
      } finally {
          setPosterLoading(false);
      }
  };


  const handleChatFileUpload = async (file) => {
    if (!file) {
      toast.error('Please select a PDF file for chat.');
      return;
    }
    setChatFile(file);
    setChatLoading(true);

    try {
      const response = await apiService.uploadPdfForChat(file);
      const { paper_id } = response.data;
      toast.success('Your paper is ready for chat!');
      navigate(`/chat/${paper_id}`);
    } catch (error) {
      console.error('Chat upload error:', error);
      toast.error(error.response?.data?.detail || 'Failed to prepare paper for chat.');
    } finally {
      setChatLoading(false);
      setChatFile(null);
    }
  };

  const handlePodcastUpload = async () => {
    if (!podcastFile) return;

    setPodcastError('');
    setPodcastUrl('');
    setPodcastLoading(true);
    setPodcastLoadingMessage('Uploading PDF...');

    try {
      // 1) Upload PDF, get paper_id
      const uploadResp = await apiService.uploadPdf(podcastFile);
      const paper_id = uploadResp?.data?.paper_id;
      if (!paper_id) throw new Error('No paper_id returned from upload');

      // 2) Start podcast generation
      setPodcastLoadingMessage('Starting podcast generation...');
      const startResp = await apiService.post(
        `/media/papers/${paper_id}/podcast`,
        {}, // No request body
        { timeout: 600000 } // 10-minute timeout
      );
      const task_id = startResp?.data?.task_id;
      if (!task_id) throw new Error('No task_id returned from podcast start');

      // 3) Poll for status
      setPodcastLoadingMessage('Generating podcast (this may take a minute)...');

      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const statusResp = await apiService.get(`/media/tasks/${task_id}`);
            const { status, stage, url, error } = statusResp?.data || {};

            if (status === 'processing') {
              if (stage) setPodcastLoadingMessage(`Processing: ${stage}...`);
              return; // keep polling
            }

            if (status === 'complete') {
              clearInterval(interval);
              if (url) {
                const backendBase = process.env.NODE_ENV === 'production'
                  ? process.env.REACT_APP_API_URL
                  : 'http://localhost:8000';
                setPodcastUrl(`${backendBase}${url}`);
              }
              setPodcastLoading(false);
              setPodcastLoadingMessage('');
              resolve();
              return;
            }

            if (status === 'failed') {
              clearInterval(interval);
              setPodcastLoading(false);
              setPodcastLoadingMessage('');
              setPodcastError(error || 'Podcast generation failed');
              reject(new Error(error || 'Podcast generation failed'));
              return;
            }
          } catch (pollErr) {
            clearInterval(interval);
            setPodcastLoading(false);
            setPodcastLoadingMessage('');
            setPodcastError('Failed to poll task status');
            reject(pollErr);
          }
        }, 2500);
      });
    } catch (err) {
      console.error('Podcast generation error:', err);
      setPodcastError(
        err?.response?.data?.detail || err?.message || 'Failed to generate podcast.'
      );
      setPodcastLoading(false);
      setPodcastLoadingMessage('');
    }
  };
  
  const breadcrumbs = [
    { label: 'Paper Processing', href: '/paper-processing' }
  ];

  const renderContent = () => {
    if (paperId && isProcessed && view !== 'poster') {
      return <MetadataEditor />;
    }

    switch (view) {
      case 'video':
        return <PaperUpload />;
      case 'chat':
        return (
             <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
                <h2 className="text-xl font-semibold">Upload PDF for Chat</h2>
                <input type="file" accept=".pdf" onChange={(e) => handleChatFileUpload(e.target.files[0])} className="file-input file-input-bordered w-full max-w-xs" />
                {chatLoading && <div className="flex items-center gap-2"><LoadingSpinner /> <span>Processing...</span></div>}
             </div>
        );
      case 'podcast':
        return (
          <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
            <h2 className="text-xl font-semibold">Upload PDF for Podcast</h2>

            <div className="space-y-3">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPodcastFile(e.target.files?.[0] || null)}
                className="file-input file-input-bordered w-full max-w-xs"
              />

              <button
                className="btn btn-primary"
                onClick={handlePodcastUpload}
                disabled={!podcastFile || podcastLoading}
              >
                {podcastLoading ? 'Please wait...' : 'Generate'}
              </button>
            </div>

            {podcastLoading && (
              <div className="flex items-center gap-2 text-sm">
                <LoadingSpinner />
                <span>{podcastLoadingMessage || 'Processing...'}</span>
              </div>
            )}

            {!!podcastError && (
              <div className="text-red-600 text-sm">{podcastError}</div>
            )}

            {!!podcastUrl && (
              <div className="space-y-3">
                <audio controls src={podcastUrl} className="w-full" />
                <a
                  href={podcastUrl}
                  download
                  className="text-blue-600 hover:underline"
                >
                  Download Podcast MP3
                </a>
              </div>
            )}
          </div>
        );
      case 'poster':
          if (paperId) {
              return <PosterGenerator paperId={paperId} />;
          }
          return (
              <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
                  <h2 className="text-xl font-semibold">Upload PDF for Poster Generation</h2>
                  <div {...getPosterRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${isPosterDragActive ? 'border-gray-700' : 'border-gray-300'}`}>
                      <input {...getPosterInputProps()} />
                      <FiUpload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      {posterFile ? <p>{posterFile.name}</p> : <p>Drag 'n' drop a PDF here, or click to select a file</p>}
                  </div>
                  <button onClick={handlePosterUpload} disabled={!posterFile || posterLoading} className="btn-primary w-full">
                      {posterLoading ? <LoadingSpinner /> : 'Upload and Continue'}
                  </button>
              </div>
          );
      case 'choice':
      default:
        return (
            <div className="grid md:grid-cols-2 gap-6">
                <ChoiceCard
                    icon={FiVideo}
                    title="One Click to Video"
                    description="The existing pipeline to automatically generate a video presentation from your paper."
                    onClick={() => {
                        setPaperId(null);
                        setView('video');
                    }}
                />
                <ChoiceCard
                    icon={FiMessageSquare}
                    title="Start Interactive Chat"
                    description="Upload a PDF to start an interactive chat session and ask questions about the paper's content."
                    onClick={() => setView('chat')}
                />
                <ChoiceCard
                  icon={FiMic}
                  title="Generate Podcast"
                  description="Upload a PDF to automatically generate a podcast episode discussing the paper."
                  onClick={() => setView('podcast')}
                />
                <ChoiceCard
                    icon={FiImage}
                    title="Generate Poster"
                    description="Create a scientific poster from a PDF of your paper."
                    onClick={() => {
                        setPaperId(null);
                        setView('poster');
                    }}
                />
            </div>
        );
    }
  };

  return (
    <Layout title="Paper Processing" breadcrumbs={breadcrumbs}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {renderContent()}
      </motion.div>
    </Layout>
  );
};

export default PaperProcessing;