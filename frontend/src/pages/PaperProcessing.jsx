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
import PodcastGenerator from '../components/workflow/PodcastGenerator';
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
    
    const breadcrumbs = [
        { label: 'Paper Processing', href: '/paper-processing' }
    ];

    const renderContent = () => {
        if (paperId && isProcessed && view !== 'poster' && view !== 'podcast') {
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
                if (!paperId) {
                    return (
                        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
                            <h2 className="text-xl font-semibold">Upload PDF for Podcast Generation</h2>
                             <PaperUpload />
                        </div>
                    );
                }
                return <PodcastGenerator paperId={paperId} />;
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
