/**
 * Rewrites a storage emulator URL to a same-origin proxy path in dev so the
 * browser doesn't hit a CORS wall. fake-gcs-server (used in local dev) does
 * not emit Access-Control-Allow-Origin, so direct cross-origin fetches fail
 * with TypeError: Failed to fetch.
 *
 * The rewrite path /__storage/* is registered in next.config.ts and forwards
 * to http://localhost:4443/* server-side.
 *
 * Production GCS URLs are returned untouched.
 */
export function proxyStorageUrl(url: string): string {
  if (typeof window === "undefined") return url;
  // Match http(s)://localhost:4443/... or http(s)://0.0.0.0:4443/...
  return url.replace(
    /^https?:\/\/(?:localhost|0\.0\.0\.0|127\.0\.0\.1):4443\//,
    "/__storage/",
  );
}
