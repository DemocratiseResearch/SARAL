import React, { useEffect, useState, useRef } from "react";
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

const ReelProgress = ({ paperId, onComplete, onError }) => {
  const [stages, setStages] = useState([]);
  const [failed, setFailed] = useState(false);
  const pollingRef = useRef({ cancelled: false });

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    pollingRef.current.cancelled = false;
    const polling = pollingRef.current;

    const fetchProgress = async () => {
      try {
        const finalResp = await pollStatus({
          getStatusFn: apiService.reel.getStatus.bind(apiService.reel),
          paperId,
          isDone: (resp) => {
            const d = resp?.data || {};
            return d.video_ready === true || d.status === "completed";
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
          if (onError) onError(err);
          return null;
        });

        if (!finalResp || finalResp?.data?.status === "failed") {
          setFailed(true);
          if (onError) onError(new Error("Generation failed"));
          return;
        }

        // Success - call onComplete
        if (onComplete) {
          onComplete();
        }
      } catch (err) {
        console.error("Progress polling error:", err);
        setFailed(true);
        if (onError) onError(err);
      }
    };

    fetchProgress();

    return () => {
      polling.cancelled = true;
    };
  }, [paperId, onComplete, onError]);

  return (
    <MediaLoadingPanel
      mode="reel"
      stages={stages}
      externalReady={false}
      failed={failed}
    />
  );
};

export default ReelProgress;