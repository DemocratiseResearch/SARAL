import type {
  SSEEvent,
  ReelStartBody,
  ReelStartResponse,
  ReelScript,
  ReelAvatarCatalog,
  ReelAvatarSelectResponse,
  ReelFinalizeResponse,
  ReelDownloadResponse,
  RetryRunResponse,
} from "../types";
import {
  request,
  requestRetry,
  buildAuthedGatewayUrl,
  triggerAttachmentDownload,
} from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

export async function startReel(body: ReelStartBody): Promise<ReelStartResponse> {
  return request<ReelStartResponse>("/api/papertoreel/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getReelScript(runId: string): Promise<ReelScript> {
  return request<ReelScript>(`/api/papertoreel/${runId}/script`);
}

export async function updateReelScript(runId: string, script: ReelScript): Promise<ReelScript> {
  return request<ReelScript>(`/api/papertoreel/${runId}/script`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(script),
  });
}

export async function getReelAvatars(): Promise<ReelAvatarCatalog> {
  return request<ReelAvatarCatalog>("/api/papertoreel/avatars");
}

export async function selectReelAvatars(
  runId: string,
  pair: string,
): Promise<ReelAvatarSelectResponse> {
  return request<ReelAvatarSelectResponse>(`/api/papertoreel/${runId}/avatars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pair }),
  });
}

export async function finalizeReel(runId: string): Promise<ReelFinalizeResponse> {
  return request<ReelFinalizeResponse>(`/api/papertoreel/${runId}/finalize`, {
    method: "POST",
  });
}

/** @deprecated Use getReelVideoUrl instead */
export async function getReelDownload(runId: string): Promise<ReelDownloadResponse> {
  const url = await buildAuthedGatewayUrl(`/api/papertoreel/${runId}/download`);
  return { url, expires_in: 3600 };
}

export async function getReelVideoUrl(runId: string): Promise<string> {
  return buildAuthedGatewayUrl(`/api/papertoreel/${runId}/video`);
}

/** @deprecated Use getReelVideoUrl instead */
export const getReelVideoStreamBlobUrl = getReelVideoUrl;

export async function triggerReelDownload(runId: string): Promise<void> {
  const url = await buildAuthedGatewayUrl(`/api/papertoreel/${runId}/download`);
  triggerAttachmentDownload(url);
}

export async function retryReelRun(runId: string): Promise<RetryRunResponse> {
  return requestRetry(`/api/papertoreel/${runId}/retry`);
}

export function connectReelSSE(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/papertoreel/${runId}/stream`,
    onEvent,
    onError,
  );
}
