import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiKey, FiSkipForward, FiInfo } from 'react-icons/fi';
import { useWorkflow } from '../contexts/WorkflowContext';
import ApiSetupForm from './ApiSetupForm';
import Layout from '../components/common/Layout';

const ApiSetup = () => {
  const [showForm, setShowForm] = useState(false);
  const { progressToNextStep } = useWorkflow();

  const crumbs = [{ label: 'API Setup', href: '/api-setup' }];

  return (
    <Layout breadcrumbs={crumbs}>
      <div className="max-w-3xl mx-auto space-y-8">
        {showForm ? (
          <ApiSetupForm />
        ) : (
          <>
            {/* Strong banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 
                         rounded-r-lg p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <FiInfo className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-blue-800 dark:text-blue-200 font-medium">
                    <strong>Note:</strong> API keys are optional but recommended for best experience.
                    You can always configure them later in the settings.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* setup card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-neutral-800 rounded-xl p-6
                         border border-neutral-200 dark:border-neutral-700 space-y-6">

              {/* icon section */}
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl 
                               flex items-center justify-center mx-auto mb-4">
                  <FiKey className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  You can configure these now or skip this step and set them up later.
                </p>
              </div>

              {/* action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowForm(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                             rounded-md bg-gray-900 hover:bg-gray-800
                             text-white font-medium transition-colors duration-150">
                  <FiKey className="w-5 h-5" />
                  Configure API Keys
                </button>

                <button
                  onClick={progressToNextStep}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                             rounded-md border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800
                             text-gray-900 dark:text-gray-100 font-medium 
                             transition-colors duration-150">
                  <FiSkipForward className="w-5 h-5" />
                  Skip for Now
                </button>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default ApiSetup;
