import type {
  SSEEvent,
  BusinessBrief,
  BusinessBriefTriggerResponse,
  BusinessBriefPDFResponse,
} from "../types";
import { request, getAuthHeader, BASE_URL } from "./client";
import { createSSEConnection, type SSEHandle } from "./sse";

export async function generateBusinessBrief(
  paperId: string,
): Promise<BusinessBriefTriggerResponse> {
  return request<BusinessBriefTriggerResponse>(
    `/api/paper/${paperId}/business-brief`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );
}

export async function getBusinessBrief(paperId: string): Promise<BusinessBrief> {
  return request<BusinessBrief>(`/api/paper/${paperId}/business-brief`);
}

export async function updateBusinessBrief(
  paperId: string,
  sections: Record<string, string>,
): Promise<BusinessBrief> {
  return request<BusinessBrief>(`/api/paper/${paperId}/business-brief`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
}

export async function getBusinessBriefPDFUrl(
  paperId: string,
): Promise<BusinessBriefPDFResponse> {
  return request<BusinessBriefPDFResponse>(
    `/api/paper/${paperId}/business-brief/pdf`,
  );
}

export async function fetchBusinessBriefPdfBlob(paperId: string): Promise<Blob> {
  const authHeader = await getAuthHeader();
  const res = await fetch(
    `${BASE_URL}/api/paper/${paperId}/business-brief/pdf`,
    { headers: authHeader },
  );
  if (!res.ok) throw new Error(`brief PDF fetch ${res.status}`);
  return res.blob();
}

export function connectBusinessBriefSSE(
  paperId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
): SSEHandle {
  return createSSEConnection(
    `/api/paper/${paperId}/business-brief/stream`,
    onEvent,
    onError,
    { retryOn404: 6, retryOn404DelayMs: 800, trackLastEventId: false },
  );
}
