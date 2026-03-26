import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiEdit3, FiCheck } from 'react-icons/fi';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { useApi } from '../../hooks/useApi';
import { apiService } from '../../services/api';
import toast from '../../services/toastService';
import LoadingSpinner from '../common/LoadingSpinner';
import Analytics from '../../lib/analytics';

const MetadataField = ({ label, value, onChange, placeholder, required = false, multiline = false }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {multiline ? (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                   border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-gray-700 min-h-[100px] resize-y"
        placeholder={placeholder}
        rows={4}
      />
    ) : (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                   border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-gray-700"
        placeholder={placeholder}
      />
    )}
  </div>
);

const PatentMetadataEditor = () => {
  const { paperId, metadata, setMetadata, progressToNextStep, documentType  } = useWorkflow();
  // console.log("Metadata in documenttype:", documentType);
  const { loading, execute } = useApi();
  const [editedMetadata, setEditedMetadata] = useState(metadata || {});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setEditedMetadata(metadata || {});
  }, [metadata]);

  useEffect(() => {
    const changed = JSON.stringify(editedMetadata) !== JSON.stringify(metadata);
    setHasChanges(changed);
  }, [editedMetadata, metadata]);

  const handleFieldChange = (field, value) => {
    setEditedMetadata(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!paperId) return;

    try {
      await execute(() => apiService.updatePatentMetadata(paperId, editedMetadata, documentType), {
        successMessage: 'Patent metadata updated successfully!',
        showSuccess: true
      });
      
      setMetadata(editedMetadata);
      setHasChanges(false);
    } catch (error) {
      // Error handling is done by the useApi hook
    }
  };

  const handleContinue = () => {
    if (hasChanges) {
      toast.error('Please save your changes before continuing');
      return;
    }
    Analytics.track('Continue to Scripts', { timestamp: new Date().toISOString(), paper_id: paperId, doc_type: documentType });
    progressToNextStep();
  };

  if (!paperId || !metadata) {
    return (
      <div className="text-center py-12 text-gray-600 dark:text-gray-400">
        <FiEdit3 className="w-16 h-16 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Patent Data Available
        </h3>
        <p>Please select a patent first to edit its metadata.</p>
      </div>
    );
  }

  const metadataFields = [
    {
      key: 'title',
      label: 'Patent Title',
      placeholder: 'Enter the patent title',
      required: true
    },
    {
      key: 'patent_id',
      label: 'Patent ID / Number',
      placeholder: 'e.g., US20220123456A1 or 11223344',
      required: true
    },
    {
      key: 'inventors',
      label: 'Inventors',
      placeholder: 'Enter inventor names (comma-separated)',
      required: false
    },
    {
      key: 'assignee',
      label: 'Assignee',
      placeholder: 'Enter the assignee name (company or individual)',
      required: false
    },
    {
      key: 'publication_date',
      label: 'Publication Date',
      placeholder: 'Enter publication date (e.g., YYYY-MM-DD)',
      required: false
    },
  ];

  const canSave = hasChanges && !loading;
  const canContinue = !hasChanges;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Edit Patent Metadata
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Review and edit the patent information
          </p>
        </div>
      </div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6
                   border border-neutral-200 dark:border-neutral-700 space-y-6"
      >
        {/* Progress Bar */}
        {loading && (
          <div className="h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4">
            <div className="h-full w-full animate-pulse bg-gray-700 dark:bg-gray-400" />
          </div>
        )}

        {/* Form Fields */}
        <div className="grid grid-cols-1 gap-6">
          {metadataFields.map((field) => (
            <MetadataField
              key={field.key}
              label={field.label}
              value={editedMetadata[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              placeholder={field.placeholder}
              required={field.required}
              multiline={field.multiline}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                       rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400
                       text-white font-medium transition-colors duration-150
                       disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Saving…
              </>
            ) : (
              <>
                <FiSave className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>

          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                       rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400
                       text-white font-medium transition-colors duration-150
                       disabled:cursor-not-allowed"
          >
            <FiCheck className="w-4 h-4" />
            Continue to Scripts
          </button>
        </div>
      </motion.div>

      {/* Status Messages */}
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4"
        >
          <p className="text-sm text-orange-700 dark:text-orange-300">
            You have unsaved changes. Please save before continuing to the next step.
          </p> 
        </motion.div>
      )}
    </div>
  );
};

export default PatentMetadataEditor;