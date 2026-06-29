/**
 * Central SSE → UI message mapping.
 *
 * Three exported utilities:
 *
 * getSSEStatusMessage(pipeline, step, status, rawMessage?)
 *   Returns a polished UI string for any SSE event received from the backend.
 *   Falls back to rawMessage → step name when no mapping is defined.
 *   Automatically delegates to getSSEErrorMessage() for failed status.
 *
 * getSSEErrorMessage()
 *   Returns one of 5 friendly rotating error strings.
 *   Never exposes raw backend worker errors to the user.
 *
 * getPipelineStartMessage(pipeline)
 *   Returns the "warm-up" message shown before the first SSE event arrives.
 */

// ── Pipeline type discriminator ─────────────────────────────────────────────
export type SSEPipeline =
  | "video"
  | "poster"
  | "podcast"
  | "reel"
  | "social"
  | "business-brief"
  | "paper-upload";

type StepStatus = "processing" | "completed";

// ── Friendly message map ─────────────────────────────────────────────────────
// Delegated to per-pipeline files in lib/stores/slices/messages/.
// Edit the individual files there — this map is derived, not the source.
import {
  VIDEO_MESSAGES,
  PODCAST_MESSAGES,
  REEL_MESSAGES,
  POSTER_MESSAGES,
  SOCIAL_MESSAGES,
  BUSINESS_BRIEF_MESSAGES,
  PAPER_UPLOAD_MESSAGES,
} from "./stores/slices/messages";

const MESSAGE_MAP: Record<SSEPipeline, Record<string, Partial<Record<StepStatus, string>>>> = {
  video:            VIDEO_MESSAGES,
  podcast:          PODCAST_MESSAGES,
  reel:             REEL_MESSAGES,
  poster:           POSTER_MESSAGES,
  social:           SOCIAL_MESSAGES,
  "business-brief": BUSINESS_BRIEF_MESSAGES,
  "paper-upload":   PAPER_UPLOAD_MESSAGES,
};

// ── Error classifier ─────────────────────────────────────────────────────────
/**
 * Converts a raw backend error string (from SSE event.message or fetch rejection)
 * into a concise, user-friendly { title, detail } pair.
 *
 * The raw message coming from the backend looks like:
 *   "audio_gen slide 0: TTS chunk 0: sarvam TTS 429: {\"error\":{\"code\":\"insufficient_quota_error\",...}}"
 *
 * Priority order:
 *  1. Sentinel strings we set ourselves (poll_timeout, sse_connection_lost)
 *  2. External API errors (Sarvam TTS, Gemini/Google)
 *  3. Pipeline step prefixes (audio_gen, slide_compile, script, summary, reel)
 *  4. HTTP status codes embedded in the message
 *  5. Generic network / fetch / connection signals
 *  6. Fallback
 */
export function formatArtifactError(raw?: string): {
  title: string;
  detail: string;
} {
  const s = (raw ?? "").toLowerCase();

  // ── 1. Internal sentinels ─────────────────────────────────────────────────

  if (s === "poll_timeout") {
    return {
      title: "Our servers are taking too long",
      detail:
        "Generation is taking longer than usual. Our servers might be busy — please try again in a moment.",
    };
  }

  if (s === "sse_connection_lost") {
    return {
      title: "Connection dropped",
      detail:
        "We lost the live connection mid-way. Check your internet and hit retry — progress is not lost on the backend.",
    };
  }

  // ── 2. External API errors ────────────────────────────────────────────────

  // Sarvam TTS — quota / credits exhausted (429 or insufficient_quota_error)
  if (
    s.includes("sarvam") &&
    (s.includes("429") ||
      s.includes("quota") ||
      s.includes("insufficient_quota") ||
      s.includes("no credits"))
  ) {
    return {
      title: "Audio generation is unavailable right now",
      detail:
        "Our voice service has run out of credits for the moment. We're working on it — please try again later.",
    };
  }

  // Sarvam TTS — other errors
  if (s.includes("sarvam") || (s.includes("tts") && s.includes("chunk"))) {
    return {
      title: "Voice narration hit a snag",
      detail:
        "Our audio service returned an unexpected error. Retrying usually fixes it — give it another go.",
    };
  }

  // Gemini / Google AI — quota / rate limit
  if (
    (s.includes("gemini") || s.includes("google")) &&
    (s.includes("429") ||
      s.includes("quota") ||
      s.includes("resource_exhausted") ||
      s.includes("rate"))
  ) {
    return {
      title: "AI model is rate limited",
      detail:
        "Our AI service is handling too many requests right now. Wait a minute and try again.",
    };
  }

  // Gemini / Google AI — other
  if (s.includes("gemini") || (s.includes("google") && s.includes("ai"))) {
    return {
      title: "AI script generation failed",
      detail:
        "The AI had trouble processing your paper. This is usually temporary — please retry.",
    };
  }

  // ── 3. Pipeline step prefixes ─────────────────────────────────────────────

  // audio_gen / TTS / narration
  if (
    s.startsWith("audio_gen") ||
    s.includes("audio generation") ||
    (s.includes("tts") && !s.includes("sarvam"))
  ) {
    return {
      title: "Audio narration failed",
      detail:
        "Something went wrong while generating the voice narration. Please retry — it usually works on the next attempt.",
    };
  }

  // slide compile / beamer / LaTeX
  if (
    s.startsWith("slide_compile") ||
    s.includes("beamer") ||
    s.includes("latex") ||
    s.includes("compile") ||
    s.startsWith("slide_gen")
  ) {
    return {
      title: "Slide generation failed",
      detail:
        "The slide compiler ran into an issue. Try a different language or template, then retry.",
    };
  }

  // script / narration generation
  if (s.startsWith("script") || s.startsWith("narration")) {
    return {
      title: "Script generation failed",
      detail:
        "We couldn't generate the script for your paper. Please try again — the AI occasionally needs a second attempt.",
    };
  }

  // summary / analysis
  if (
    s.startsWith("summary") ||
    s.startsWith("analysis") ||
    s.startsWith("extract")
  ) {
    return {
      title: "Paper analysis failed",
      detail:
        "We had trouble reading your paper. Make sure the PDF is text-based (not scanned), then retry.",
    };
  }

  // reel / avatar video
  if (s.startsWith("reel") || s.includes("avatar") || s.includes("lipsync")) {
    return {
      title: "Reel generation failed",
      detail:
        "Something went wrong while creating the avatar video. Please retry.",
    };
  }

  // ── 4. HTTP status codes ──────────────────────────────────────────────────

  if (
    s.includes("429") ||
    s.includes("rate limit") ||
    s.includes("too many requests")
  ) {
    return {
      title: "Too many requests",
      detail:
        "Our services are handling a lot right now. Wait a moment, then try again.",
    };
  }

  if (
    s.includes("500") ||
    s.includes("502") ||
    s.includes("503") ||
    s.includes("internal server error") ||
    s.includes("bad gateway")
  ) {
    return {
      title: "Our servers hit a bump",
      detail:
        "An unexpected error occurred on our end. It's usually temporary — please try again in a few seconds.",
    };
  }

  if (s.includes("504") || s.includes("timeout") || s.includes("timed out")) {
    return {
      title: "Request timed out",
      detail:
        "Our servers are taking longer than expected. They might be busy — please retry in a moment.",
    };
  }

  if (s.includes("404") || s.includes("not found")) {
    return {
      title: "Session expired",
      detail:
        "Your generation session could not be found. It may have expired — please start a new generation.",
    };
  }

  if (
    s.includes("401") ||
    s.includes("403") ||
    s.includes("unauthorized") ||
    s.includes("forbidden")
  ) {
    return {
      title: "Access denied",
      detail:
        "Your session may have expired. Refresh the page and sign in again, then retry.",
    };
  }

  // ── 5. Network / connectivity ─────────────────────────────────────────────

  if (
    s.includes("network") ||
    s.includes("failed to fetch") ||
    s.includes("econnrefused") ||
    s.includes("connection refused") ||
    s.includes("enotfound") ||
    s.includes("sse")
  ) {
    return {
      title: "Connection problem",
      detail:
        "We couldn't reach our servers. Check your internet connection, then retry.",
    };
  }

  // ── 6. Fallback ───────────────────────────────────────────────────────────

  return {
    title: "Generation failed",
    detail:
      "Something unexpected went wrong. Please try again — it usually works on a second attempt.",
  };
}

