// src/pages/PodcastDisplay.jsx
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FiDownload, FiAlertCircle, FiMic, FiArrowRight,FiArrowLeft,FiPlus } from "react-icons/fi";
import { apiService } from "../services/api";
import { useWorkflow } from "../contexts/WorkflowContext";
import toast from '../services/toastService';
import { pollStatus } from "../utils/poll";
import Analytics from "../lib/analytics";
import LoadingSpinner from '../components/common/LoadingSpinner';
import Layout from '../components/common/Layout';
import MediaLoadingPanel from '../components/common/MediaLoadingPanel';

const PodcastDisplay = () => {
  const { paperId: ctxPaperId, setPaperId: setCtxPaperId, progressToNextStep } = useWorkflow();
  const [paperId, setPaperId] = useState(ctxPaperId || null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [stages, setStages] = useState([]);

  const pollingRef = useRef({ cancelled: false });

  useEffect(() => {
    if (!paperId) {
      const stored =
        sessionStorage.getItem("paperId") ||
        sessionStorage.getItem("podcast_paper_id");
      if (stored) {
        setPaperId(stored);
        try { setCtxPaperId(stored); } catch (_) {}
      }
    }
  }, [paperId, setCtxPaperId]);

  useEffect(() => {
    pollingRef.current.cancelled = false;

    const fetchPodcast = async () => {
      if (!paperId) {
        setFailed(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFailed(false);

      const normalizeStage = (s) => {
        if (!s) return null;
        if (typeof s === "string") return { name: s, status: "" };
        return {
          name: s.name || s.stage || s.title || s.step || "…",
          status: s.status || s.state || s.status_message || s.phase || "",
        };
      };

      const extractStages = (resp) => {
        const d = resp?.data || {};
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

      let stageInterval = null;

      try {
        const initial = await apiService.getPodcastStatus(paperId).catch(() => null);
        const stageList = extractStages(initial);
        setStages(stageList);

        if (!initial || initial?.data?.status === "failed") {
          setFailed(true);
          setIsLoading(false);
          return;
        }

        stageInterval = setInterval(async () => {
          if (pollingRef.current.cancelled) return;
          try {
            const sresp = await apiService.getPodcastStatus(paperId);
            const st = extractStages(sresp);
            if (st.length) setStages(st);
          } catch (_) {}
        }, 2000);

        const mediaResp = await apiService.getMediaStatus(paperId).catch(() => null);
        const files = mediaResp?.data?.audio_files || mediaResp?.data?.audio || [];

        if (files.length > 0) {
          const url = apiService.streamPodcastAudio(paperId);
          setStreamUrl(url);
          toast.success("Podcast loaded!");
          return;
        }

        const finalResp = await pollStatus({
          getStatusFn: apiService.getPodcastStatus.bind(apiService),
          paperId,
          isDone: (resp) => {
            const d = resp?.data || {};
            return (
              d.status === "completed" ||
              d.status === "success" ||
              d.audio_ready === true ||
              (Array.isArray(d.audio_files) && d.audio_files.length > 0)
            );
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

        const audioUrl = apiService.streamPodcastAudio(paperId);
        setStreamUrl(audioUrl);
        toast.success("Podcast ready!");
      } catch (err) {
        console.error("[PodcastDisplay] Error", err);
        toast.error('Failed to generate podcast. Please try again.');
        setFailed(true);
      } finally {
        if (stageInterval) clearInterval(stageInterval);
        setIsLoading(false);
      }
    };

    fetchPodcast();

    return () => {
      pollingRef.current.cancelled = true;
    };
  }, [paperId]);

  const handleDownload = async () => {
    if (!paperId) return;
    setDownloadLoading(true);
    try {
      const { data } = await apiService.downloadPodcast(paperId);
      const blob = new Blob([data], { type: 'audio/mpeg' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `podcast_${paperId}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Download completed successfully!');
      
      try {
        Analytics.track('Downloaded Podcast', {
          timestamp: new Date().toISOString(),
          paper_id: paperId
        });
      } catch (e) {}
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloadLoading(false);
    }
  };

  const breadcrumbs = [{ label: 'Podcast Generation', href: '/podcast-display' }];

  if (isLoading) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <MediaLoadingPanel
          mode="podcast"
          stages={stages}
          externalReady={!!streamUrl}
          failed={failed}
        />
      </Layout>
    );
  }

  if (failed || !streamUrl) {
    return (
      <Layout title="" breadcrumbs={breadcrumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border border-neutral-200 dark:border-neutral-700 text-center">
            <FiAlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Podcast Available</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Please generate a podcast.</p>
            <button onClick={() => window.location.href = '/paper-processing'} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors duration-150">
              <FiPlus className="w-4 h-4" /> Create New
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="" breadcrumbs={breadcrumbs}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Generated Podcast</h2>
            {metadata?.title && <p className="text-gray-600 dark:text-gray-400 mt-1">{metadata.title}</p>}
          </div>

          <button onClick={() => window.location.href = '/paper-processing'} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-colors duration-150">
            <FiPlus className="w-4 h-4" /> Create New
          </button>
        </motion.div>

        {/* Audio Player Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6">
          <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
            <div className="w-full max-w-2xl px-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                  <FiMic className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Podcast Audio
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Generated from paper
                  </p>
                </div>
              </div>
              <audio 
                controls 
                className="w-full"
                style={{ 
                  outline: 'none',
                  accentColor: '#111827'
                }}
              >
                <source src={streamUrl} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            </div>
          </div>

          {metadata && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              {metadata.authors && <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium">Authors:</span> {metadata.authors}</p>}
              {metadata.date && <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium">Date:</span> {metadata.date}</p>}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={handleDownload} disabled={downloadLoading} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150 disabled:cursor-not-allowed">
              {downloadLoading ? (<><LoadingSpinner size="sm" /> Downloading...</>) : (<><FiDownload className="w-5 h-5" /> Download Podcast</>)}
            </button>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default PodcastDisplay;