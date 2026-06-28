import type {
  SSEEvent,
  Script,
  ExtractedImagesResponse,
  PaperToSlidesStartResponse,
  PaperToSlidesConfirmBody,
  PaperToSlidesDeckResponse,
} from "../types";
import { request } from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

export async function startPaperToSlides(paperId: string): Promise<PaperToSlidesStartResponse> {
  return request<PaperToSlidesStartResponse>("/api/papertoslides/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export async function getPaperToSlidesScript(runId: string): Promise<Script> {
  return request<Script>(`/api/papertoslides/${runId}/script`);
}

export async function updatePaperToSlidesScript(runId: string, script: Script): Promise<void> {
  await request<{ message: string }>(`/api/papertoslides/${runId}/script`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(script),
  });
}

export async function patchPaperToSlidesScriptImages(
  runId: string,
  assignments: Record<string, number>,
): Promise<void> {
  await request<{ message: string }>(
    `/api/papertoslides/${runId}/script/images`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    },
  );
}

export async function confirmPaperToSlides(
  runId: string,
  body: PaperToSlidesConfirmBody = {},
): Promise<void> {
  await request<{ message?: string }>(`/api/papertoslides/${runId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getPaperToSlidesDeck(
  runId: string,
  opts?: { compileVersion?: number | string },
): Promise<PaperToSlidesDeckResponse> {
  const qs =
    opts?.compileVersion != null
      ? `?compile_version=${encodeURIComponent(String(opts.compileVersion))}`
      : "";
  return request<PaperToSlidesDeckResponse>(`/api/papertoslides/${runId}/deck${qs}`);
}

export async function getPaperToSlidesImages(runId: string): Promise<ExtractedImagesResponse> {
  return request<ExtractedImagesResponse>(`/api/papertoslides/${runId}/images`);
}

export function connectPaperToSlidesSSE(
  runId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/papertoslides/${runId}/stream`,
    onEvent,
    onError,
  );
}
