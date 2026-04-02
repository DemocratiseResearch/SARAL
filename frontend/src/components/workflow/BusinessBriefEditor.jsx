import React, { useState, useEffect } from "react";
import { FiSave, FiX } from "react-icons/fi";
import toast from "../../services/toastService";
import { apiService } from "../../services/api";
import LoadingSpinner from "../common/LoadingSpinner";
import { motion } from "framer-motion";

const BusinessBriefEditor = ({ paperId, sections, onSave, onCancel }) => {
  const [editedSections, setEditedSections] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setEditedSections(sections || {});
  }, [sections]);

  const handleSectionChange = (sectionTitle, value) => {
    setEditedSections((prev) => ({ ...prev, [sectionTitle]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Find which sections were changed
      const changedSections = {};
      Object.entries(editedSections).forEach(([key, value]) => {
        if (value !== sections[key]) {
          changedSections[key] = value;
        }
      });

      if (Object.keys(changedSections).length === 0) {
        toast.success("No changes to save");
        onSave(editedSections);
        return;
      }

      await apiService.updateBusinessBriefSections(paperId, changedSections);
      toast.success("Business brief updated successfully!");
      onSave(editedSections);
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to update business brief";
      console.error("[BusinessBriefEditor] Save error:", error);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const sectionEntries = Object.entries(editedSections);

  return (
    <div className="max-w-3xl mx-auto pt-5 px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Edit Business Brief
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Modify the content for each section as needed.
          </p>
        </div>

        {/* Section Editors */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
          <div className="max-h-[700px] overflow-y-auto">
            <div className="p-6 space-y-6">
              {sectionEntries.map(([title, content], idx) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="space-y-2"
                >
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white">
                    {title}
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) =>
                      handleSectionChange(title, e.target.value)
                    }
                    disabled={isSaving}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-500 min-h-[120px] resize-y text-sm leading-relaxed"
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium transition-colors disabled:opacity-50"
          >
            <FiX className="w-5 h-5" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-black dark:bg-slate-800 dark:hover:bg-slate-700 hover:bg-gray-800 text-white font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <LoadingSpinner size="sm" />
                Saving...
              </>
            ) : (
              <>
                <FiSave className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BusinessBriefEditor;
