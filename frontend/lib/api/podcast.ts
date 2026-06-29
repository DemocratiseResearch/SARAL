import type {
  SSEEvent,
  PodcastStartBody,
  PodcastStartResponse,
  PodcastRunStatus,
  PodcastScript,
  PodcastAudioResponse,
  PodcastDownloadUrls,
  RetryRunResponse,
} from "../types";
import {
  request,
  requestRetry,
  buildAuthedGatewayUrl,
  triggerAttachmentDownload,
} from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

export async function startPodcast(body: PodcastStartBody): Promise<PodcastStartResponse> {
  return request<PodcastStartResponse>("/api/papertopodcast/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getPodcastStatus(runId: string): Promise<PodcastRunStatus> {
  return request<PodcastRunStatus>(`/api/papertopodcast/${runId}/status`);
}

export async function getPodcastScript(runId: string): Promise<PodcastScript> {
  return request<PodcastScript>(`/api/papertopodcast/${runId}/script`);
}

export async function getPodcastAudio(runId: string): Promise<PodcastAudioResponse> {
  const url = await buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/audio`);
  return { url, expires_in: 3600 };
}

export async function getPodcastVideoUrl(runId: string): Promise<string> {
  return buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/video`);
}

export async function getPodcastDownload(runId: string): Promise<PodcastDownloadUrls> {
  const [audioUrl, videoUrl] = await Promise.all([
    buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/audio`),
    buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/video`),
  ]);
  return {
    audio: { url: audioUrl, expires_in: 3600 },
    video: { url: videoUrl, expires_in: 3600 },
  };
}

export async function triggerPodcastAudioDownload(runId: string): Promise<void> {
  const url = await buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/audio`);
  triggerAttachmentDownload(url);
}

export async function triggerPodcastVideoDownload(runId: string): Promise<void> {
  const url = await buildAuthedGatewayUrl(`/api/papertopodcast/${runId}/video`);
  triggerAttachmentDownload(url);
}

/** @deprecated Use triggerPodcastAudioDownload instead */
export async function triggerPodcastDownload(runId: string): Promise<void> {
  return triggerPodcastAudioDownload(runId);
}

export async function retryPodcastRun(runId: string): Promise<RetryRunResponse> {
  return requestRetry(`/api/papertopodcast/${runId}/retry`);
}

export function connectPodcastSSE(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/papertopodcast/${runId}/stream`,
    onEvent,
    onError,
  );
}