// ── Rotating error messages ──────────────────────────────────────────────────
// Five messages that cycle on each call so repeated errors feel varied.
// Never exposes raw worker error text to the user.
const ERROR_MESSAGES = [
  "Something went wrong — please try again",
  "Our AI hit a snag, give it another go",
  "Unexpected error during generation",
  "Generation ran into an issue — retry when ready",
  "Pipeline error — please try once more",
] as const;

let _errorIndex = 0;

/**
 * Returns the next friendly error message from the rotating pool.
 * Safe to call for any failed SSE event regardless of pipeline.
 */
export function getSSEErrorMessage(): string {
  const msg = ERROR_MESSAGES[_errorIndex % ERROR_MESSAGES.length];
  _errorIndex = (_errorIndex + 1) % ERROR_MESSAGES.length;
  return msg;
}

/**
 * Maps a backend SSE event to a polished UI string.
 *
 * @param pipeline  Which pipeline this event belongs to
 * @param step      event.step from the SSE payload
 * @param status    event.status from the SSE payload ("processing"|"completed"|"failed")
 * @param rawMessage  event.message — used as fallback when no mapping exists
 */
export function getSSEStatusMessage(
  pipeline: SSEPipeline,
  step: string,
  status: "processing" | "completed" | "failed",
  rawMessage?: string,
): string {
  // For failed events, surface the backend message directly so the UI
  // can display step-specific error text rather than a rotating generic.
  if (status === "failed") return rawMessage ?? step;

  // Business-brief now uses two distinct step names — no raw-message heuristic needed.
  const pipelineMap = MESSAGE_MAP[pipeline];
  if (!pipelineMap) return rawMessage ?? step;

  const stepMap = pipelineMap[step];
  if (!stepMap) return rawMessage ?? step;

  return stepMap[status] ?? rawMessage ?? step;
}

// ── Pipeline warm-up messages ────────────────────────────────────────────────
// Delegated to per-pipeline message files.
import {
  VIDEO_START_MESSAGE,
  PODCAST_START_MESSAGE,
  REEL_START_MESSAGE,
  POSTER_START_MESSAGE,
  SOCIAL_START_MESSAGE,
  BUSINESS_BRIEF_START_MESSAGE,
  PAPER_UPLOAD_START_MESSAGE,
} from "./stores/slices/messages";

const PIPELINE_START_MESSAGES: Record<SSEPipeline, string> = {
  "paper-upload":   PAPER_UPLOAD_START_MESSAGE,
  video:            VIDEO_START_MESSAGE,
  poster:           POSTER_START_MESSAGE,
  podcast:          PODCAST_START_MESSAGE,
  reel:             REEL_START_MESSAGE,
  social:           SOCIAL_START_MESSAGE,
  "business-brief": BUSINESS_BRIEF_START_MESSAGE,
};

/**
 * Returns the "warm-up" status message for a pipeline — used before any SSE
 * events arrive so the generating modal always shows something meaningful.
 */
export function getPipelineStartMessage(pipeline: SSEPipeline): string {
  return PIPELINE_START_MESSAGES[pipeline];
}
