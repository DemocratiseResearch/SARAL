// src/pages/PaperProcessing.jsx (updated)
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUpload, FiMessageSquare, FiVideo, FiMic, FiImage, FiFileText, FiBookOpen, FiGlobe, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

import Layout from '../components/common/Layout';
import PaperUpload from '../components/forms/PaperUpload';
import MetadataEditor from '../components/forms/MetadataEditor';
import { useWorkflow } from '../contexts/WorkflowContext';
import { apiService } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PosterGenerator from '../components/workflow/PosterGenerator';
import PodcastGenerator from '../components/workflow/PodcastGenerator';


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
      <Icon className={`w-6 h-6 mb-3 ${isActive ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`} />
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </motion.button>
);

// Uploader with updated dropzone text
const UnifiedUploader = ({ title, onPdfSubmit, onZipSubmit, onArxivSubmit, isUploading, buttonText }) => {
    const [uploadType, setUploadType] = useState('pdf');
    const [file, setFile] = useState(null);
    const [arxivUrl, setArxivUrl] = useState('');
  
    const onDrop = useCallback((acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        toast.success('File selected successfully');
      }
    }, []);
  
    const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
      onDrop,
      accept: uploadType === 'zip' ? { 'application/zip': ['.zip'] } : { 'application/pdf': ['.pdf'] },
      multiple: false,
      maxSize: 50 * 1024 * 1024, // 50MB
    });
  
    const handleFileRemove = (e) => {
      e.stopPropagation();
      setFile(null);
    };
  
    const handleSubmit = () => {
      switch(uploadType) {
          case 'pdf':
              onPdfSubmit(file);
              break;
          case 'zip':
              onZipSubmit(file);
              break;
          case 'arxiv':
              onArxivSubmit(arxivUrl);
              break;
          default:
              toast.error("Invalid selection.");
      }
    };
  
    const uploadTypes = [
      { type: 'zip', icon: FiUpload, title: 'LaTeX Source', description: 'Upload ZIP file with source & figures' },
      { type: 'pdf', icon: FiFileText, title: 'PDF Document', description: 'Upload paper as a PDF' },
      { type: 'arxiv', icon: FiGlobe, title: 'arXiv Import', description: 'Import directly from an arXiv URL' },
    ];
  
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-xl p-8 border border-neutral-200 dark:border-neutral-700">
        <h2 className="text-2xl font-semibold mb-6 text-center">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {uploadTypes.map(ut => (
            <UploadTypeCard 
              key={ut.type}
              type={ut.type} 
              onSelect={(type) => { setUploadType(type); setFile(null); setArxivUrl(''); }}
              icon={ut.icon} 
              title={ut.title} 
              description={ut.description} 
              isActive={uploadType === ut.type} 
            />
          ))}
        </div>
  
        <AnimatePresence mode="wait">
          {(uploadType === 'pdf' || uploadType === 'zip') && (
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
                    isDragActive && !isDragReject ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                      : isDragReject ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                <input {...getInputProps()} />
                <FiUpload className={`w-12 h-12 mx-auto mb-4 ${isDragReject ? 'text-red-400' : 'text-gray-400'}`} />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {isDragActive ? (isDragReject ? 'Invalid file type' : `Drop your ${uploadType.toUpperCase()} file here`) : `Upload ${uploadType === 'zip' ? 'LaTeX Source' : 'PDF File'}`}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Drag and drop your {uploadType.toUpperCase()} file here, or click to browse
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Maximum file size: 50MB</p>
                  <p>Accepted format: {uploadType.toUpperCase()} files only</p>
                </div>
              </div>
  
              <AnimatePresence>
                  {file && (
                      <motion.div
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                          className="bg-gray-50 dark:bg-neutral-900/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
                      >
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                      <FiFileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                  </div>
                                  <div>
                                      <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                      <p className="text-sm text-gray-600 dark:text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                  </div>
                              </div>
                              <button onClick={handleFileRemove} className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors duration-150">
                                  <FiX className="w-5 h-5" />
                              </button>
                          </div>
                      </motion.div>
                  )}
              </AnimatePresence>
            </motion.div>
          )}
          
          {uploadType === 'arxiv' && (
            <motion.div 
              key="arxiv-upload"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
               <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">arXiv Paper URL</label>
                  <input type="url" value={arxivUrl} onChange={(e) => setArxivUrl(e.target.value)} placeholder="https://arxiv.org/abs/..." 
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-700"/>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Enter the URL of an arXiv paper (e.g., https://arxiv.org/abs/2301.00000)</p>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
  
        <div className="flex gap-4 mt-6">
            <button onClick={handleSubmit} disabled={isUploading || (uploadType !== 'arxiv' && !file) || (uploadType === 'arxiv' && !arxivUrl.trim())} className="btn-primary w-full">
                {isUploading ? <LoadingSpinner /> : buttonText}
            </button>
        </div>
      </div>
    );
};

