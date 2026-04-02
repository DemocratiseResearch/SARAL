// src/components/common/MediaLoadingPanel.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import LoadingSpinner from "./LoadingSpinner";
import { FiClock, FiCheck } from "react-icons/fi";

const formatEta = (sec) => {
  if (sec <= 0) return "Almost there";
  if (sec <= 30) return `≈ ${sec}s`;
  const minutes = Math.ceil(sec / 60);
  return `< ${minutes} min`;
};

const isActive = (s) =>
  ["running", "processing", "active", "in_progress"].includes(
    String(s || "").toLowerCase()
  );

const isDone = (s) =>
  ["completed", "success", "done", "finished"].includes(
    String(s || "").toLowerCase()
  );

const MediaLoadingPanel = ({
  mode = "reel",
  capSeconds = 120,
  stages = [],
  externalReady = false,
  failed = false,
}) => {
  const [elapsed, setElapsed] = useState(1000);

  useEffect(() => {
    if (failed || externalReady) return;

    const start = Date.now();
    const cap = capSeconds * 1000;

    const id = setInterval(() => {
      const diff = Date.now() - start;
      setElapsed(Math.min(diff, cap));
    }, 300);

    return () => clearInterval(id);
  }, [capSeconds, failed, externalReady]);

  const progress =
    failed || externalReady
      ? 100
      : Math.round((elapsed / (capSeconds * 1000)) * 100);

  const remaining =
    failed || externalReady
      ? 0
      : Math.max(0, Math.round((capSeconds * 1000 - elapsed) / 1000));

  const header =
    mode === "reel"
      ? "Generating Your Reel"
      : mode === "podcast"
      ? "Generating Your Podcast"
      : "Processing";

  const description =
    mode === "reel"
      ? "Creating an engaging short-form video from your paper"
      : mode === "podcast"
      ? "Creating an engaging podcast discussion from your paper"
      : "Processing your content";

  return (
    <div className="max-w-3xl mx-auto pt-5 space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-8 border border-neutral-200 dark:border-neutral-700 shadow-sm"
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            {header}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span className="flex items-center gap-2">
              <FiClock className="w-4 h-4" />
              Estimated Time Remaining
            </span>
            <span className="font-medium">{formatEta(remaining)}</span>
          </div>

          <div className="h-2 w-full bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gray-900 dark:bg-gray-600"
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeInOut", duration: 0.3 }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>{progress}% complete</span>
            <span>This usually takes under 2 minutes</span>
          </div>
        </div>

        {/* Stage Progress */}
        {stages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Processing Steps
            </h3>
            
            {stages.map((stage, idx) => {
              const active = isActive(stage.status);
              const done = isDone(stage.status);

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded-md transition-colors duration-150 ${
                    active
                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      : done
                      ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                      : "bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done
                        ? "bg-green-500"
                        : active
                        ? "bg-blue-500"
                        : "bg-gray-300 dark:bg-neutral-700"
                    }`}
                  >
                    {done ? (
                      <FiCheck className="w-4 h-4 text-white" />
                    ) : active ? (
                      <LoadingSpinner size="xs" />
                    ) : (
                      <span className="text-xs font-medium text-white">
                        {idx + 1}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        active || done
                          ? "text-gray-900 dark:text-white"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {stage.name}
                    </p>
                    {stage.status && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {stage.status}
                      </p>
                    )}
                  </div>

                  {done && (
                    <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-xs font-medium text-green-700 dark:text-green-400">
                      Complete
                    </div>
                  )}
                  {active && (
                    <div className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-xs font-medium text-blue-700 dark:text-blue-400">
                      Processing
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info Message */}
        {/* {!failed && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>Tip:</strong> Your content is being generated using advanced AI. 
              The process typically completes in 1-2 minutes. Please don't close this tab.
            </p>
          </div>
        )} */}
      </motion.div>
    </div>
  );
};

export default MediaLoadingPanel;