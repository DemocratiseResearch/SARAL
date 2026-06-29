"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Music,
  Share2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore, ARTIFACT_LABELS } from "@/lib/artifact-store";
import { languageDisplayName } from "@/lib/languages";
import { fetchBriefPdf } from "@/lib/business-brief-pdf-cache";
import { usePaperStore } from "@/lib/paper-store";
import PosterPreviewModal from "@/components/modals/poster-preview-modal";
import {
  getReelVideoUrl,
  getVideoUrl,
  triggerPodcastAudioDownload,
  triggerPodcastVideoDownload,
  triggerReelDownload,
  triggerVideoDownload,
} from "@/lib/api";

import { BriefPreview } from "./preview-views/brief-preview";
import { LinkedInShare } from "./preview-views/share-linkedin";
import { PodcastPreview } from "./preview-views/podcast-preview";
import { PresentationPreview } from "./preview-views/presentation-preview";
import { ReelPreview } from "./preview-views/reel-preview";
import { ShareMenu } from "./preview-views/share-menu";
import { SocialPreview } from "./preview-views/social-preview";
import { VideoPreview } from "./preview-views/video-preview";
import { YouTubeShare } from "./preview-views/share-youtube";
import { Switch } from "../ui/switch";

type ModalView = "preview" | "share-menu" | "share-youtube" | "share-linkedin";