const PaperProcessing = () => {
    const { paperId, isProcessed, setPaperId, setMetadata, setImages } = useWorkflow();
    const navigate = useNavigate();
    const [view, setView] = useState('choice');
    const [isLoading, setIsLoading] = useState(false);

    const handleNotImplemented = () => {
        toast.error("This upload method is not yet implemented for this feature.");
    };

    const handleChatFileUpload = async (file) => {
        if(!file) return toast.error("Please select a file.");
        setIsLoading(true);
        try {
            const response = await apiService.uploadPdfForChat(file);
            toast.success('Paper ready for Chat!');
            navigate(`/chat/${response.data.paper_id}`);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to prepare paper for Chat.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleTutorFileUpload = async (file) => {
        if(!file) return toast.error("Please select a file.");
        setIsLoading(true);
        try {
            const response = await apiService.uploadPdfForChat(file); // Uses the same endpoint as chat
            toast.success('Paper ready for Guided Learning!');
            navigate(`/rag-tutor/${response.data.paper_id}`);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to prepare paper for Guided Learning.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePosterUpload = async (file) => {
        if (!file) {
            toast.error("Please select a PDF file.");
            return;
        }
        setIsLoading(true);
        try {
            const response = await apiService.uploadPdf(file);
            const { paper_id, metadata, image_files } = response.data;
            setPaperId(paper_id);
            setMetadata(metadata);
            setImages(image_files);
            toast.success("Paper uploaded successfully. You can now generate the poster.");
        } catch (error) {
            toast.error("Failed to upload paper for poster generation.");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePodcastUpload = async (file) => {
        if (!file) return toast.error("Please select a file.");
        setIsLoading(true);
        try {
            const response = await apiService.uploadPdf(file);
            const { paper_id, metadata, image_files } = response.data;
            setPaperId(paper_id);
            setMetadata(metadata);
            setImages(image_files);
            toast.success("Paper uploaded. You can now generate the podcast.");
        } catch (error) {
            toast.error("Failed to upload paper for podcast generation.");
        } finally {
            setIsLoading(false);
        }
    };

    const breadcrumbs = [
        { label: 'Paper Processing', href: '/paper-processing' }
    ];

    const renderContent = () => {
        if (paperId && isProcessed && view !== 'poster' && view !== 'podcast') return <MetadataEditor />;
        if (paperId && view === 'poster') return <PosterGenerator paperId={paperId} />;
        if (paperId && view === 'podcast') return <PodcastGenerator paperId={paperId} />;

        switch (view) {
            case 'video':
                return <PaperUpload />;
            case 'chat':
                return <UnifiedUploader
                    title="Upload Paper for Chat"
                    onPdfSubmit={handleChatFileUpload}
                    onZipSubmit={handleNotImplemented}
                    onArxivSubmit={handleNotImplemented}
                    isUploading={isLoading}
                    buttonText="Start Chat"
                />;
            case 'tutor':
                return <UnifiedUploader 
                    title="Upload Paper for Guided Learning"
                    onPdfSubmit={handleTutorFileUpload}
                    onZipSubmit={handleNotImplemented}
                    onArxivSubmit={handleNotImplemented}
                    isUploading={isLoading}
                    buttonText="Start Guided Learning"
                />;
            case 'podcast':
                return <UnifiedUploader
                    title="Upload Paper for Podcast"
                    onPdfSubmit={handlePodcastUpload}
                    onZipSubmit={handleNotImplemented}
                    onArxivSubmit={handleNotImplemented}
                    isUploading={isLoading}
                    buttonText="Upload for Podcast"
                />;
            case 'poster':
                return <UnifiedUploader 
                    title="Upload Paper for Poster"
                    onPdfSubmit={handlePosterUpload}
                    onZipSubmit={handleNotImplemented}
                    onArxivSubmit={handleNotImplemented}
                    isUploading={isLoading}
                    buttonText="Upload for Poster"
                />;
            case 'choice':
            default:
                return (
                    <div className="grid md:grid-cols-2 gap-6">
                        <ChoiceCard
                            icon={FiVideo}
                            title="Paper to Video"
                            description="Automatically generate a video presentation from your research paper."
                            onClick={() => {
                                setPaperId(null);
                                setView('video');
                            }}
                        />
                        <ChoiceCard
                            icon={FiMessageSquare}
                            title="Start Interactive Chat"
                            description="Upload a PDF to ask questions about the paper's content."
                            onClick={() => setView('chat')}
                        />
                        <ChoiceCard
                            icon={FiBookOpen}
                            title="Start Guided Learning"
                            description="Begin a step-by-step session to understand the paper."
                            onClick={() => setView('tutor')}
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
                {view !== 'choice' && (
                    <button onClick={() => { setView('choice'); setPaperId(null); }} className="text-sm text-gray-600 dark:text-gray-400 hover:underline mb-4">
                        &larr; Back to choices
                    </button>
                )}
                {renderContent()}
            </motion.div>
        </Layout>
    );
};

export default PaperProcessing;
