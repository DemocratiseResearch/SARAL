"use client";

import { Download, ExternalLink, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/artifact-store";

interface PresentationPreviewProps {
  artifact: Artifact;
  /** When the modal is in fullscreen, the embed fills the viewport instead of
   *  the fixed 52vh preview box, and the surrounding chrome collapses. */
  isFullscreen?: boolean;
}

export function PresentationPreview({
  artifact,
  isFullscreen = false,
}: PresentationPreviewProps) {
  // Fullscreen: the container goes edge-to-edge and the iframe takes all the
  // height left after the header. Otherwise keep the boxed 52vh preview.
  const frameHeight = isFullscreen ? "100%" : "52vh";

  return (
    <div
      className={
        isFullscreen
          ? "flex h-full min-h-0 flex-1 flex-col dark:bg-carddarkbg"
          : "mx-7 my-6 max-sm:mx-5 max-sm:my-4 flex flex-col gap-5 dark:bg-carddarkbg"
      }
    >
      <div
        className={
          isFullscreen
            ? "min-h-0 flex-1 overflow-hidden bg-linen dark:bg-saral-dark/50"
            : "rounded-xl overflow-hidden border border-pill-border bg-linen dark:bg-saral-dark/50"
        }
        style={isFullscreen ? undefined : { minHeight: "52vh" }}
      >
        {artifact.slidesPdfUrl ? (
          <iframe
            src={artifact.slidesPdfUrl}
            title="Slide deck preview"
            className="w-full h-full border-0"
            style={{ minHeight: frameHeight, height: frameHeight }}
          />
        ) : artifact.slidesPptxUrl ? (
          <div className="flex flex-col items-center justify-center gap-5 py-16 px-8 text-center min-h-[40vh]">
            <Presentation className="w-14 h-14 text-saral-forest/80" />
            <p className="font-sans text-[14px] text-ink-muted dark:text-white/70 max-w-md leading-relaxed">
              PPTX files can&apos;t be previewed here. Use the downloads below
              or the toolbar button.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-pill-border"
              onClick={() =>
                window.open(
                  artifact.slidesPptxUrl,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ExternalLink size={14} /> Open PowerPoint file
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[40vh] text-ink-faint font-sans text-[14px]">
            No preview URL available yet.
          </div>
        )}
      </div>
      <div
        className={`flex flex-wrap gap-3 justify-center${isFullscreen ? " hidden" : ""}`}
      >
        {artifact.slidesPptxUrl && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-pill-border"
            onClick={() =>
              window.open(
                artifact.slidesPptxUrl,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <Download size={14} /> PowerPoint (.pptx)
          </Button>
        )}
        {artifact.slidesPdfUrl && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-pill-border"
            onClick={() =>
              window.open(
                artifact.slidesPdfUrl,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <Download size={14} /> PDF (Beamer)
          </Button>
        )}
      </div>
    </div>
  );
}
