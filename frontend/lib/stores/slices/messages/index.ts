export * from "./video-messages";
export * from "./podcast-messages";
export * from "./reel-messages";
export * from "./poster-messages";
export * from "./social-messages";
export * from "./business-brief-messages";
export * from "./paper-upload-messages";

import { VIDEO_MESSAGES, VIDEO_START_MESSAGE } from "./video-messages";
import { PODCAST_MESSAGES, PODCAST_START_MESSAGE } from "./podcast-messages";
import { REEL_MESSAGES, REEL_START_MESSAGE } from "./reel-messages";
import { POSTER_MESSAGES, POSTER_START_MESSAGE } from "./poster-messages";
import { SOCIAL_MESSAGES, SOCIAL_START_MESSAGE } from "./social-messages";
import { BUSINESS_BRIEF_MESSAGES, BUSINESS_BRIEF_START_MESSAGE } from "./business-brief-messages";
import { PAPER_UPLOAD_MESSAGES, PAPER_UPLOAD_START_MESSAGE } from "./paper-upload-messages";
import type { SSEPipeline } from "../../../sse-messages";

const MESSAGE_MAP: Record<SSEPipeline, Record<string, Partial<Record<"processing" | "completed", string>>>> = {
  video:           VIDEO_MESSAGES,
  podcast:         PODCAST_MESSAGES,
  reel:            REEL_MESSAGES,
  poster:          POSTER_MESSAGES,
  social:          SOCIAL_MESSAGES,
  "business-brief": BUSINESS_BRIEF_MESSAGES,
  "paper-upload":  PAPER_UPLOAD_MESSAGES,
};

const START_MESSAGES: Record<SSEPipeline, string> = {
  video:           VIDEO_START_MESSAGE,
  podcast:         PODCAST_START_MESSAGE,
  reel:            REEL_START_MESSAGE,
  poster:          POSTER_START_MESSAGE,
  social:          SOCIAL_START_MESSAGE,
  "business-brief": BUSINESS_BRIEF_START_MESSAGE,
  "paper-upload":  PAPER_UPLOAD_START_MESSAGE,
};

export function getSSEStatusMessageFromMap(
  pipeline: SSEPipeline,
  step: string,
  status: "processing" | "completed" | "failed",
  rawMessage?: string,
): string {
  if (status === "failed") return rawMessage ?? step;
  const stepMap = MESSAGE_MAP[pipeline]?.[step];
  return stepMap?.[status] ?? rawMessage ?? step;
}

export function getPipelineStartMessageFromMap(pipeline: SSEPipeline): string {
  return START_MESSAGES[pipeline];
}
