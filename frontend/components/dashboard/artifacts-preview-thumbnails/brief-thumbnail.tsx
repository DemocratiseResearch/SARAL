"use client";

import { useEffect, useState } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import type { Artifact } from "@/lib/artifact-store";
import { fetchBriefPdf } from "@/lib/business-brief-pdf-cache";
import { usePdfFirstPage } from "@/lib/use-pdf-first-page";
import Image from "next/image";

interface BriefThumbnailProps {
  artifact: Artifact;
  onExpand: () => void;
}

export function BriefThumbnail({ artifact, onExpand }: BriefThumbnailProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (artifact.pdfBlobUrl || !artifact.paperId) return;
    let cancelled = false;

    fetchBriefPdf(artifact.paperId)
      .then((blob) => {
        if (!cancelled) setPdfBlob(blob);
      })
      .catch((err) => {
        console.error("[BriefThumbnail] PDF unavailable", err);
        if (!cancelled) setFetchFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.paperId, artifact.pdfBlobUrl]);

  // usePdfFirstPage accepts a blob: URL string directly when the store
  // cached one — skip the redundant fetch-and-rehydrate round-trip.
  const { src, failed: renderFailed } = usePdfFirstPage(
    artifact.pdfBlobUrl ?? pdfBlob,
  );
  const failed = fetchFailed || renderFailed;

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onExpand();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open brief preview"
      onClick={onExpand}
      onKeyDown={handleKey}
      className="h-full w-full min-h-0 mb-0 rounded-[10px] overflow-hidden relative group bg-linen dark:bg-saral-dark border border-pill-border cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saral-forest/40"
    >
      {src ? (
        <Image
          src={src}
          alt="Business Brief — first page"
          className="w-full h-full object-cover object-top select-none"
          draggable={false}
          width={400}
          height={500}
        />
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="font-sans text-[12px] font-medium text-ink-muted dark:text-white/70">
            Preview unavailable
          </p>
          <p className="font-sans text-[11px] text-ink-faint">Click to open</p>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2
            className="animate-spin text-ink-muted dark:text-white/70"
            size={20}
          />
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        title="Open preview"
        aria-label="Open preview"
        className="absolute top-2 right-2 w-9 h-9 sm:w-7 sm:h-7 cursor-pointer rounded-md bg-black/40 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/60 text-white"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
