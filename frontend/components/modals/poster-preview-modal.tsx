"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  Loader2,
  Share2,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  File as FileIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useArtifactStore,
  ARTIFACT_LABELS,
  type Artifact,
} from "@/lib/artifact-store";
import { usePaperStore } from "@/lib/paper-store";
import { fetchPosterZip } from "@/lib/poster-zip-cache";
import { usePdfFirstPage } from "@/lib/use-pdf-first-page";
import { cn } from "@/lib/utils";
import { ShareMenu } from "./preview-views/share-menu";
import { LinkedInShare } from "./preview-views/share-linkedin";

// Poster has no YouTube target (not in the share-menu's YOUTUBE_TYPES), so the
// only platform view it reaches is LinkedIn.
type PosterModalView = "preview" | "share-menu" | "share-linkedin";

type JSZipInstance = Awaited<ReturnType<(typeof import("jszip"))["loadAsync"]>>;

interface PosterFile {
  name: string;
  size: number;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf")
    return <FileText size={16} className="text-saral-forest" />;
  if (["tex", "bib", "cls", "sty"].includes(ext))
    return <FileCode size={16} className="text-saral-gold" />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext))
    return <FileImage size={16} className="text-saral-plum" />;
  if (["zip", "tar", "gz"].includes(ext))
    return (
      <FileArchive size={16} className="text-ink-muted dark:text-white/60" />
    );
  return <FileIcon size={16} className="text-ink-muted dark:text-white/60" />;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PosterPreviewModal({
  artifact,
}: {
  artifact: Artifact;
}) {
  const { previewModalOpen, closePreviewModal } = useArtifactStore();
  const { metadata } = usePaperStore();

  const [view, setView] = useState<PosterModalView>("preview");
  const [tab, setTab] = useState<"preview" | "files">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset to the preview view whenever the modal (re)opens, so a previously
  // left-open share view doesn't persist into the next poster.
  useEffect(() => {
    if (previewModalOpen) setView("preview");
  }, [previewModalOpen]);

  const [files, setFiles] = useState<PosterFile[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const zipRef = useRef<JSZipInstance | null>(null);

  // Load ZIP, list files, extract PDF for preview
  useEffect(() => {
    if (!previewModalOpen) return;
    setLoading(true);
    setError(null);
    setFiles(null);
    setPdfBlob(null);
    zipRef.current = null;

    const runId = artifact.runId;
    const fallbackUrl = artifact.downloadUrl;
    let cancelled = false;

    fetchPosterZip(runId, fallbackUrl)
      .then(({ zip, pdfBlob }) => {
        if (cancelled) return;
        const entries = Object.values(zip.files)
          .filter((f) => !f.dir)
          .map((f) => ({
            name: f.name,
            size:
              (f as unknown as { _data?: { uncompressedSize?: number } })._data
                ?.uncompressedSize ?? 0,
          }))
          .sort((x, y) => x.name.localeCompare(y.name));
        zipRef.current = zip;
        setFiles(entries);
        setSelected(new Set(entries.map((f) => f.name)));
        if (pdfBlob) setPdfBlob(pdfBlob);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[PosterPreviewModal] zip load failed:", err);
        setError("Couldn't read the poster ZIP.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewModalOpen, artifact.runId, artifact.downloadUrl]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const onToggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const onToggleAll = () =>
    setSelected((prev) => {
      if (!files) return prev;
      if (prev.size === files.length) return new Set();
      return new Set(files.map((f) => f.name));
    });

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const zip = zipRef.current;
      if (!zip) {
        if (!artifact.downloadUrl) throw new Error("No download URL");
        const a = document.createElement("a");
        a.href = artifact.downloadUrl;
        a.download = "poster.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const picks = Array.from(selected);
      if (picks.length === 0) return;

      if (picks.length === 1) {
        const name = picks[0];
        const f = zip.file(name);
        if (!f) throw new Error(`file not found: ${name}`);
        const blob = await f.async("blob");
        triggerBlobDownload(blob, name.split("/").pop() || name);
      } else {
        const { default: JSZip } = await import("jszip");
        const out = new JSZip();
        for (const name of picks) {
          const f = zip.file(name);
          if (!f) continue;
          out.file(name, await f.async("uint8array"));
        }
        const blob = await out.generateAsync({ type: "blob" });
        triggerBlobDownload(blob, "poster.zip");
      }
    } catch (err) {
      console.error("[PosterPreviewModal] download failed:", err);
    } finally {
      setIsDownloading(false);
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
              className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            >
              <AnimatePresence mode="wait">
                {view === "preview" && (
                  <motion.div
                    key="poster-preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-7 pt-6 pb-5 max-sm:px-5 max-sm:pt-5 max-sm:pb-4 border-b border-[#f0f0f0] dark:border-darkcardborder">
                <div className="min-w-0 flex-1 max-sm:pr-12">
                  <p className="font-sans text-[12px] max-sm:text-[11px] font-medium text-ink-faint mb-2 tracking-wide">
                    {ARTIFACT_LABELS[artifact.type]} ·{" "}
                    {`${artifact.config.audioLanguage} / ${artifact.config.textLanguage}`}
                  </p>
                  <h2 className="font-sans text-[20px] max-sm:text-[16px] font-semibold text-ink dark:text-white leading-tight line-clamp-3 sm:line-clamp-2">
                    {metadata.title || "Untitled Paper"}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0 sm:self-start sm:mr-11">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Download"
                    className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                    disabled={isDownloading || selected.size === 0}
                    onClick={handleDownload}
                  >
                    {isDownloading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Share"
                    className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted dark:text-white/70 hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
                    onClick={() => setView("share-menu")}
                  >
                    <Share2 size={18} />
                  </Button>
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

              <div className="mx-7 my-6 max-sm:mx-5 max-sm:my-4">
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as "preview" | "files")}
                >
                  <TabsList className="mb-5 w-full rounded-cta border border-pill-border bg-linen/60 p-1 dark:border-darkcardborder dark:bg-white/[0.04]">
                    <TabsTrigger
                      value="preview"
                      className="flex-1 cursor-pointer gap-2 rounded-[9px] font-sans text-[13px] font-medium text-ink-muted transition-all hover:text-ink data-active:bg-white data-active:text-ink data-active:shadow-[0_1px_2px_rgba(27,61,47,0.06),0_0_0_1px_rgba(74,93,85,0.08)] dark:text-white/60 dark:hover:text-white dark:data-active:bg-saral-forest/20 dark:data-active:text-white dark:data-active:shadow-none dark:data-active:border-transparent"
                    >
                      Preview
                    </TabsTrigger>
                    <TabsTrigger
                      value="files"
                      className="flex-1 cursor-pointer gap-2 rounded-[9px] font-sans text-[13px] font-medium text-ink-muted transition-all hover:text-ink data-active:bg-white data-active:text-ink data-active:shadow-[0_1px_2px_rgba(27,61,47,0.06),0_0_0_1px_rgba(74,93,85,0.08)] dark:text-white/60 dark:hover:text-white dark:data-active:bg-saral-forest/20 dark:data-active:text-white dark:data-active:shadow-none dark:data-active:border-transparent"
                    >
                      Files
                      {files ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums transition-colors",
                            tab === "files"
                              ? "bg-saral-forest/10 text-saral-forest dark:bg-white/15 dark:text-white"
                              : "bg-ink/5 text-ink-muted dark:bg-white/10 dark:text-white/60",
                          )}
                        >
                          {files.length}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview">
                    <PosterPdfPreview
                      blob={pdfBlob}
                      loading={loading}
                      error={error}
                    />
                  </TabsContent>

                  <TabsContent value="files">
                    <PosterFileList
                      files={files}
                      loading={loading}
                      error={error}
                      selected={selected}
                      onToggle={onToggle}
                      onToggleAll={onToggleAll}
                      isDownloading={isDownloading}
                      onDownload={handleDownload}
                    />
                  </TabsContent>
                </Tabs>
              </div>
                  </motion.div>
                )}

                {/* ── Share Menu View ───────────────────────────────────── */}
                {view === "share-menu" && (
                  <ShareMenu
                    artifactType={artifact.type}
                    onBack={() => setView("preview")}
                    onClose={closePreviewModal}
                    onOpenYouTube={() => setView("preview")}
                    onOpenLinkedIn={() => setView("share-linkedin")}
                  />
                )}

                {/* ── LinkedIn Share View ───────────────────────────────── */}
                {view === "share-linkedin" && (
                  <LinkedInShare
                    artifact={artifact}
                    initialTitle={metadata.title || "Saral Research Poster"}
                    onBack={() => setView("share-menu")}
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

function PosterPdfPreview({
  blob,
  loading,
  error,
}: {
  blob: Blob | null;
  loading: boolean;
  error: string | null;
}) {
  const { src, failed } = usePdfFirstPage(blob, 720);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2
          size={24}
          className="animate-spin text-ink-muted dark:text-white/50"
        />
        <p className="font-sans text-[13px] text-ink-muted dark:text-white/50">
          Loading poster…
        </p>
      </div>
    );
  }
  if (error || failed || !blob) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 px-8 text-center">
        <p className="font-sans text-[14px] text-ink-muted dark:text-white/70">
          {error ?? "No preview available for this poster."}
        </p>
        <p className="font-sans text-[12px] text-ink-faint">
          Use the Files tab to download individual assets.
        </p>
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2
          size={24}
          className="animate-spin text-ink-muted dark:text-white/50"
        />
        <p className="font-sans text-[13px] text-ink-muted dark:text-white/50">
          Rendering preview…
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-center rounded-cta border border-pill-border dark:border-darkcardborder bg-linen dark:bg-saral-dark/50 p-4 max-sm:p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Poster preview (page 1)"
        className="max-h-[65vh] w-auto rounded-md shadow-sm"
      />
    </div>
  );
}

function PosterFileList({
  files,
  loading,
  error,
  selected,
  onToggle,
  onToggleAll,
  isDownloading,
  onDownload,
}: {
  files: PosterFile[] | null;
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggle: (name: string) => void;
  onToggleAll: () => void;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2
          size={24}
          className="animate-spin text-ink-muted dark:text-white/50"
        />
        <p className="font-sans text-[13px] text-ink-muted dark:text-white/50">
          Reading poster ZIP…
        </p>
      </div>
    );
  }
  if (error || !files) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-8 text-center">
        <p className="font-sans text-[14px] text-ink dark:text-white/80">
          {error ?? "Poster contents unavailable."}
        </p>
        <Button
          size="sm"
          disabled={isDownloading}
          onClick={onDownload}
          className="bg-saral-forest hover:bg-saral-forest/90 text-white rounded-lg gap-2"
        >
          {isDownloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          Download ZIP
        </Button>
      </div>
    );
  }

  const allSelected = selected.size === files.length;
  const someSelected = selected.size > 0;
  const singleSelected = selected.size === 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-[15px] font-semibold text-ink dark:text-white">
            Poster files
          </p>
          <p className="font-sans text-[12px] text-ink-muted dark:text-white/50">
            {selected.size} of {files.length} selected
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          className="cursor-pointer font-sans text-[12px] font-medium text-saral-forest hover:text-ink dark:hover:text-white transition-colors"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto rounded-cta border border-pill-border dark:border-darkcardborder bg-linen/40 dark:bg-white/[0.03]">
        <ul className="divide-y divide-[#ebe8e2] dark:divide-white/5">
          {files.map((f) => {
            const isOn = selected.has(f.name);
            return (
              <li key={f.name}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors",
                    isOn
                      ? "bg-saral-forest/10 dark:bg-saral-forest/15"
                      : "hover:bg-linen-dark dark:hover:bg-white/[0.04]",
                  )}
                >
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={() => onToggle(f.name)}
                    className="border-ink-faint dark:border-white/30 data-checked:border-saral-forest data-checked:bg-saral-forest"
                  />
                  {getFileIcon(f.name)}
                  <span className="flex-1 min-w-0 truncate font-mono text-[12px] text-ink dark:text-white/85">
                    {f.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint dark:text-white/40">
                    {formatFileSize(f.size)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isDownloading || !someSelected}
          onClick={onDownload}
          className="bg-saral-forest hover:bg-saral-forest/90 text-white rounded-lg gap-2"
        >
          {isDownloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {singleSelected ? "Download file" : `Download ZIP (${selected.size})`}
        </Button>
      </div>
    </div>
  );
}
