"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBriefPdf } from "@/lib/business-brief-pdf-cache";
import { BriefPreview } from "../preview-views/brief-preview";
import type { Artifact } from "@/lib/artifact-store";

interface Props {
  artifact: Artifact;
  isFullscreen: boolean;
  isDownloading: boolean;
  onDownload: (handler: () => Promise<void>) => void;
}

function triggerBlobDownload(blobSrc: string, filename: string) {
  const a = document.createElement("a");
  a.href = blobSrc;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function BriefPreviewContainer({ artifact, isFullscreen, isDownloading, onDownload }: Props) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (artifact.pdfBlobUrl) {
      setPdfBlobUrl(artifact.pdfBlobUrl);
      return;
    }
    if (!artifact.paperId) return;
    setPdfLoading(true);
    fetchBriefPdf(artifact.paperId)
      .then((blob) => setPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setPdfBlobUrl(null))
      .finally(() => setPdfLoading(false));

    return () => {
      if (pdfBlobUrl && !artifact.pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.paperId, artifact.pdfBlobUrl]);

  const handleDownload = useCallback(async () => {
    if (!artifact.paperId) throw new Error("No paper ID");
    const blobSrc = pdfBlobUrl ?? URL.createObjectURL(await fetchBriefPdf(artifact.paperId));
    triggerBlobDownload(blobSrc, "business-brief.pdf");
  }, [artifact.paperId, pdfBlobUrl]);

  useEffect(() => {
    onDownload(handleDownload);
  }, [handleDownload, onDownload]);

  return (
    <BriefPreview
      pdfBlobUrl={pdfBlobUrl}
      pdfLoading={pdfLoading}
      isDownloading={isDownloading}
      onDownload={handleDownload}
      isFullscreen={isFullscreen}
    />
  );
}
