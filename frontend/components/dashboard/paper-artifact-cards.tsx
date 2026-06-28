"use client";

import { useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  Loader2,
  Pencil,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  type ArtifactType,
  type Artifact,
  useArtifactStore,
} from "@/lib/artifact-store";
import {
  ARTIFACT_CONFIG,
  EDITABLE_TYPES,
  SHAREABLE_TYPES,
  LANGUAGE_VISIBLE_TYPES,
} from "@/lib/artifact-config";
import {
  triggerVideoDownload,
  triggerPodcastVideoDownload,
  triggerReelDownload,
  getPosterDownload,
} from "@/lib/api";
import { fetchBriefPdf } from "@/lib/business-brief-pdf-cache";
import { languageDisplayName } from "@/lib/languages";
import { GA_EVENTS, trackGAEvent } from "@/lib/gtag";

/** GA event per type for the card Download button (types without a download event are omitted). */
const DOWNLOAD_GA_EVENT: Partial<Record<ArtifactType, string>> = {
  video: GA_EVENTS.DOWNLOAD_VIDEO,
  podcast: GA_EVENTS.DOWNLOAD_PODCAST,
  reel: GA_EVENTS.DOWNLOAD_REEL,
  poster: GA_EVENTS.DOWNLOAD_POSTER,
  "business-brief": GA_EVENTS.DOWNLOAD_BUSINESS_BRIEF,
  presentation: GA_EVENTS.DOWNLOAD_PRESENTATION,
};

/** GA event per type for the card Edit button (editable types only). */
const EDIT_GA_EVENT: Partial<Record<ArtifactType, string>> = {
  video: GA_EVENTS.EDIT_VIDEO,
  presentation: GA_EVENTS.EDIT_PRESENTATION,
  podcast: GA_EVENTS.EDIT_PODCAST,
  reel: GA_EVENTS.EDIT_REEL,
};


