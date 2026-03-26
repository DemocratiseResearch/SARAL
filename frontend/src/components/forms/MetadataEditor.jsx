import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiSave, FiEdit3, FiDownload, FiCheck } from "react-icons/fi";
import { useWorkflow } from "../../contexts/WorkflowContext";
import { useApi } from "../../hooks/useApi";
import { apiService } from "../../services/api";
import toast from "../../services/toastService";
import LoadingSpinner from "../common/LoadingSpinner";
import Analytics from "../../lib/analytics";

const MetadataField = ({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  multiline = false,
}) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {multiline ? (
      <textarea
        value={value || ""}
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
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                   border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-gray-700"
        placeholder={placeholder}
      />
    )}
  </div>
);

const MetadataEditor = () => {
  const { paperId, metadata, setMetadata, progressToNextStep } = useWorkflow();
  const { loading, execute } = useApi();
  const [editedMetadata, setEditedMetadata] = useState(metadata || {});
  const [hasChanges, setHasChanges] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    setEditedMetadata(metadata || {});
  }, [metadata]);

  useEffect(() => {
    const changed = JSON.stringify(editedMetadata) !== JSON.stringify(metadata);
    setHasChanges(changed);
  }, [editedMetadata, metadata]);

  const handleFieldChange = (field, value) => {
    setEditedMetadata((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!paperId) return;

    try {
      await execute(
        () => apiService.updatePaperMetadata(paperId, editedMetadata),
        {
          successMessage: "Metadata updated successfully!",
          showSuccess: true,
        },
      );

      setMetadata(editedMetadata);
      setHasChanges(false);
    } catch (error) {
      // Error handling is done by the execute function
    }
  };

  const handleDownloadPaper = async () => {
    if (!paperId) return;

    setDownloadLoading(true);
    try {
      const response = await apiService.downloadPaperPdf(paperId);
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${editedMetadata.title || "research_paper"}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Paper downloaded successfully!");
      Analytics.track("Downloaded Paper PDF", {
        timestamp: new Date().toISOString(),
        paper_id: paperId,
        file_name: `${editedMetadata.title || "research_paper"}.pdf`,
      });
    } catch (error) {
      try {
        const sourceResponse = await apiService.downloadPaperSource(paperId);
        const blob = new Blob([sourceResponse.data], {
          type: "application/zip",
        });
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
          "download",
          `${editedMetadata.title || "research_paper"}_source.zip`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success("Paper source files downloaded successfully!");
        Analytics.track("Downloaded Paper Source", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          file_name: `${editedMetadata.title || "research_paper"}_source.zip`,
        });
      } catch (sourceError) {
        toast.error("Failed to download paper. The file may not be available.");
      }
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleContinue = () => {
    if (hasChanges) {
      toast.error("Please save your changes before continuing");
      return;
    }
    Analytics.track("Continue to Scripts", {
      timestamp: new Date().toISOString(),
      paper_id: paperId,
    });
    progressToNextStep();
  };

  if (!paperId || !metadata) {
    return (
      <div className="text-center py-12 text-gray-600 dark:text-gray-400">
        <FiEdit3 className="w-16 h-16 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Paper Data Available
        </h3>
        <p>Please upload a paper first to edit its metadata.</p>
      </div>
    );
  }

  const metadataFields = [
    {
      key: "title",
      label: "Paper Title",
      placeholder: "Enter the paper title",
      required: true,
    },
    {
      key: "authors",
      label: "Authors",
      placeholder: "Enter author names (comma-separated)",
      required: false,
    },
    {
      key: "date",
      label: "Publication Date",
      placeholder: "Enter publication date",
      required: false,
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
            Edit Paper Metadata
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Review and edit the paper information
          </p>
        </div>

        <button
          onClick={handleDownloadPaper}
          disabled={downloadLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-md
                     bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
                     text-gray-700 dark:text-gray-300 font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-150"
        >
          {downloadLoading ? (
            <>
              <LoadingSpinner size="sm" />
              Downloading...
            </>
          ) : (
            <>
              <FiDownload className="w-4 h-4" />
              Download Paper
            </>
          )}
        </button>
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

          {/* arXiv ID (read-only if available) */}
          {editedMetadata.arxiv_id && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                arXiv ID
              </label>
              <input
                type="text"
                value={editedMetadata.arxiv_id}
                readOnly
                className="w-full px-3 py-2 border rounded-md
                           bg-gray-50 dark:bg-gray-900
                           border-gray-300 dark:border-gray-600
                           text-gray-500 dark:text-gray-400
                           cursor-not-allowed"
              />
            </div>
          )}
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
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4"
        >
          <p className="text-sm text-orange-700 dark:text-orange-300">
            You have unsaved changes. Please save before continuing to the next
            step.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default MetadataEditor;
