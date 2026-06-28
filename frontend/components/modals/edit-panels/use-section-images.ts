/* eslint-disable react-hooks/set-state-in-effect -- mirrors the original inline effect: the fetch is gated by `enabled`, and the loading flag is intentionally cleared after the async fetch resolves. */
"use client";

import { useEffect, useState } from "react";
import { getImages, getPaperToSlidesImages } from "@/lib/api";
import type { ExtractedImage } from "@/lib/types";

interface UseSectionImagesArgs {
  enabled: boolean;
  isPresentation: boolean;
  artifactRunId?: string;
  paperRunId?: string | null;
  artifactId?: string;
}

export function useSectionImages({
  enabled,
  isPresentation,
  artifactRunId,
  paperRunId,
  artifactId,
}: UseSectionImagesArgs) {
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    if (isPresentation && artifactRunId) {
      setImagesLoading(true);
      getPaperToSlidesImages(artifactRunId)
        .then((res) => setImages(res.images))
        .catch(() => setImages([]))
        .finally(() => setImagesLoading(false));
      return;
    }

    if (!paperRunId) return;
    setImagesLoading(true);
    getImages(paperRunId)
      .then((res) => setImages(res.images))
      .catch(() => setImages([]))
      .finally(() => setImagesLoading(false));
  }, [enabled, paperRunId, isPresentation, artifactRunId, artifactId]);

  return { images, imagesLoading };
}
