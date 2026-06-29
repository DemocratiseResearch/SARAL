"use client";

import { useEffect, useState } from "react";

/**
 * Renders page 1 of a PDF (given as Blob, ArrayBuffer, or URL) to a PNG data
 * URL using pdfjs-dist. Returns the data URL and the page's native aspect
 * ratio (width / height) so the consumer can size its container correctly.
 *
 * Loads pdfjs-dist lazily (dynamic import) so the worker code only ships to
 * pages that actually use a PDF preview.
 */
export interface PdfFirstPage {
  src: string | null;
  aspect: number | null;
  loading: boolean;
  failed: boolean;
}

export function usePdfFirstPage(
  source: Blob | ArrayBuffer | string | null,
  /** Logical render width in CSS px. Output canvas is upscaled by devicePixelRatio. */
  targetWidth = 480,
): PdfFirstPage {
  const [src, setSrc] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(!!source);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!source) {
      setSrc(null);
      setAspect(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Worker is served from /public so it works under any bundler/CDN
        // without needing import-as-URL support. Keep the file in sync with
        // pdfjs-dist via the postinstall script in package.json.
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        }

        let data: ArrayBuffer | string;
        if (typeof source === "string") {
          data = source;
        } else if (source instanceof Blob) {
          data = await source.arrayBuffer();
        } else {
          data = source;
        }

        const loadingTask =
          typeof data === "string"
            ? pdfjs.getDocument({ url: data })
            : pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = (targetWidth * dpr) / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d context unavailable");

        // Paint white background — PDFs are transparent by default.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled) return;

        setSrc(canvas.toDataURL("image/png"));
        setAspect(baseViewport.width / baseViewport.height);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[usePdfFirstPage] render failed:", err);
        }
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, targetWidth]);

  return { src, aspect, loading, failed };
}
