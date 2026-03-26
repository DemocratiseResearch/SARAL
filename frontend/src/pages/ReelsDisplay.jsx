import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FiDownload, FiAlertCircle, FiPlus } from "react-icons/fi";
import { apiService } from "../services/api";
import { useWorkflow } from "../contexts/WorkflowContext";
import toast from '../services/toastService';
import LoadingSpinner from "../components/common/LoadingSpinner";
import VideoPlayer from "../components/workflow/VideoPlayer";
import { pollStatus } from "../utils/poll";
import MediaLoadingPanel from "../components/common/MediaLoadingPanel";
import Layout from "../components/common/Layout";

const ReelDisplay = () => {
  const { paperId: ctxPaperId, setPaperId: setCtxPaperId } = useWorkflow();
  const [paperId, setPaperId] = useState(ctxPaperId || null);

  const [streamUrl, setStreamUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stages, setStages] = useState([]);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const pollingRef = useRef({ cancelled: false });

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* -------------------- PAPER ID -------------------- */
  useEffect(() => {
    if (!paperId) {
      const stored = sessionStorage.getItem("paperId");
      if (stored) {
        setPaperId(stored);
        try { setCtxPaperId(stored); } catch (_) {}
      }
    }
  }, [paperId, setCtxPaperId]);

  /* -------------------- FETCH REEL -------------------- */
  useEffect(() => {
    pollingRef.current.cancelled = false;

    const normalizeStage = (s) => {
      if (!s) return null;
      if (typeof s === "string") return { name: s, status: "" };
      return {
        name: s.name || s.stage || s.step || "…",
        status: s.status || s.state || "",
      };
    };

    const extractStages = (resp) => {
      const d = resp?.data || {};
      const lists = [d.stages, d.pipeline, d.steps, d.progress?.stages];
      for (const list of lists) {
        if (Array.isArray(list) && list.length) {
          return list.map(normalizeStage);
        }
      }
      if (d.stage || d.status) return [normalizeStage(d)];
      return [];
    };

    const fetchReel = async () => {
      if (!paperId) {
        setFailed(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFailed(false);

      try {
        const initial = await apiService.getReelStatus(paperId).catch(() => null);
        setStages(extractStages(initial));

        if (!initial || initial?.data?.status === "failed") {
          setFailed(true);
          setIsLoading(false);
          return;
        }

        const finalResp = await pollStatus({
          getStatusFn: apiService.getReelStatus.bind(apiService),
          paperId,
          isDone: (resp) => {
            const d = resp?.data || {};
            return d.video_ready === true || d.status === "completed";
          },
          onPending: () => {
            if (pollingRef.current.cancelled) throw new Error("cancelled");
          },
          intervalMs: 2000,
          maxAttempts: 90,
        }).catch(() => null);

        if (!finalResp || finalResp?.data?.status === "failed") {
          setFailed(true);
          setIsLoading(false);
          return;
        }

        const stream = apiService.getReelVideoStreamUrl(paperId);
        setStreamUrl(stream);
        toast.success("Reel ready!");
      } catch (err) {
        console.error("Reel error:", err);
        toast.error('Failed to generate reel. Please try again.');
        setFailed(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReel();
    return () => { pollingRef.current.cancelled = true; };
  }, [paperId]);

  /* -------------------- DOWNLOAD -------------------- */
  const handleDownload = async () => {
    if (!paperId) return;
    setDownloadLoading(true);
    try {
      const res = await fetch(apiService.getReelDownloadUrl(paperId));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reel_${paperId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download completed!");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloadLoading(false);
    }
  };

  const breadcrumbs = [{ label: "Reel Generation", href: "/reel-display" }];

  /* -------------------- LOADING -------------------- */
  if (isLoading) {
    return (
      <Layout breadcrumbs={breadcrumbs}>
        <MediaLoadingPanel
          mode="reel"
          stages={stages}
          externalReady={!!streamUrl}
          failed={failed}
        />
      </Layout>
    );
  }

  /* -------------------- FAILED -------------------- */
  if (failed || !streamUrl) {
    return (
      <Layout breadcrumbs={breadcrumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border text-center"
          >
            <FiAlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">No Reel Available</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please generate a reel.
            </p>
            <button
              onClick={() => (window.location.href = "/paper-processing")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
            >
              <FiPlus /> Create New
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  /* -------------------- SUCCESS -------------------- */
  return (
    <Layout breadcrumbs={breadcrumbs}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <h2 className="text-2xl font-semibold">Generated Reel</h2>
          <button
            onClick={() => (window.location.href = "/paper-processing")}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            <FiPlus /> Create New
          </button>
        </motion.div>

        {/* Video Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 rounded-xl p-6 border space-y-6"
        >
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <VideoPlayer src={streamUrl} />
          </div>

          <button
            onClick={handleDownload}
            disabled={downloadLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium disabled:opacity-50"
          >
            {downloadLoading ? (
              <>
                <LoadingSpinner size="sm" /> Downloading…
              </>
            ) : (
              <>
                <FiDownload /> Download Reel
              </>
            )}
          </button>
        </motion.div>
      </div>
    </Layout>
  );
};

export default ReelDisplay;