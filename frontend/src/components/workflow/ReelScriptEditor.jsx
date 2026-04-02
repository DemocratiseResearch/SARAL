import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiSave, FiX } from "react-icons/fi";
import toast from '../../services/toastService';
import { apiService } from "../../services/api";
import LoadingSpinner from "../common/LoadingSpinner";

const ReelScriptEditor = ({ paperId, initialScript, onSave, onCancel }) => {
  const [script, setScript] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Fetch current script on component mount
  useEffect(() => {
    const fetchCurrentScript = async () => {
      try {
        setIsLoading(true);
        setFetchError(false);
        console.log(
          "[ReelScriptEditor] Fetching current script for paperId:",
          paperId
        );

        const response = await apiService.reel.getScript(paperId);
        const scriptData = response?.data?.script || [];

        console.log("[ReelScriptEditor] Fetched script:", scriptData);
        setScript(scriptData);
        setIsLoading(false);
      } catch (error) {
        console.error("[ReelScriptEditor] Error fetching script:", error);
        setFetchError(true);
        setIsLoading(false);
        toast.error("Failed to load current script");
      }
    };

    if (paperId) {
      fetchCurrentScript();
    }
  }, [paperId]);

  const handleDialogueChange = (idx, newDialogue) => {
    const updated = [...script];
    updated[idx] = { ...updated[idx], dialogue: newDialogue };
    setScript(updated);
  };

  const handleSave = async () => {
    // Validate all dialogues are non-empty
    if (!script.every((line) => line.dialogue && line.dialogue.trim())) {
      toast.error("All dialogues must be non-empty");
      return;
    }

    setIsSaving(true);
    try {
      console.log("[ReelScriptEditor] Saving script with payload:", { script });

      // Call API with exact format it expects
      await apiService.reel.updateScript(paperId, script);

      console.log("[ReelScriptEditor] Script saved successfully");
      toast.success("Script updated successfully!");
      onSave(script);
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to update script";
      console.error("[ReelScriptEditor] Save error:", error);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto pt-20 px-4 pb-20">
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="text-gray-500 mt-4">Loading script for editing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !script.length) {
    return (
      <div className="max-w-2xl mx-auto pt-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 p-10 rounded-xl text-center border"
        >
          <h2 className="text-xl font-semibold mb-2 text-red-600">
            Failed to Load Script
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Could not fetch the script for editing. Please try again.
          </p>
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    );
  }

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
            Edit Script
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Modify the dialogues as needed. Each character must have non-empty
            dialogue.
          </p>
        </div>

        {/* Script Editor */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <div className="p-6 space-y-4">
              {script.map((line, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`p-4 rounded-lg border space-y-3 ${
                    line.character === "Aisha" || line.character === "Person1"
                      ? "bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-500"
                      : "bg-white dark:bg-gray-700 border-gray-200 dark:border-slate-400"
                  }`}
                >
                  <div
                    className={`text-sm font-semibold ${
                      line.character === "Aisha" || line.character === "Person2"
                        ? "text-gray-500 dark:text-gray-400"
                        : "text-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {line.character}
                  </div>
                  <textarea
                    value={line.dialogue}
                    onChange={(e) => handleDialogueChange(idx, e.target.value)}
                    placeholder="Enter dialogue..."
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-500 min-h-[100px] resize-none"
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

export default ReelScriptEditor;