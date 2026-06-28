import type {
  SSEEvent,
  PosterStartResponse,
  PosterDownloadResponse,
  RetryRunResponse,
} from "../types";
import { request, requestRetry, getAuthHeader, BASE_URL } from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

export async function startPoster(paperId: string): Promise<PosterStartResponse> {
  return request<PosterStartResponse>("/api/papertoposter/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export async function confirmPoster(runId: string): Promise<void> {
  await request<{ message: string; next_step: string }>(
    `/api/papertoposter/${runId}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export async function getPosterDownload(runId: string): Promise<PosterDownloadResponse> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BASE_URL}/api/papertoposter/${runId}/download`, {
    headers: authHeader,
  });
  if (!res.ok) throw new Error(`Poster download failed: ${res.status}`);
  const blob = await res.blob();
  const download_url = URL.createObjectURL(blob);
  return { download_url };
}

export async function retryPosterRun(runId: string): Promise<RetryRunResponse> {
  return requestRetry(`/api/papertoposter/${runId}/retry`);
}

export function connectPosterSSE(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/papertoposter/${runId}/stream`,
    onEvent,
    onError,
  );
}
