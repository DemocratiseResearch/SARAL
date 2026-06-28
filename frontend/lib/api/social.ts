import type {
  SocialStatus,
  ShareResponse,
  YouTubeAuthResponse,
  LinkedInAuthResponse,
  LinkedInDraft,
  TwitterDraft,
} from "../types";
import { request } from "./client";

export async function getSocialStatus(): Promise<SocialStatus> {
  return request<SocialStatus>("/api/social/status");
}

export async function getYouTubeAuthUrl(): Promise<YouTubeAuthResponse> {
  return request<YouTubeAuthResponse>("/api/social/youtube/auth");
}

export async function shareToYouTube(
  runId: string,
  title: string,
  description: string,
  visibility: string = "unlisted",
): Promise<ShareResponse> {
  return request<ShareResponse>(`/api/papertovideo/${runId}/share/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, visibility }),
  });
}

export async function getLinkedInAuthUrl(): Promise<LinkedInAuthResponse> {
  return request<LinkedInAuthResponse>("/api/social/linkedin/auth");
}

export async function shareToLinkedIn(
  runId: string,
  title: string,
  description: string,
  visibility: string = "public",
): Promise<ShareResponse> {
  return request<ShareResponse>(`/api/papertovideo/${runId}/share/linkedin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, visibility }),
  });
}

export async function triggerLinkedInDraft(
  runId: string,
): Promise<{ run_id: string; step: string }> {
  return request<{ run_id: string; step: string }>(
    `/api/papertovideo/${runId}/social/linkedin`,
    { method: "POST" },
  );
}

export async function getLinkedInDraft(runId: string): Promise<LinkedInDraft> {
  return request<LinkedInDraft>(`/api/papertovideo/${runId}/social/linkedin`);
}

export async function triggerTwitterDraft(
  runId: string,
): Promise<{ run_id: string; step: string }> {
  return request<{ run_id: string; step: string }>(
    `/api/papertovideo/${runId}/social/twitter`,
    { method: "POST" },
  );
}

export async function getTwitterDraft(runId: string): Promise<TwitterDraft> {
  return request<TwitterDraft>(`/api/papertovideo/${runId}/social/twitter`);
}
