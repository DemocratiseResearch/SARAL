import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUpload, FiFile, FiX, FiFileText, FiCheck, FiAlertCircle } from 'react-icons/fi';
import toast from '../../services/toastService';
import { apiService } from '../../services/api';
import { useWorkflow } from '../../contexts/WorkflowContext';
import LoadingSpinner from '../common/LoadingSpinner';
import Analytics from '../../lib/analytics';

// small helper to attach common props and timestamp
const track = (eventName, props = {}) => {
  Analytics.track(eventName, {
    timestamp: new Date().toISOString(),
    ...props
  });
};

const UploadTypeCard = ({ icon: Icon, title, description, isActive }) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className={`w-full p-6 rounded-xl border transition-all duration-150 text-left ${
      isActive
        ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/50'
        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
    }`}
  >
    <Icon className={`w-6 h-6 mb-3 ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`} />
    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </motion.div>
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
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors duration-150"
      >
        <FiX className="w-5 h-5" />
      </button>
    </div>
  </motion.div>
);

const PatentUpload = () => {
  const { setLoading, processUploadSuccess } = useWorkflow();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Page view tracking for patent upload view
  useEffect(() => {
    track('Paper Processing Page Viewed', { doc_type: 'patent' });
  }, []);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      toast.error('Invalid file. Please upload a PDF file smaller than 50MB.');
      return;
    }
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      toast.success('File selected successfully');
      // no analytics here — we'll track on actual submit
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    maxSize: 50 * 1024 * 1024,
  });

  const handleSubmit = async () => {
    if (!uploadedFile) {
      toast.error('Please select a PDF file to upload');
      return;
    }

    setProcessing(true);
    setLoading(true);

    try {
      const response = await apiService.uploadPatentPdf(uploadedFile);

      if (response && response.data) {
        const { paper_id, metadata, image_files } = response.data;

        processUploadSuccess({
          paperId: paper_id,
          documentType: 'patent',
          metadata: metadata,
          images: image_files || [],
        });

        toast.success('PDF processed successfully!');

        // Minimal analytics for patent upload succeeded
        track('Upload Document', {
          doc_type: 'patent',
          source: 'pdf',
          file_name: uploadedFile.name,
          result: 'succeeded',
          paper_id
        });
      } else {
        toast.error('Empty response from API');
        track('Upload Document', {
          doc_type: 'patent',
          source: 'pdf',
          file_name: uploadedFile.name,
          result: 'failed',
          error_message: 'empty_response'
        });
      }
    } catch (error) {
      console.error('Patent processing error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to process PDF';
      toast.error(errorMessage);

      track('Upload Document', {
        doc_type: 'patent',
        source: 'pdf',
        file_name: uploadedFile?.name || null,
        result: 'failed',
        error_message: errorMessage
      });
    } finally {
      setProcessing(false);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6"
      >
        {processing && (
          <div className="h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4">
            <div className="h-full w-full animate-pulse bg-gray-700 dark:bg-gray-400" />
          </div>
        )}

        <div className="flex justify-center">
          <div className="w-full md:w-1/2">
            <UploadTypeCard
              icon={FiFileText}
              title="PDF Document"
              description="Upload patent as a PDF file"
              isActive
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key="patent-pdf" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4 pt-4">
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive && !isDragReject ? 'border-gray-700 bg-gray-50 dark:bg-gray-900/50' : isDragReject ? 'border-red-500 bg-red-50' : 'border-gray-300 dark:border-gray-600'}`}>
              <input {...getInputProps()} />
              <FiUpload className={`w-12 h-12 mx-auto mb-4 ${isDragReject ? 'text-red-400' : 'text-gray-400'}`} />
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                {isDragReject ? 'Invalid file type' : 'Upload PDF'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">Drag & drop or click to browse</p>
            </div>
            <AnimatePresence>
              {uploadedFile && <FileDisplay file={uploadedFile} onRemove={() => setUploadedFile(null)} />}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        <button
          onClick={() => {
            // track Cutom Video Generation (here only upload)
            track('Cutom Video Generation Selected', {
              doc_type: 'patent',
              source: 'pdf',
              conversion_choice: 'custom',
              file_name: uploadedFile?.name || null
            });
            handleSubmit();
          }}
          disabled={processing || !uploadedFile}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors"
        >
          {processing ? <><LoadingSpinner size="sm" /> Uploading...</> : <><FiCheck className="w-5 h-5" /> Upload PDF</>}
        </button>

        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <div className="flex items-start gap-3">
            <FiAlertCircle className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1 text-gray-900 dark:text-white">Upload Guidelines</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>PDF Upload:</strong> For best results, ensure the PDF contains selectable text, not scanned images.</li>
                <li>All documents are processed securely and are not stored permanently.</li>
              </ul>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
};

export default PatentUpload;