import type {
  OpenPreviewModalOpts,
  VideoCardPlaybackRef,
} from "@/components/dashboard/artifacts-preview-thumbnails/shared";
import { VideoThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/video-thumbnail";
import { PodcastThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/podcast-thumbnail";
import { ReelThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/reel-thumbnail";
import { BriefThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/brief-thumbnail";
import { PosterThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/poster-thumbnail";
import { SocialThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/social-thumbnail";
import { PresentationThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/presentation-thumbnail";
import { GenericThumbnail } from "@/components/dashboard/artifacts-preview-thumbnails/generic-thumbnail";

export interface ArtifactTabItemConfig {
  id: ArtifactType;
  label: string;
  color: string;
}

export const ARTIFACT_TAB_ITEMS: ArtifactTabItemConfig[] = (
  Object.entries(ARTIFACT_CONFIG) as [ArtifactType, typeof ARTIFACT_CONFIG[ArtifactType]][]
).map(([id, cfg]) => ({ id, label: cfg.pluralLabel, color: cfg.color }));

/** Secondary action buttons on artifact cards. */
const ARTIFACT_ACTION_ICON_BTN =
  "h-10 w-10 shrink-0 rounded-[10px] border border-pill-border bg-white/90 dark:bg-white/5 text-ink dark:text-white shadow-none transition-colors hover:border-saral-forest/40 hover:bg-saral-forest/10 hover:text-saral-forest dark:hover:bg-saral-forest/30 dark:hover:text-white disabled:pointer-events-none disabled:opacity-40";

/**
 * Type pill on completed cards — tinted from the tab accent (`item.color`).
 * Exposes the accent as `--pill-accent` so the className can derive light- and
 * dark-mode fills/borders/text via `color-mix`, keeping both themes legible.
 */
function artifactTypePillStyle(accent: string): CSSProperties {
  return { "--pill-accent": accent } as CSSProperties;
}

// ── In-progress card (shown while generating) ───────────────────────────────

interface GeneratingCardProps {
  artifact: Artifact;
  color: string;
  onReopenModal: () => void;
}

function GeneratingCard({
  artifact,
  color,
  onReopenModal,
}: GeneratingCardProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onReopenModal}
      className="h-full min-h-62 w-full min-w-0 flex-col items-stretch justify-start gap-0 rounded-xl border border-pill-border bg-linen dark:bg-saral-dark p-3.5 text-left font-normal shadow-sm transition-colors hover:bg-saral-forest/20 hover:shadow-md"
    >
      <div
        className="w-full aspect-video rounded-[10px] mb-3 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: color + "30" }}
      >
        <Loader2 size={22} className="animate-spin" style={{ color }} />
        <span className="font-sans text-[11px] font-medium" style={{ color }}>
          Click to view progress
        </span>
      </div>
      <div className="mb-2">
        <p className="font-sans font-bold text-sm text-ink dark:text-white truncate">
          {ARTIFACT_CONFIG[artifact.type].label}
        </p>
      </div>
      <div className="w-full h-1 bg-[#d9d0c4] rounded-full overflow-hidden mt-1">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${artifact.progress}%`, backgroundColor: color }}
        />
      </div>
    </Button>
  );
}

interface NeedsActionCardProps {
  artifact: Artifact;
  item: ArtifactTabItemConfig;
  onOpen: () => void;
}

function NeedsActionCard({ artifact, item, onOpen }: NeedsActionCardProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onOpen}
      className="relative h-full min-h-62 w-full min-w-0 flex-col items-stretch justify-start gap-0 overflow-visible rounded-xl border border-pill-border bg-linen dark:bg-carddarkbg p-3.5 text-left font-normal shadow-sm transition-colors hover:bg-saral-forest/20 hover:shadow-md"
    >
      <span className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
      </span>

      <div
        className="w-full aspect-video rounded-[10px] mb-3 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: item.color + "30" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: item.color + "25" }}
        >
          <span className="font-bold text-lg" style={{ color: item.color }}>
            ✓
          </span>
        </div>
        <span
          className="font-sans text-[11px] font-medium"
          style={{ color: item.color }}
        >
          Paused — tap to review
        </span>
      </div>
      <div>
        <p className="font-sans font-bold text-sm text-ink dark:text-white truncate">
          {ARTIFACT_CONFIG[artifact.type].label}
        </p>
        <p className="font-sans text-xs text-ink-muted dark:text-white/70 mt-0.5">
          Needs your input
        </p>
      </div>
    </Button>
  );
}

// ── Completed artifact card ─────────────────────────────────────────────────

interface ArtifactCardProps {
  artifact: Artifact;
  item: ArtifactTabItemConfig;
  openEditModal: (id: string) => void;
  openPreviewModal: (id: string, opts?: OpenPreviewModalOpts) => void;
  openShareModal: (id: string) => void;
  /** Render a pulsing amber dot — used when the artifact just finished
   *  while the generating modal was dismissed, to draw the eye. */
  showNudge?: boolean;
}

function ArtifactCard({
  artifact,
  item,
  openEditModal,
  openPreviewModal,
  openShareModal,
  showNudge = false,
}: ArtifactCardProps) {
  const openPodcastConfigModal = useArtifactStore(
    (s) => s.openPodcastConfigModal,
  );
  const openReelConfigModal = useArtifactStore((s) => s.openReelConfigModal);
  const isEditable = EDITABLE_TYPES.includes(artifact.type);
  const isShareable = SHAREABLE_TYPES.includes(artifact.type);
  /** Script may be ready (`pending`) while video/deck/etc. is still not built. */
  const canDownloadOrShare = artifact.status === "done";
  const videoCardPlaybackRef: VideoCardPlaybackRef = useRef<{
    pause: () => void;
    getResumeOpts: () => Pick<OpenPreviewModalOpts, "videoResume"> | undefined;
  } | null>(null);

  const handleDownload = async () => {
    if (!canDownloadOrShare) return;

    const downloadEvent = DOWNLOAD_GA_EVENT[artifact.type];
    if (downloadEvent) trackGAEvent(downloadEvent);

    const triggerBlobDownload = (url: string, filename: string) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    try {
      if (artifact.runId && artifact.type === "video") {
        await triggerVideoDownload(artifact.runId);
        return;
      }
      if (artifact.runId && artifact.type === "podcast") {
        await triggerPodcastVideoDownload(artifact.runId);
        return;
      }
      if (artifact.runId && artifact.type === "reel") {
        await triggerReelDownload(artifact.runId);
        return;
      }
      if (artifact.type === "poster") {
        if (!artifact.runId) throw new Error("poster missing runId");
        const { download_url } = await getPosterDownload(artifact.runId);
        triggerBlobDownload(download_url, `${item.label}.zip`);
        setTimeout(() => URL.revokeObjectURL(download_url), 10000);
        return;
      }
      if (artifact.type === "business-brief") {
        if (!artifact.paperId) throw new Error("brief missing paperId");
        const blob = await fetchBriefPdf(artifact.paperId);
        const blobUrl = URL.createObjectURL(blob);
        triggerBlobDownload(blobUrl, "business-brief.pdf");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      }
      if (artifact.type === "presentation") {
        const url =
          artifact.slidesPptxUrl ??
          artifact.slidesPdfUrl ??
          artifact.downloadUrl;
        if (!url) throw new Error("presentation has no download URL");
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (artifact.downloadUrl) {
        const response = await fetch(artifact.downloadUrl);
        if (!response.ok) throw new Error(`fetch ${response.status}`);
        const blobUrl = URL.createObjectURL(await response.blob());
        triggerBlobDownload(blobUrl, `${item.label}.zip`);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      }
      throw new Error(`no download path for type ${artifact.type}`);
    } catch (err) {
      console.error("[ArtifactCard download] failed:", err, {
        type: artifact.type,
        runId: artifact.runId,
        paperId: artifact.paperId,
      });
    }
  };

  const handleEdit = () => {
    if (!isEditable) return;
    const editEvent = EDIT_GA_EVENT[artifact.type];
    if (editEvent) trackGAEvent(editEvent);
    if (artifact.type === "business-brief") {
      openPreviewModal(artifact.id);
    } else if (artifact.type === "podcast") {
      if (!artifact.paperId) return;
      useArtifactStore.setState({ selectedArtifactId: artifact.id });
      openPodcastConfigModal(artifact.paperId);
    } else if (artifact.type === "reel") {
      if (!artifact.paperId) return;
      useArtifactStore.setState({ selectedArtifactId: artifact.id });
      openReelConfigModal(artifact.paperId);
    } else {
      openEditModal(artifact.id);
    }
  };

  return (
    <Card className="relative flex h-full min-h-72 w-full min-w-0 flex-col gap-0 overflow-visible border border-pill-border bg-linen dark:bg-[#1f2123] dark:border-darkcardborder py-0 shadow-sm ring-0 transition-all hover:border-saral-forest/30 hover:shadow-lg">
      {showNudge && (
        <span className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
        </span>
      )}
      <CardContent className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-[min(100%,12.5rem)] shrink items-center rounded-full border px-3 py-1 font-sans text-[11px] font-bold leading-none tracking-wide text-balance shadow-[0_1px_2px_color-mix(in_srgb,var(--pill-accent)_30%,transparent)] border-[color-mix(in_srgb,var(--pill-accent)_70%,transparent)] bg-[color-mix(in_srgb,var(--pill-accent)_22%,white)] text-[color-mix(in_srgb,var(--pill-accent)_88%,#141414)] dark:border-[color-mix(in_srgb,var(--pill-accent)_60%,transparent)] dark:bg-[color-mix(in_srgb,var(--pill-accent)_32%,transparent)] dark:text-white"
              style={artifactTypePillStyle(item.color)}
            >
              {ARTIFACT_CONFIG[artifact.type].label}
            </Badge>
            {LANGUAGE_VISIBLE_TYPES.has(artifact.type) &&
              languageDisplayName(artifact.config.language) && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pill-border bg-white/70 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:border-darkcardborder dark:bg-white/10 dark:text-white/80"
                  title={`Output language: ${languageDisplayName(artifact.config.language)}`}
                >
                  <Languages size={10} strokeWidth={2.25} aria-hidden />
                  {languageDisplayName(artifact.config.language)}
                </span>
              )}
          </div>
          <span
            className={
              canDownloadOrShare
                ? "shrink-0 inline-flex items-center gap-1.5 font-sans text-[11px] font-medium text-saral-forest dark:text-emerald-300"
                : "shrink-0 inline-flex items-center gap-1.5 font-sans text-[11px] font-medium text-ink-muted dark:text-white/60"
            }
          >
            <span
              className={
                canDownloadOrShare
                  ? "h-1.5 w-1.5 rounded-full bg-saral-forest dark:bg-emerald-400"
                  : "h-1.5 w-1.5 rounded-full bg-ink-faint dark:bg-white/40"
              }
              aria-hidden
            />
            {canDownloadOrShare ? "Ready" : "In progress"}
          </span>
        </div>

        <div className="mb-4 aspect-video w-full shrink-0 overflow-hidden rounded-[10px] bg-muted dark:bg-white/5 ring-1 ring-pill-border dark:ring-darkcardborder *:mb-0 *:h-full *:min-h-0">
          {artifact.type === "video" ? (
            <VideoThumbnail
              artifact={artifact}
              playbackRef={videoCardPlaybackRef}
              onPlay={() => openPreviewModal(artifact.id)}
              onExpand={(opts) => openPreviewModal(artifact.id, opts)}
            />
          ) : artifact.type === "podcast" ? (
            <PodcastThumbnail
              artifact={artifact}
              onPlay={() => openPreviewModal(artifact.id)}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          ) : artifact.type === "reel" ? (
            <ReelThumbnail
              artifact={artifact}
              onPlay={() => openPreviewModal(artifact.id)}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          ) : artifact.type === "x-linkedin" ? (
            <SocialThumbnail
              artifact={artifact}
              onExpand={() => openPreviewModal(artifact.id)}
              onOpenLinkedInTab={() =>
                openPreviewModal(artifact.id, { socialTab: "linkedin" })
              }
              onOpenTwitterTab={() =>
                openPreviewModal(artifact.id, { socialTab: "twitter" })
              }
            />
          ) : artifact.type === "business-brief" ? (
            <BriefThumbnail
              artifact={artifact}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          ) : artifact.type === "poster" ? (
            <PosterThumbnail
              artifact={artifact}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          ) : artifact.type === "presentation" ? (
            <PresentationThumbnail
              artifact={artifact}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          ) : (
            <GenericThumbnail
              artifact={artifact}
              color={item.color}
              onPlay={() => openPreviewModal(artifact.id)}
              onExpand={() => openPreviewModal(artifact.id)}
            />
          )}
        </div>
        {/* 
        <p className="mb-3 font-sans text-[13px] font-semibold leading-snug text-ink dark:text-white line-clamp-1">
          {item.label}
        </p> */}

        <div className="mt-auto flex flex-col gap-2">
          {/* Primary row: View, plus Regenerate for editable types.
              Regenerate opens the edit modal where language / voice / format
              can be changed before re-running — the most common follow-up. */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-11 flex-1 cursor-pointer rounded-[10px] bg-saral-forest px-3 font-sans text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-[#3d4b45] hover:shadow"
              onClick={() => {
                if (artifact.type === "video") {
                  videoCardPlaybackRef.current?.pause();
                  const o = videoCardPlaybackRef.current?.getResumeOpts();
                  openPreviewModal(artifact.id, o);
                } else {
                  openPreviewModal(artifact.id);
                }
              }}
            >
              View
            </Button>
            {isEditable && (
              <Button
                type="button"
                variant="outline"
                title="Edit & regenerate — change language, voice, or format"
                aria-label="Edit and regenerate artifact"
                className="h-11 flex-1 cursor-pointer gap-1.5 rounded-[10px] border border-pill-border bg-white/90 px-3 font-sans text-[14px] font-semibold text-ink shadow-none transition-colors hover:border-saral-forest/40 hover:bg-saral-forest/10 hover:text-saral-forest dark:border-darkcardborder dark:bg-white/5 dark:text-white dark:hover:bg-saral-forest/30 dark:hover:text-white"
                onClick={handleEdit}
              >
                <Pencil size={15} strokeWidth={2} aria-hidden />
                Edit
              </Button>
            )}
          </div>

          {/* Secondary row: download + share as icon buttons. */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canDownloadOrShare}
              title="Download"
              aria-label="Download artifact"
              className={`${ARTIFACT_ACTION_ICON_BTN} w-auto flex-1 gap-1.5 px-3 font-sans text-[13px] font-semibold`}
              onClick={() => void handleDownload()}
            >
              <Download size={16} strokeWidth={2} aria-hidden />
              Download
            </Button>
            {isShareable && (
              <Button
                type="button"
                variant="outline"
                disabled={!canDownloadOrShare}
                title="Share"
                aria-label="Share artifact"
                className={`${ARTIFACT_ACTION_ICON_BTN} w-auto flex-1 gap-1.5 px-3 font-sans text-[13px] font-semibold`}
                onClick={() => {
                  if (canDownloadOrShare) openShareModal(artifact.id);
                }}
              >
                <Share2 size={16} strokeWidth={2} aria-hidden />
                Share
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card carousel (mobile: 1-up with prev/next; desktop: 3-col grid) ────────

export interface ArtifactCarouselEntry {
  artifact: Artifact;
  item: ArtifactTabItemConfig;
}

interface ArtifactGridCallbacks {
  openEditModal: (id: string) => void;
  openPreviewModal: (id: string, opts?: OpenPreviewModalOpts) => void;
  openShareModal: (id: string) => void;
  openGeneratingModal: (id: string) => void;
  reopenReelStageModal: (id: string) => void;
}

export interface ArtifactEntriesGridProps extends ArtifactGridCallbacks {
  /** One row per card; `item` drives colors / footer labels for that artifact. */
  entries: ArtifactCarouselEntry[];
}

/** Multi-type grid + mobile carousel (used by “All artifacts” and `CardCarousel`). */
export function ArtifactEntriesGrid({
  entries,
  openEditModal,
  openPreviewModal,
  openShareModal,
  openGeneratingModal,
  reopenReelStageModal,
}: ArtifactEntriesGridProps) {
  const [index, setIndex] = useState(0);

  const safeIndex = Math.min(index, Math.max(0, entries.length - 1));

  const renderEntry = (artifact: Artifact, item: ArtifactTabItemConfig) => {
    // A `done` artifact with needsUserAction: "preview" is just an
    // acknowledgment nudge (user dismissed the generating modal, so we
    // suppressed the auto-open) — the pipeline is finished. Render the
    // normal card with a pulsing dot, not the "Paused" placeholder.
    const isReadyNudge =
      artifact.needsUserAction === "preview" && artifact.status === "done";

    // needsUserAction takes priority — reels keep status "generating" while
    // paused at script_review, so checking status first would hide the
    // pulsing "needs input" indicator on reel cards.
    if (artifact.needsUserAction && !isReadyNudge) {
      return (
        <NeedsActionCard
          key={artifact.id}
          artifact={artifact}
          item={item}
          onOpen={() => {
            // Reels: route to the stage modal only while mid-pipeline.
            // A done reel must go to the preview modal — reopenReelStageModal
            // has no branch for "done" and would silently do nothing.
            const isReelMidPipeline =
              artifact.type === "reel" &&
              artifact.reelStage !== "done" &&
              artifact.reelStage !== "failed";
            if (isReelMidPipeline) {
              reopenReelStageModal(artifact.id);
            } else if (
              artifact.needsUserAction === "edit" &&
              artifact.type !== "business-brief"
            ) {
              openEditModal(artifact.id);
            } else {
              openPreviewModal(artifact.id);
            }
          }}
        />
      );
    }
    if (
      artifact.status === "generating" ||
      artifact.status === "waiting-script"
    ) {
      return (
        <GeneratingCard
          key={artifact.id}
          artifact={artifact}
          color={item.color}
          onReopenModal={() => openGeneratingModal(artifact.id)}
        />
      );
    }
    return (
      <ArtifactCard
        key={artifact.id}
        artifact={artifact}
        item={item}
        openEditModal={openEditModal}
        openPreviewModal={openPreviewModal}
        openShareModal={openShareModal}
        showNudge={isReadyNudge}
      />
    );
  };

  return (
    <>
      {/* Desktop: grid */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
        {entries.map(({ artifact, item }) => (
          <div key={artifact.id} className="min-h-0 flex w-full min-w-0">
            {renderEntry(artifact, item)}
          </div>
        ))}
      </div>

      {/* Mobile: single-card carousel */}
      <div className="sm:hidden">
        {entries.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex min-h-0 w-full">
              {renderEntry(
                entries[safeIndex].artifact,
                entries[safeIndex].item,
              )}
            </div>
            {entries.length > 1 && (
              <div className="flex items-center justify-between px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={safeIndex === 0}
                  className="w-8 h-8 rounded-full border border-pill-border bg-linen dark:bg-saral-dark disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="font-sans text-xs text-ink-muted dark:text-white/70">
                  {safeIndex + 1} / {entries.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setIndex((i) => Math.min(entries.length - 1, i + 1))
                  }
                  disabled={safeIndex === entries.length - 1}
                  className="w-8 h-8 rounded-full border border-pill-border bg-linen dark:bg-saral-dark disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface CardCarouselProps extends ArtifactGridCallbacks {
  artifacts: Artifact[]; // ALL artifacts for this type (done + generating)
  item: ArtifactTabItemConfig;
}

export function CardCarousel({
  artifacts,
  item,
  openEditModal,
  openPreviewModal,
  openShareModal,
  openGeneratingModal,
  reopenReelStageModal,
}: CardCarouselProps) {
  const entries = artifacts.map((artifact) => ({ artifact, item }));
  return (
    <ArtifactEntriesGrid
      entries={entries}
      openEditModal={openEditModal}
      openPreviewModal={openPreviewModal}
      openShareModal={openShareModal}
      openGeneratingModal={openGeneratingModal}
      reopenReelStageModal={reopenReelStageModal}
    />
  );
}
