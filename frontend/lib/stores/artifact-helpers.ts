import type { Artifact, ArtifactStatus, ScriptSection } from "./artifact-types";
import type { SSEEvent } from "../types";

// Steps in the video pipeline after script confirmation.
const PIPELINE_STEPS = ["beamer_compile", "audio_gen", "ffmpeg_stitch"];

export function stepToProgress(step: string, status: string): number {
  const idx = PIPELINE_STEPS.indexOf(step);
  if (idx === -1) return 0;
  const base = (idx / PIPELINE_STEPS.length) * 100;
  const stepSize = 100 / PIPELINE_STEPS.length;
  return status === "completed" ? base + stepSize : base + stepSize * 0.5;
}

export interface ArtifactState {
  artifacts: Artifact[];
  dismissedArtifactIds: string[];
  editModalOpen: boolean;
  previewModalOpen: boolean;
  reelScriptModalOpen: boolean;
  reelAvatarModalOpen: boolean;
}

/** Returns true when a completion callback should not auto-open a modal. */
export function isModalBlocked(state: ArtifactState, artifactId: string): boolean {
  return (
    state.dismissedArtifactIds.includes(artifactId) ||
    state.editModalOpen ||
    state.previewModalOpen ||
    state.reelScriptModalOpen ||
    state.reelAvatarModalOpen
  );
}

export function scriptSectionsFromRaw(
  sections: { id: string; title?: string; narration: string; bullets: string[] }[],
): ScriptSection[] {
  return sections.map((s) => ({
    id: s.id,
    label: s.title || s.id.charAt(0).toUpperCase() + s.id.slice(1),
    voiceoverScript: s.narration,
    bulletPoints: [...s.bullets],
  }));
}

/**
 * Wraps any SSE connect function with exponential-backoff retry on
 * transport-level errors. Backend `failed` events are NOT retried — those
 * are business-logic failures handled by the artifact retry button.
 */
export function connectWithRetry(
  connectFn: (
    id: string,
    onEvent: (e: SSEEvent) => void,
    onError?: (err: unknown) => void,
  ) => { close: () => void },
  id: string,
  onEvent: (e: SSEEvent) => void,
  onExhausted: () => void,
  maxRetries = 3,
): { close: () => void } {
  let retryCount = 0;
  let closed = false;
  let current: { close: () => void } | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function attempt() {
    if (closed) return;
    current = connectFn(id, onEvent, (err) => {
      if (closed) return;
      if (retryCount < maxRetries) {
        const delay = 2000 * Math.pow(1.5, retryCount);
        console.warn(
          `[SSE] connection error — retry ${retryCount + 1}/${maxRetries} in ${Math.round(delay)}ms:`,
          err,
        );
        retryCount++;
        retryTimer = setTimeout(attempt, delay);
      } else {
        console.error(`[SSE] connection failed after ${maxRetries} retries:`, err);
        onExhausted();
      }
    });
  }

  attempt();

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      current?.close();
    },
  };
}

export function patchArtifact(
  artifacts: Artifact[],
  id: string,
  patch: Partial<Artifact>,
): Artifact[] {
  return artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

export function setArtifactStatus(
  artifacts: Artifact[],
  id: string,
  status: ArtifactStatus,
  extra?: Partial<Artifact>,
): Artifact[] {
  return patchArtifact(artifacts, id, { status, ...extra });
}
