"use client";

import { useEffect } from "react";

/**
 * Registers the service worker silently.
 * Renders nothing — purely a side-effect component.
 * Must be a Client Component because service worker registration
 * runs only in the browser.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Skip in dev — the SW is cache-first for /_next/static and will serve
    // stale chunks across edits, breaking HMR. Auto-unregister any leftover
    // SW + clear its caches so a previously-installed dev SW can't haunt
    // future sessions.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    // Defer registration until after the page is fully interactive
    // to avoid competing with critical page resources on first load.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Check for updates on page load
          registration.update().catch(() => {
            // Silently ignore update check failures (offline, etc.)
          });
        })
        .catch((err) => {
          // Only log in development; swallow in production to avoid noise
          if (process.env.NODE_ENV === "development") {
            console.warn("[SW] Registration failed:", err);
          }
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
