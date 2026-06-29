import type { SSEEvent } from "../types";
import { BASE_URL, getAuthHeader } from "./client";

export interface SSEHandle {
  close: () => void;
}

/**
 * Creates an authenticated SSE connection that reads a fetch-based event stream.
 * Reconnects automatically when the stream ends naturally (proxy-dropped connections).
 * Calls onError on HTTP failures or network errors and does NOT reconnect — the
 * caller (connectWithRetry in the artifact store) owns the retry policy.
 */
export function createSSEConnection(
  path: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (err: unknown) => void,
  options?: {
    /** Retry on 404 up to this many times with exponential backoff (for brief SSE). */
    retryOn404?: number;
    /** Initial backoff delay in ms when retrying 404s. Default 800. */
    retryOn404DelayMs?: number;
    /** Pass Last-Event-ID header on reconnect. Default true. */
    trackLastEventId?: boolean;
  },
): SSEHandle {
  const url = `${BASE_URL}${path}`;
  const {
    retryOn404 = 0,
    retryOn404DelayMs = 800,
    trackLastEventId = true,
  } = options ?? {};

  let lastEventId: string | null = null;
  let closed = false;
  let currentController = new AbortController();

  (async () => {
    let attempt = 0;
    const maxAttempts = retryOn404 + 1;

    while (!closed && attempt < maxAttempts) {
      if (attempt > 0) {
        const delay = retryOn404DelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        if (closed) return;
      }

      currentController = new AbortController();

      try {
        const authHeader = await getAuthHeader();
        if (closed) return;

        const headers: Record<string, string> = { ...authHeader };
        if (trackLastEventId && lastEventId) {
          headers["Last-Event-ID"] = lastEventId;
        }

        const res = await fetch(url, {
          headers,
          signal: currentController.signal,
        });

        if (!res.ok || !res.body) {
          if (res.status === 404 && retryOn404 > 0 && attempt < maxAttempts - 1) {
            attempt++;
            continue;
          }
          onError?.(new Error(`SSE connection failed: ${res.status}`));
          return;
        }

        // Reset 404 retry counter once we connect successfully.
        attempt = maxAttempts;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (trackLastEventId && line.startsWith("id: ")) {
              lastEventId = line.slice(4).trim();
            } else if (line.startsWith("data: ")) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6));
                if (trackLastEventId && lastEventId) event.id = lastEventId;
                onEvent(event);
              } catch {
                // ignore non-JSON data lines
              }
            }
          }
        }
      } catch (err) {
        if (closed || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        onError?.(err);
        return;
      }

      // Stream ended naturally — reconnect after a brief delay if not closed.
      if (!closed && attempt >= maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();

  return {
    close: () => {
      closed = true;
      currentController.abort();
    },
  };
}
