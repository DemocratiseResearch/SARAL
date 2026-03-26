// src/pages/PaperProcessing.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/common/Layout';
import PaperUpload from '../components/forms/PaperUpload';
import PatentUpload from '../components/forms/PatentUpload';
import MetadataEditor from '../components/forms/MetadataEditor';
import PatentMetadataEditor from '../components/forms/PatentMetadataEditor';
import { useWorkflow } from '../contexts/WorkflowContext';
import { FiUpload, FiFileText, FiCheck } from 'react-icons/fi';

const PaperProcessing = () => {
  const { paperId, metadata, documentType } = useWorkflow();
  const [uploadType, setUploadType] = useState('paper');

  const breadcrumbs = [
    { label: 'Document Processing', href: '/paper-processing' }
  ];

  return (
    <Layout title="Document Processing" breadcrumbs={breadcrumbs}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {!paperId ? (
          // UPLOAD: show tabs so user can choose paper or patent upload
          <div className="bg-white dark:bg-neutral-900/50 border border-gray-300 dark:border-gray-600 rounded-md p-6">
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
              <button
                onClick={() => setUploadType('paper')}
                className={`px-4 py-2 text-base font-medium transition-colors duration-150 ${
                  uploadType === 'paper'
                    ? 'border-b-2 border-neutral-700 dark:border-neutral-300 text-neutral-800 dark:text-neutral-200'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Research Paper
              </button>
              <button
                onClick={() => setUploadType('patent')}
                className={`px-4 py-2 text-base font-medium transition-colors duration-150 ${
                  uploadType === 'patent'
                    ? 'border-b-2 border-neutral-700 dark:border-neutral-300 text-neutral-800 dark:text-neutral-200'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Patent
              </button>
            </div>

            <AnimatePresence mode="wait">
              {uploadType === 'paper' ? (
                <motion.div
                  key="paper-upload"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center">
                      <FiUpload className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        Upload Research Paper
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Choose your upload method to get started
                      </p>
                    </div>
                  </div>
                  <PaperUpload />
                </motion.div>
              ) : (
                <motion.div
                  key="patent-upload"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center">
                      <FiFileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        Process Patent
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Choose your upload method to get started
                      </p>
                    </div>
                  </div>
                  <PatentUpload />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // METADATA: show the correct editor based on documentType
          <div className="bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-600 rounded-md p-6">
            {documentType === 'patent' ? (
              <PatentMetadataEditor />
            ) : (
              <MetadataEditor />
            )}
          </div>
        )}

        {paperId && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <FiCheck className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>Success!</strong> {metadata?.title ? `"${metadata.title}"` : 'Your document'} is ready for the next step.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
};

export default PaperProcessing;
