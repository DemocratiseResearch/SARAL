import React from 'react';
import { motion } from 'framer-motion';
import Layout from '../components/common/Layout';
import PaperUpload from '../components/forms/PaperUpload';
import MetadataEditor from '../components/forms/MetadataEditor';
import ComplexityModeSelector from '../components/workflow/ComplexityModeSelector';
import { useWorkflow } from '../contexts/WorkflowContext';
import { FiUpload, FiEdit3, FiSettings } from 'react-icons/fi';

const PaperProcessing = () => {
  const { paperId, metadata, complexityMode, setComplexityMode } = useWorkflow();
  
  const breadcrumbs = [
    { label: 'Paper Processing', href: '/paper-processing' }
  ];

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {!paperId ? (
          <div className="bg-white dark:bg-neutral-800 border border-gray-300 dark:border-gray-600 rounded-md p-6">
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
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-600 rounded-md p-6">
              <MetadataEditor />
            </div>

            {/* Complexity Mode Selector */}
            <div className="bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-600 rounded-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center">
                  <FiSettings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Presentation Settings
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure how your content will be generated
                  </p>
                </div>
              </div>
              <ComplexityModeSelector
                selectedMode={complexityMode}
                onModeChange={setComplexityMode}
              />
            </div>
          </>
        )}

        {/* Processing Status */}
        {paperId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.15 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
              <div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {metadata?.title ? `"${metadata.title}"` : 'Your paper'} has been uploaded and is ready for script generation.
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