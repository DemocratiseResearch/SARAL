import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4443",
        pathname: "/**",
      },
    ],
  },
  // Dev-only proxy to fake-gcs (storage emulator). Lets the browser fetch
  // artifact URLs without hitting CORS, since fake-gcs-server doesn't
  // emit Access-Control-Allow-Origin. Production uses real GCS via signed
  // URLs which are CORS-configured server-side, so this rewrite is a no-op
  // there (no requests to /__storage/ in prod).
  async rewrites() {
    return [
      {
        source: "/__storage/:path*",
        destination: "http://localhost:4443/:path*",
      },
    ];
  },
  async headers() {
    return [
      // ── Service worker: must never be cached ──────────────────────────────
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      // ── Global security headers ────────────────────────────────────────────
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