export default function PreviewModal() {
  const {
    artifacts,
    selectedArtifactId,
    previewModalOpen,
    previewSocialTab,
    previewInitialView,
    closePreviewModal,
  } = useArtifactStore();
  const { metadata } = usePaperStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [view, setView] = useState<ModalView>("preview");
  const containerRef = useRef<HTMLDivElement>(null);

  // GCS presigned URL for video/reel preview — fetched fresh each time the modal opens
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  // Subtitle toggle. Persisted in localStorage so the user's choice
  // sticks across sessions/papers. Default OFF — subs only appear when
  // explicitly turned on. Drives BOTH the player source and the download
  // URL: if on, gateway serves the burned-subs variant for both.
  const [subsOn, setSubsOn] = useState(false);
  // Mirrors the live <video> playback state. `PreviewArtifactVideo` keeps
  // it in sync via its `playbackStateRef` prop. We snapshot from this
  // *before* the toggle flips so the new src can resume from the same
  // position + play state.
  const videoPlaybackRef = useRef<{ seconds: number; autoplay: boolean }>({
    seconds: 0,
    autoplay: false,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSubsOn(window.localStorage.getItem("saral_video_subs") === "on");
  }, []);
  const updateSubsOn = useCallback((next: boolean) => {
    // Capture current playback state into the store as `previewVideoResume`
    // BEFORE flipping the toggle. The toggle flip triggers a videoUrl
    // re-fetch, the new <video src> reload fires `onLoadedMeta`, which
    // reads `previewVideoResume` and seeks + resumes playback.
    const { seconds, autoplay } = videoPlaybackRef.current;
    if (seconds > 0.1) {
      useArtifactStore.setState({
        previewVideoResume: { seconds, autoplay },
      });
    }
    setSubsOn(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("saral_video_subs", next ? "on" : "off");
    }
  }, []);

  // PDF blob URL for business-brief preview — fetched fresh each time modal opens
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Social draft copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [socialDraftTab, setSocialDraftTab] = useState<"linkedin" | "twitter">(
    "linkedin",
  );

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    });
  };

  useEffect(() => {
    if (!previewModalOpen) {
      setView(previewInitialView);
      setVideoUrl(null);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      videoPlaybackRef.current = { seconds: 0, autoplay: false };
      return;
    }
    setView(previewInitialView);

    const a = artifacts.find((x) => x.id === selectedArtifactId);
    if (a?.type === "video" && a.runId) {
      setVideoLoading(true);
      // subsOn drives which variant the gateway serves. The fetch re-runs
      // when the toggle flips so the player swaps source live.
      getVideoUrl(a.runId, { subs: subsOn })
        .then((url) => setVideoUrl(url))
        .catch(() => setVideoUrl(null))
        .finally(() => setVideoLoading(false));
    } else if (a?.type === "reel" && a.runId) {
      setVideoLoading(true);
      getReelVideoUrl(a.runId)
        .then((url) => setVideoUrl(url))
        .catch(() => setVideoUrl(null))
        .finally(() => setVideoLoading(false));
    }

    // Fast path: completeBrief stashed the rendered PDF as a blob: URL on
    // the artifact. Use it directly — no network.
    if (a?.type === "business-brief" && a.pdfBlobUrl) {
      setPdfBlobUrl(a.pdfBlobUrl);
      setPdfLoading(false);
    } else if (a?.type === "business-brief" && a.paperId) {
      setPdfLoading(true);
      fetchBriefPdf(a.paperId)
        .then((blob) => {
          setPdfBlobUrl(URL.createObjectURL(blob));
        })
        .catch(() => {
          setPdfBlobUrl(null);
        })
        .finally(() => {
          setPdfLoading(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModalOpen, previewInitialView, selectedArtifactId, subsOn]);

  useEffect(() => {
    if (!previewModalOpen) return;
    setSocialDraftTab(previewSocialTab === "twitter" ? "twitter" : "linkedin");
  }, [previewModalOpen, selectedArtifactId, previewSocialTab]);

  // Keep isFullscreen in sync with the actual fullscreen state. The user can
  // leave fullscreen via Esc (which doesn't go through toggleFullscreen), so
  // the event is the single source of truth — otherwise the layout would stay
  // stuck in its fullscreen variant.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const artifact = artifacts.find((a) => a.id === selectedArtifactId);
  if (!artifact || artifact.status !== "done") return null;

  // Posters have a dedicated modal with preview + file picker
  if (artifact.type === "poster") {
    return <PosterPreviewModal artifact={artifact} />;
  }

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      if (artifact.type === "podcast") {
        // Primary download for podcasts is video (audio has its own button)
        if (!artifact.runId) throw new Error("No run ID");
        await triggerPodcastVideoDownload(artifact.runId);
      } else if (artifact.type === "reel") {
        if (!artifact.runId) throw new Error("No run ID");
        await triggerReelDownload(artifact.runId);
      } else if (artifact.type === "presentation") {
        const url =
          artifact.slidesPptxUrl ??
          artifact.slidesPdfUrl ??
          artifact.downloadUrl;
        if (!url) throw new Error("No download URL — links may have expired.");
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (artifact.type === "business-brief") {
        // Prefer the blob URL fetched on modal open. If the user clicks
        // Download before that background fetch resolves, fall back to a
        // fresh gateway fetch so the click never fails.
        if (!artifact.paperId) throw new Error("No paper ID");
        let blobSrc = pdfBlobUrl;
        if (!blobSrc) {
          const blob = await fetchBriefPdf(artifact.paperId);
          blobSrc = URL.createObjectURL(blob);
        }
        const a = document.createElement("a");
        a.href = blobSrc;
        a.download = "business-brief.pdf";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Video: stream from /download endpoint with auth header.
        // Honor subtitle toggle — downloaded file matches what's in the
        // player. (Only applies to "video" artifacts; reel/podcast above
        // use their own download paths.)
        if (!artifact.runId) throw new Error("No run ID");
        await triggerVideoDownload(artifact.runId, { subs: subsOn });
      }
    } catch (err) {
      console.error("[preview-modal] Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (isDownloadingAudio || artifact.type !== "podcast") return;
    setIsDownloadingAudio(true);
    try {
      if (!artifact.runId) throw new Error("No run ID");
      await triggerPodcastAudioDownload(artifact.runId);
    } catch (err) {
      console.error("[preview-modal] Audio download failed:", err);
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };



  const goBack = () => {
    if (view === "share-youtube" || view === "share-linkedin") {
      setView("share-menu");
    } else {
      setView("preview");
    }
  };

  return (
    <AnimatePresence>
      {previewModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={closePreviewModal}
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div
              ref={containerRef}
              className={
                isFullscreen
                  ? // Fullscreen: fill the viewport, no width/height caps, and
                    // become a flex column so the preview can grow to fill it.
                    "bg-white dark:bg-carddarkbg w-full h-full flex flex-col overflow-hidden"
                  : `bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-h-[90vh] overflow-y-auto${
                      artifact.type === "business-brief" ||
                      artifact.type === "presentation"
                        ? " max-w-4xl"
                        : artifact.type === "x-linkedin"
                          ? " max-w-2xl"
                          : " max-w-220"
                    }`
              }
            >
              <AnimatePresence mode="wait">
                {/* ── Preview View ──────────────────────────────────────── */}
                {view === "preview" && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className={
                      isFullscreen ? "flex h-full min-h-0 flex-1 flex-col" : ""
                    }
                  >
                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-7 pt-6 pb-5 max-sm:px-5 max-sm:pt-5 max-sm:pb-4 border-b border-[#f0f0f0] dark:bg-carddarkbg dark:border-[#1a1a1a]">
                      <div className="min-w-0 flex-1 max-sm:pr-12">
                        <p className="font-sans text-[12px] max-sm:text-[11px] font-medium text-ink-faint mb-2 tracking-wide">
                          {ARTIFACT_LABELS[artifact.type]} ·{" "}
                          {artifact.type === "presentation"
                            ? artifact.config.presentationOutputFormat ===
                              "beamer_pdf"
                              ? "Beamer PDF"
                              : "PowerPoint"
                            : // Prefer config.language (the value the user
                              // actually picked) when present — video stores the
                              // real language here while leaving audio/textLanguage
                              // hardcoded to "English". Show the slide language too
                              // when it differs from the narration language.
                              artifact.config.language
                              ? artifact.config.slideLanguage &&
                                artifact.config.slideLanguage !==
                                  artifact.config.language
                                ? `${languageDisplayName(artifact.config.language)} / ${languageDisplayName(artifact.config.slideLanguage)}`
                                : languageDisplayName(artifact.config.language)
                              : `${languageDisplayName(artifact.config.audioLanguage)} / ${languageDisplayName(artifact.config.textLanguage)}`}
                        </p>
                        <h2 className="font-sans text-[20px] max-sm:text-[16px] font-semibold text-ink dark:text-white leading-tight line-clamp-3 sm:line-clamp-2">
                          {metadata.title || "Untitled Paper"}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:self-start sm:mr-11">
                        {/* Subtitle toggle — only for video artifacts.
                            Drives BOTH which video the player shows AND
                            what the user gets on download. Default off,
                            persisted per-user in localStorage. */}
                        {artifact.type === "video" && (
                          <label
                            htmlFor="subs-toggle"
                            className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer select-none"
                          >
                            <span className="font-sans text-[12px] font-medium text-ink-muted dark:text-white/70">
                              Subtitles
                            </span>
                            <Switch
                              id="subs-toggle"
                              size="sm"
                              checked={subsOn}
                              onCheckedChange={updateSubsOn}
                            />
                          </label>
                        )}
                        {/* Download button — for podcast shows video download; two separate buttons are below the player */}
                        {artifact.type !== "podcast" &&
                          artifact.type !== "x-linkedin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Download"
                              className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                              disabled={isDownloading}
                              onClick={handleDownload}
                            >
                              {isDownloading ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <Download size={18} />
                              )}
                            </Button>
                          )}
                        {artifact.type !== "x-linkedin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Share"
                            className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                            onClick={() => setView("share-menu")}
                          >
                            <Share2 size={18} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Fullscreen"
                          onClick={toggleFullscreen}
                          className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                        >
                          {isFullscreen ? (
                            <Minimize2 size={18} />
                          ) : (
                            <Maximize2 size={18} />
                          )}
                        </Button>
                      </div>
                      {/* Close button — always top-right of the header */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={closePreviewModal}
                        className="absolute top-5 right-5 sm:top-6 sm:right-7 h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                      >
                        <X size={18} />
                      </Button>
                    </div>

                    {/* ── Media area ── */}
                    {artifact.type === "x-linkedin" ? (
                      <SocialPreview
                        artifact={artifact}
                        socialDraftTab={socialDraftTab}
                        onSocialDraftTabChange={setSocialDraftTab}
                        copiedKey={copiedKey}
                        copyToClipboard={copyToClipboard}
                        onShareLinkedIn={() => setView("share-menu")}
                      />
                    ) : artifact.type === "business-brief" ? (
                      <BriefPreview
                        pdfBlobUrl={pdfBlobUrl}
                        pdfLoading={pdfLoading}
                        isDownloading={isDownloading}
                        onDownload={handleDownload}
                        isFullscreen={isFullscreen}
                      />
                    ) : artifact.type === "presentation" ? (
                      <PresentationPreview
                        artifact={artifact}
                        isFullscreen={isFullscreen}
                      />
                    ) : (
                      <div
                        className={`mx-7 my-6 max-sm:mx-5 max-sm:my-4 dark:bg-carddarkbg rounded-lg overflow-hidden bg-[#1a1a1a] relative flex items-center justify-center ${
                          artifact.type === "reel"
                            ? "h-[min(50vh,480px)] max-sm:h-[min(45vh,400px)]"
                            : // Video/podcast: 16:9 on desktop, but on narrow
                              // phones that frame is too short for the overlay +
                              // control bar — give it a comfortable min height.
                              "aspect-video max-sm:aspect-auto max-sm:h-[min(42vh,320px)]"
                        }`}
                      >
                        {artifact.type === "reel" ? (
                          <ReelPreview
                            videoUrl={videoUrl}
                            videoLoading={videoLoading}
                          />
                        ) : artifact.type === "podcast" ? (
                          <PodcastPreview artifact={artifact} />
                        ) : artifact.type === "video" ? (
                          <VideoPreview
                            videoUrl={videoUrl}
                            videoLoading={videoLoading}
                            playbackStateRef={videoPlaybackRef}
                          />
                        ) : artifact.downloadUrl ? (
                          <video
                            src={artifact.downloadUrl}
                            controls
                            controlsList="nodownload"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <p className="font-sans text-[14px] max-sm:text-[12px] text-ink-faint">
                            Video preview will appear here
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Podcast: download action bar ── */}
                    {artifact.type === "podcast" && (
                      <div className="mx-7 mb-6 max-sm:mx-5 max-sm:mb-4 flex gap-3 max-sm:flex-col">
                        {/* Download Video (only shown if render_video=true) —
                            primary action, filled forest. */}
                        {artifact.podcastVideoUrl && (
                          <Button
                            disabled={isDownloading}
                            onClick={handleDownload}
                            className="h-12 flex-1 gap-2.5 rounded-xl bg-saral-forest font-sans text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#3d4b45] disabled:opacity-60"
                          >
                            {isDownloading ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Download size={18} />
                            )}
                            Download Video
                          </Button>
                        )}
                        {/* Download Audio — secondary outline. */}
                        <Button
                          variant="outline"
                          disabled={isDownloadingAudio}
                          onClick={handleDownloadAudio}
                          className="h-12 flex-1 gap-2.5 rounded-xl border-pill-border bg-white font-sans text-[15px] font-semibold text-ink shadow-sm transition-colors hover:border-saral-forest/40 hover:bg-saral-forest/10 hover:text-saral-forest dark:border-darkcardborder dark:bg-white/5 dark:text-white dark:hover:bg-saral-forest/20 dark:hover:text-white disabled:opacity-60"
                        >
                          {isDownloadingAudio ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Music size={18} />
                          )}
                          Download Audio Only
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Share Menu View ───────────────────────────────────── */}
                {view === "share-menu" && (
                  <ShareMenu
                    artifactType={artifact.type}
                    onBack={goBack}
                    onClose={closePreviewModal}
                    onOpenYouTube={() => setView("share-youtube")}
                    onOpenLinkedIn={() => setView("share-linkedin")}
                  />
                )}

                {/* ── YouTube Share View ────────────────────────────────── */}
                {view === "share-youtube" && (
                  <YouTubeShare
                    artifact={artifact}
                    initialTitle={metadata.title || "Saral Video Presentation"}
                    onBack={goBack}
                    onClose={closePreviewModal}
                    onReturnToPreview={() => setView("preview")}
                  />
                )}

                {/* ── LinkedIn Share View ───────────────────────────────── */}
                {view === "share-linkedin" && (
                  <LinkedInShare
                    artifact={artifact}
                    initialTitle={metadata.title || "Saral Video Presentation"}
                    onBack={goBack}
                    onClose={closePreviewModal}
                    onReturnToPreview={() => setView("preview")}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
