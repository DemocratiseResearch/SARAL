import type { ApiEnvelope } from "../types";
import { useAuthStore } from "../auth-store";

export const BASE_URL =
  process.env.NEXT_PUBLIC_GATEWAY ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

export async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await useAuthStore.getState().getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function buildAuthedGatewayUrl(path: string): Promise<string> {
  const token = await useAuthStore.getState().getToken();
  const url = new URL(`${BASE_URL}${path}`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function triggerAttachmentDownload(url: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { ...authHeader, ...opts?.headers },
  });

  let envelope: ApiEnvelope<T>;
  try {
    envelope = await res.json();
  } catch (parseErr) {
    throw new Error(
      `Failed to parse response from ${path}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Status: ${res.status}`,
    );
  }

  if (!envelope.success || !envelope.data) {
    throw new Error(
      envelope.error?.message ?? `Request failed: ${path} (${res.status})`,
    );
  }

  return envelope.data;
}

export async function requestRetry(path: string): Promise<import("../types").RetryRunResponse> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeader },
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Keep payload null and use status-based fallback errors.
  }

  if (!res.ok) {
    const errorObj =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { code?: string; message?: string } }).error
        : undefined;

    if (errorObj?.message) {
      const prefix = errorObj.code ? `${errorObj.code}: ` : "";
      throw new Error(`${prefix}${errorObj.message}`);
    }

    throw new Error(`Retry failed (${res.status})`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Retry failed: malformed response");
  }

  const parsed = payload as Partial<import("../types").RetryRunResponse>;
  if (typeof parsed.resumed !== "boolean") {
    throw new Error("Retry failed: missing `resumed` in response");
  }

  return {
    ok: parsed.ok === true,
    resumed: parsed.resumed,
    message:
      typeof parsed.message === "string"
        ? parsed.message
        : parsed.resumed
          ? "Resumed pipeline from checkpoint"
          : "Restarted pipeline from the beginning",
  };
}
