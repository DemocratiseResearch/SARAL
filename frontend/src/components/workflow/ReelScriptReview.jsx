import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { FiChevronRight, FiEdit2 } from "react-icons/fi";
import { apiService } from "../../services/api";
import { pollStatus } from "../../utils/poll";
import MediaLoadingPanel from "../common/MediaLoadingPanel";

const extractStages = (resp) => {
  const d = resp?.data || {};

  const normalizeStage = (s) => {
    if (!s) return null;
    if (typeof s === "string") return { name: s, status: "" };
    return {
      name: s.name || s.stage || s.title || s.step || "…",
      status: s.status || s.state || s.status_message || s.phase || "",
    };
  };

  const lists = [d.stages, d.pipeline, d.steps, d.progress?.stages];

  for (const list of lists) {
    if (Array.isArray(list) && list.length > 0) {
      return list.map(normalizeStage);
    }
  }

  if (d.stage || d.status || d.name) {
    return [normalizeStage(d)];
  }

  return [];
};

const ReelScriptReview = ({
  paperId,
  script: preloadedScript,
  onEdit,
  onNext,
  onError,
}) => {
  const [script, setScript] = useState(preloadedScript || []);
  const [isLoading, setIsLoading] = useState(!preloadedScript);
  const [stages, setStages] = useState([]);
  const [failed, setFailed] = useState(false);
  const pollingRef = useRef({ cancelled: false });

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    // If script is preloaded (from editing), skip polling and just display it
    if (preloadedScript && preloadedScript.length > 0) {
      console.log(
        "[ReelScriptReview] Using preloaded script:",
        preloadedScript
      );
      setScript(preloadedScript);
      setIsLoading(false);
      return;
    }

    // Otherwise, poll for script generation
    pollingRef.current.cancelled = false;
    const polling = pollingRef.current;

    const fetchScript = async () => {
      try {
        console.log("[ReelScriptReview] Polling for script generation...");
        // First, poll until script is ready
        const finalResp = await pollStatus({
          getStatusFn: apiService.reel.getStatus.bind(apiService.reel),
          paperId,
          isDone: (resp) => {
            const d = resp?.data || {};
            return d.status === "script_ready" || d.status === "script_edited";
          },
          onPending: (resp) => {
            if (pollingRef.current.cancelled) throw new Error("cancelled");
            const stageList = extractStages(resp);
            setStages(stageList);
          },
          intervalMs: 2000,
          maxAttempts: 60,
        }).catch((err) => {
          setFailed(true);
          return null;
        });

        if (!finalResp || finalResp?.data?.status === "failed") {
          setFailed(true);
          setIsLoading(false);
          return;
        }

        // Now fetch the script
        const scriptResp = await apiService.reel.getScript(paperId);
        const scriptData = scriptResp?.data?.script || [];
        setScript(scriptData);
        setIsLoading(false);
      } catch (err) {
        console.error("Script fetch error:", err);
        setFailed(true);
        setIsLoading(false);
      }
    };

    fetchScript();

    return () => {
      polling.cancelled = true;
    };
  }, [paperId, preloadedScript]);

  // ONLY show MediaLoadingPanel during initial script generation
 if (isLoading) {
  return (
    <div className="max-w-3xl mx-auto pt-5 px-4 pb-20">
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6">
        <div className="flex items-center gap-3">
          {/* Spinner */}
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 dark:border-neutral-600 dark:border-t-white rounded-full animate-spin" />

          {/* Text */}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Generating script…
          </span>
        </div>
      </div>
    </div>
  );
}


  if (failed) {
    return (
      <div className="max-w-2xl mx-auto pt-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 p-10 rounded-xl text-center border"
        >
          <h2 className="text-xl font-semibold mb-2 text-red-600">
            Script Generation Failed
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Something went wrong — please try again.
          </p>
          <button
            onClick={() => (window.location.href = "/paper-processing")}
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
            Review Generated Script
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your reel script has been generated. Review it below or make changes
            if needed.
          </p>
        </div>

        {/* Script Display */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <div className="p-6 space-y-4">
              {script && script.length > 0 ? (
                script.map((line, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`p-4 rounded-lg border ${
                      line.character === "Aisha" || line.character === "Person1"
                        ? "bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-500"
                        : "bg-white dark:bg-gray-600 border-gray-200 dark:border-slate-400"
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold mb-1 ${
                        line.character === "Aisha" || line.character === "Person2"
                          ? "text-gray-500 dark:text-gray-400"
                          : "text-gray-700 dark:text-gray-400"
                      }`}
                    >
                      {line.character}
                    </div>
                    <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                      {line.dialogue}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No script generated
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium transition-colors"
          >
            <FiEdit2 className="w-5 h-5" />
            Edit Script
          </button>
          <button
            onClick={onNext}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-black dark:bg-slate-800 dark:hover:bg-slate-700 hover:bg-gray-800 text-white font-medium transition-colors"
          >
            Choose Avatars
            <FiChevronRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ReelScriptReview;