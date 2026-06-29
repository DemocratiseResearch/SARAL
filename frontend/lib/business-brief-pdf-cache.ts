import { fetchBusinessBriefPdfBlob } from "@/lib/api";

// Shared in-flight + resolved-Blob cache keyed by paperId. Dedupes the many
// BriefThumbnail mounts that shadcn Tabs creates (one per pane) and the
// PreviewModal opening the same artifact down to a single network fetch.
const cache = new Map<string, Promise<Blob>>();

async function fetchOnce(paperId: string): Promise<Blob> {
  // Retry once on any non-ok response — the "still being rendered" transient
  // state during the brief edit (PUT) flow resolves within ~2 s.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    try {
      // Gateway streams PDF bytes directly — no GCS URL ever reaches the browser.
      return await fetchBusinessBriefPdfBlob(paperId);
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

export function fetchBriefPdf(paperId: string): Promise<Blob> {
  const cached = cache.get(paperId);
  if (cached) return cached;

  const promise = fetchOnce(paperId);
  promise.catch(() => cache.delete(paperId));
  cache.set(paperId, promise);
  return promise;
}
