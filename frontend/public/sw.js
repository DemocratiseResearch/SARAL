// Saral AI — Service Worker
// Strategy:
//  - Static Next.js chunks (/_next/static/): cache-first (they are content-hashed)
//  - Navigation requests: network-first → inline offline fallback HTML
//  - Everything else (API, SSE, Firebase, external): pass-through (network only)
//
// NOTE: SSE streams, Firebase auth, and API calls are intentionally NOT cached
// because the app requires live network connectivity to function.
//
// The offline fallback is inlined as an HTML string so it ALWAYS works
// regardless of cache state — no dependency on fetching /offline at install time.

const CACHE_NAME = "saral-shell-v2";

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're offline — Saral AI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f4f0;
      color: #111111;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fdfaf5;
      border: 1px solid #e8e2d5;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 360px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    }
    .icon {
      width: 56px;
      height: 56px;
      background: #111111;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 24px;
      font-weight: 700;
      color: #f5f4f0;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #111111;
    }
    p {
      font-size: 14px;
      color: #777777;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    a {
      display: inline-block;
      background: #111111;
      color: #f5f4f0;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 28px;
      border-radius: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">S</div>
    <h1>You're offline</h1>
    <p>It looks like you've lost your internet connection. Reconnect and try again.</p>
    <a href="/">Try again</a>
  </div>
</body>
</html>`;

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Skip waiting so the new SW activates immediately
  event.waitUntil(self.skipWaiting());
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests from the same origin
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Pass through SSE / event-stream requests untouched
  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/event-stream")) return;

  // Pass through API routes — they need live network, no cache
  if (url.pathname.startsWith("/api/")) return;

  // ── Next.js static assets: cache-first (content-hashed filenames) ─────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (!response || !response.ok || response.type === "opaque") {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      }),
    );
    return;
  }

  // ── Navigation (HTML page) requests: network-first with offline fallback ───
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    );
    return;
  }

  // All other same-origin GET requests: network only (no SW interception)
});
