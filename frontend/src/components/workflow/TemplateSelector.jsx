import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheck } from 'react-icons/fi';
import toast from '../../services/toastService';
import template1Img from '../../images/template1.png';
import template2Img from '../../images/template2.jpg';

const TemplateSelector = ({ isOpen, onClose, onSelectTemplate, isLoading }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const templates = [
    {
      id: 'template1',
      name: 'Template 1',
      image: template1Img,
    },
    {
      id: 'template2',
      name: 'Template 2',
      image: template2Img,
    },
  ];

  const handleSelectTemplate = () => {
    if (!selectedTemplate) {
      toast.error('Please select a template');
      return;
    }
    onSelectTemplate(selectedTemplate);
    setSelectedTemplate(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  Select PowerPoint Template
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                  Choose a template design for your presentation
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                disabled={isLoading}
              >
                <FiX className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
              </button>
            </div>

            {/* Template Options */}
            <div className="p-6 space-y-4">
              {templates.map((template) => (
                <motion.div
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`relative p-6 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-700/50'
                  }`}
                >
                  <div className="flex items-center gap-6">
                    {/* Template Preview - Larger with proper aspect ratio */}
                    <div className="flex-shrink-0">
                      <img
                        src={template.image}
                        alt={template.name}
                        className="h-40 w-auto rounded-lg overflow-hidden shadow-md border border-neutral-200 dark:border-neutral-600 object-contain"
                      />
                    </div>

                    {/* Template Info */}
                    <div className="flex-1 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        {template.name}
                      </h3>
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedTemplate === template.id
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {selectedTemplate === template.id && (
                          <FiCheck className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 p-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 font-medium rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSelectTemplate}
                disabled={!selectedTemplate || isLoading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FiCheck className="w-4 h-4" />
                    Generate PPT
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TemplateSelector;
