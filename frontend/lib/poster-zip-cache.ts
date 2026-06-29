import { getPosterDownload } from "@/lib/api";
import { proxyStorageUrl } from "@/lib/storage-url";

type JSZipInstance = Awaited<
  ReturnType<(typeof import("jszip"))["loadAsync"]>
>;

export interface PosterZipBundle {
  zip: JSZipInstance;
  pdfBlob: Blob | null;
}

// Shared cache so the PosterThumbnail (one per tab pane) and the
// PosterPreviewModal don't each re-download and re-parse the same poster ZIP.
// Keyed by runId when available, falling back to downloadUrl.
const cache = new Map<string, Promise<PosterZipBundle>>();

async function loadBundle(
  runId: string | undefined,
  downloadUrl: string | undefined,
): Promise<PosterZipBundle> {
  let buf: ArrayBuffer;
  if (runId) {
    const { download_url } = await getPosterDownload(runId);
    const res = await fetch(download_url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    buf = await res.arrayBuffer();
  } else if (downloadUrl) {
    const res = await fetch(proxyStorageUrl(downloadUrl));
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    buf = await res.arrayBuffer();
  } else {
    throw new Error("no runId or downloadUrl on poster artifact");
  }

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);

  const pdfEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".pdf"),
  );
  const pdfBlob = pdfEntry
    ? new Blob([await pdfEntry.async("blob")], { type: "application/pdf" })
    : null;

  return { zip, pdfBlob };
}

export function fetchPosterZip(
  runId: string | undefined,
  downloadUrl: string | undefined,
): Promise<PosterZipBundle> {
  const key = runId ?? downloadUrl;
  if (!key) {
    return Promise.reject(new Error("no runId or downloadUrl on poster artifact"));
  }
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = loadBundle(runId, downloadUrl);
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);
  return promise;
}
