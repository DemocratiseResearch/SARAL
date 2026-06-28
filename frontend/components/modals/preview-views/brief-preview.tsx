"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BriefPreviewProps {
  pdfBlobUrl: string | null;
  pdfLoading: boolean;
  isDownloading: boolean;
  onDownload: () => void;
  /** When the modal is in fullscreen, the PDF fills the viewport instead of the
   *  fixed 65vh preview box, and the surrounding margins/border collapse. */
  isFullscreen?: boolean;
}

export function BriefPreview({
  pdfBlobUrl,
  pdfLoading,
  isDownloading,
  onDownload,
  isFullscreen = false,
}: BriefPreviewProps) {
  // Fullscreen: take all the height left after the header. Otherwise keep the
  // boxed 65vh preview.
  const boxHeight = isFullscreen ? "100%" : "65vh";

  return (
    <div
      className={
        isFullscreen
          ? "flex h-full min-h-0 flex-1 flex-col dark:bg-carddarkbg"
          : "mx-7 my-6 max-sm:mx-5 max-sm:my-4 dark:bg-carddarkbg"
      }
    >
      {pdfLoading ? (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ height: boxHeight }}
        >
          <Loader2
            size={28}
            className="animate-spin text-ink-muted dark:text-white/70"
          />
          <p className="font-sans text-[13px] text-ink-faint">Loading PDF…</p>
        </div>
      ) : pdfBlobUrl ? (
        <iframe
          src={pdfBlobUrl}
          title="Business Brief PDF"
          className={
            isFullscreen
              ? "w-full min-h-0 flex-1 border-0"
              : "w-full rounded-lg border border-pill-border"
          }
          style={isFullscreen ? undefined : { height: "65vh" }}
        />
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ height: boxHeight }}
        >
          <p className="font-sans text-[14px] text-ink-faint text-center">
            PDF not available yet. Try downloading it directly.
          </p>
          <Button
            size="sm"
            disabled={isDownloading}
            onClick={onDownload}
            className="bg-ink text-white hover:bg-[#333] rounded-lg gap-2"
          >
            {isDownloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Download PDF
          </Button>
        </div>
      )}
    </div>
  );
}
