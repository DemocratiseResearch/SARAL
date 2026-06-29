import type {
  SSEEvent,
  UploadResponse,
  Run,
  ExtractedDocument,
  ExtractedImagesResponse,
  Script,
  SlidesResponse,
  AudioManifest,
  AudioSlidePresigned,
  DownloadResponse,
  RetryRunResponse,
  ScriptConfirmBody,
  VideoConfig,
} from "../types";
import {
  request,
  requestRetry,
  getAuthHeader,
  buildAuthedGatewayUrl,
  triggerAttachmentDownload,
  BASE_URL,
} from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

// --- Upload ---

export async function uploadPaper(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("pdf", file);

  const authHeader = await getAuthHeader();
  const res = await fetch(`${BASE_URL}/api/papertovideo/upload`, {
    method: "POST",
    headers: authHeader,
    body: form,
  });

  const envelope: import("../types").ApiEnvelope<UploadResponse> = await res.json();
  if (!envelope.success || !envelope.data) {
    throw new Error(envelope.error?.message ?? "Upload failed");
  }
  return envelope.data;
}

export async function ingestArxiv(arxivUrl: string): Promise<UploadResponse> {
  return request<UploadResponse>("/api/papers/arxiv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arxiv_url: arxivUrl }),
  });
}

// --- Pipeline Status ---

export async function getRunStatus(runId: string): Promise<Run> {
  return request<Run>(`/api/papertovideo/${runId}/status`);
}

export async function triggerVideoGeneration(
  runId: string,
  config?: VideoConfig,
): Promise<{
  run_id: string;
  source_run_id?: string;
  step: string;
  audience_level?: string;
  tone?: string;
  reused?: boolean;
  completed?: boolean;
}> {
  return request(`/api/papertovideo/${runId}/generate-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(config ?? {}), force_new: true }),
  });
}

export async function retryVideoRun(runId: string): Promise<RetryRunResponse> {
  return requestRetry(`/api/papertovideo/${runId}/retry`);
}

// --- Extracted Document ---

export async function getExtracted(runId: string): Promise<ExtractedDocument> {
  return request<ExtractedDocument>(`/api/papertovideo/${runId}/extracted`);
}

export async function getImages(runId: string): Promise<ExtractedImagesResponse> {
  return request<ExtractedImagesResponse>(`/api/papertovideo/${runId}/images`);
}

// --- Script ---

export async function getScript(runId: string): Promise<Script> {
  return request<Script>(`/api/papertovideo/${runId}/script`);
}

export async function updateScript(runId: string, script: Script): Promise<void> {
  await request<{ message: string }>(`/api/papertovideo/${runId}/script`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(script),
  });
}

export async function confirmScript(
  runId: string,
  body: ScriptConfirmBody = {},
): Promise<void> {
  await request<{ message: string; next_step: string }>(
    `/api/papertovideo/${runId}/script/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function patchScriptImages(
  runId: string,
  assignments: Record<string, number>,
): Promise<void> {
  await request<{ message: string }>(
    `/api/papertovideo/${runId}/script/images`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    },
  );
}

// --- Slides ---

export async function getSlides(runId: string): Promise<SlidesResponse> {
  return request<SlidesResponse>(`/api/papertovideo/${runId}/slides`);
}

// --- Audio ---

export async function getAudio(runId: string): Promise<AudioManifest> {
  return request<AudioManifest>(`/api/papertovideo/${runId}/audio`);
}

export async function getAudioSlide(runId: string): Promise<AudioSlidePresigned> {
  return request<AudioSlidePresigned>(`/api/papertovideo/${runId}/audio`);
}

// --- Download / Streaming ---

export async function getVideoUrl(
  runId: string,
  opts?: { subs?: boolean },
): Promise<string> {
  const path = opts?.subs
    ? `/api/papertovideo/${runId}/video?subs=on`
    : `/api/papertovideo/${runId}/video`;
  return buildAuthedGatewayUrl(path);
}

/** @deprecated Use getVideoUrl instead */
export const getVideoStreamBlobUrl = getVideoUrl;

export async function triggerVideoDownload(
  runId: string,
  opts?: { subs?: boolean },
): Promise<void> {
  const path = opts?.subs
    ? `/api/papertovideo/${runId}/download?subs=on`
    : `/api/papertovideo/${runId}/download`;
  const url = await buildAuthedGatewayUrl(path);
  triggerAttachmentDownload(url);
}

/** @deprecated Use getVideoUrl / triggerVideoDownload instead */
export async function getDownload(runId: string): Promise<DownloadResponse> {
  const url = await getVideoStreamBlobUrl(runId);
  return { url };
}

// --- SSE ---

export function connectSSE(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/papertovideo/${runId}/stream`,
    onEvent,
    onError,
  );
}
