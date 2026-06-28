"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "saral-pwa-banner-dismissed-v1";

export default function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const isMobile =
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    if (!isMobile) return;

    const iOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(iOS);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    if (iOS) setVisible(true);

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    setExiting(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 280);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") dismiss();
  }, [deferredPrompt, dismiss]);

  // ── Swipe-right-to-dismiss ──────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    dragging.current = true;
    if (cardRef.current) cardRef.current.style.transition = "none";
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || !cardRef.current) return;
    touchCurrentX.current = e.touches[0].clientX;
    const delta = Math.max(0, touchCurrentX.current - touchStartX.current);
    cardRef.current.style.transform = `translateX(${delta}px)`;
    cardRef.current.style.opacity = `${Math.max(0, 1 - delta / 160)}`;
  };

  const onTouchEnd = () => {
    if (!dragging.current || !cardRef.current) return;
    dragging.current = false;
    const delta = touchCurrentX.current - touchStartX.current;

    if (delta > 90) {
      // Far enough — swipe out
      cardRef.current.style.transition =
        "transform 0.22s ease, opacity 0.22s ease";
      cardRef.current.style.transform = "translateX(110%)";
      cardRef.current.style.opacity = "0";
      setTimeout(() => {
        sessionStorage.setItem(DISMISS_KEY, "1");
        setVisible(false);
      }, 230);
    } else {
      // Snap back
      cardRef.current.style.transition =
        "transform 0.22s ease, opacity 0.22s ease";
      cardRef.current.style.transform = "translateX(0)";
      cardRef.current.style.opacity = "1";
      setTimeout(() => {
        if (cardRef.current) {
          cardRef.current.style.transition = "";
          cardRef.current.style.transform = "";
          cardRef.current.style.opacity = "";
        }
      }, 230);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-200 flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: "max(10px, calc(env(safe-area-inset-top) + 6px))" }}
    >
      <Card
        ref={cardRef}
        role="banner"
        aria-label="Install Saral AI"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        data-exiting={exiting}
        className="pointer-events-auto w-full max-w-sm bg-pill-bg dark:bg-carddarkbg border border-pill-border dark:border-darkcardborder rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden
          animate-in fade-in slide-in-from-top-3 duration-300
          data-[exiting=true]:animate-out data-[exiting=true]:fade-out data-[exiting=true]:slide-out-to-top-3 data-[exiting=true]:duration-280"
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          {/* App icon */}
          <div className="relative shrink-0 w-10 h-10 rounded-[10px] overflow-hidden mt-0.5">
            <Image
              src="/light/Logo-Sqaure-light.svg"
              alt="Saral AI"
              fill
              className="dark:hidden object-contain"
            />
            <Image
              src="/dark/Logo-Sqaure-dark.svg"
              alt="Saral AI"
              fill
              className="hidden dark:block object-contain"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-[13px] font-bold text-ink dark:text-white leading-snug">
              Add Saral to your home screen
            </p>

            {isIOS ? (
              <ol className="mt-1.5 space-y-1 list-none">
                <li className="flex items-start gap-1.5 text-[12px] text-ink-muted dark:text-white/70 leading-relaxed">
                  <span className="shrink-0 font-bold text-ink-faint dark:text-white/30 mt-px">
                    1.
                  </span>
                  <span>
                    Tap the{" "}
                    <span className="inline-flex items-center gap-0.5 font-semibold text-ink dark:text-white">
                      Share
                      <span
                        aria-hidden="true"
                        className="inline-block ml-0.5 text-[11px] font-bold border border-ink/25 dark:border-white/25 rounded px-0.5 py-px leading-none"
                      >
                        ↑
                      </span>
                    </span>{" "}
                    button at the bottom of Safari
                  </span>
                </li>
                <li className="flex items-start gap-1.5 text-[12px] text-ink-muted dark:text-white/70 leading-relaxed">
                  <span className="shrink-0 font-bold text-ink-faint dark:text-white/30 mt-px">
                    2.
                  </span>
                  <span>
                    Scroll down and tap{" "}
                    <span className="font-semibold text-ink dark:text-white">
                      &ldquo;Add to Home Screen&rdquo;
                    </span>
                  </span>
                </li>
              </ol>
            ) : deferredPrompt ? (
              <p className="mt-1 text-[12px] text-ink-muted dark:text-white/70 leading-relaxed">
                One tap and Saral lives on your home screen — no app store
                needed.
              </p>
            ) : (
              <ol className="mt-1.5 space-y-1 list-none">
                <li className="flex items-start gap-1.5 text-[12px] text-ink-muted dark:text-white/70 leading-relaxed">
                  <span className="shrink-0 font-bold text-ink-faint dark:text-white/30 mt-px">
                    1.
                  </span>
                  <span>
                    Tap the{" "}
                    <span
                      aria-hidden="true"
                      className="inline-block font-bold text-ink dark:text-white"
                    >
                      ⋮
                    </span>{" "}
                    menu in your browser
                  </span>
                </li>
                <li className="flex items-start gap-1.5 text-[12px] text-ink-muted dark:text-white/70 leading-relaxed">
                  <span className="shrink-0 font-bold text-ink-faint dark:text-white/30 mt-px">
                    2.
                  </span>
                  <span>
                    Tap{" "}
                    <span className="font-semibold text-ink dark:text-white">
                      &ldquo;Add to Home screen&rdquo;
                    </span>
                  </span>
                </li>
              </ol>
            )}

            {!isIOS && deferredPrompt && (
              <Button
                size="sm"
                onClick={handleInstall}
                className="mt-3 h-7 px-4 text-[12px] rounded-full bg-ink dark:bg-white text-linen dark:text-ink hover:bg-ink/85 dark:hover:bg-white/90 font-semibold transition-colors"
              >
                Install now
              </Button>
            )}
          </div>

          {/* Dismiss */}
          <Button
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 -mt-0.5 -mr-1 p-1.5 rounded-full text-ink-faint hover:text-ink-muted dark:text-white/40 dark:hover:text-white/70 hover:bg-linen-dark dark:hover:bg-white/10 transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>

        {/* Swipe hint */}
        <p className="text-center text-[10px] text-ink-faint dark:text-white/25 pb-2.5 -mt-0.5 select-none tracking-wide">
          swipe right to dismiss
        </p>
      </Card>
    </div>
  );
}
