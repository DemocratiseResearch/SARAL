"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared auth layout: Forest Tint page background, two atmospheric orbs, centred
 * white card. Used by `/login` and `AuthShell` (signup) for DRY shell styling.
 */
export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-saral-warm-neutral dark:bg-saral-dark flex items-center justify-center relative overflow-hidden px-4 py-6">
      {/* Light-mode orbs */}
      <div
        aria-hidden="true"
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none -right-20 -top-32 dark:hidden"
        style={{ background: "rgba(219,199,178,0.35)" }}
      />
      <div
        aria-hidden="true"
        className="absolute w-[380px] h-[380px] rounded-full pointer-events-none -left-20 -bottom-24 dark:hidden"
        style={{ background: "rgba(194,212,201,0.28)" }}
      />
      {/* Dark-mode orbs — cool deep tones tuned to the navy/forest palette */}
      <div
        aria-hidden="true"
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none -right-20 -top-32 hidden dark:block"
        style={{ background: "rgba(74,93,85,0.18)" }}
      />
      <div
        aria-hidden="true"
        className="absolute w-[380px] h-[380px] rounded-full pointer-events-none -left-20 -bottom-24 hidden dark:block"
        style={{ background: "rgba(131,104,121,0.12)" }}
      />
      <div className="w-full max-w-[460px] relative z-1 animate-[fadeIn_0.4s_ease_both]">
        {children}
      </div>
    </div>
  );
}

/** White card (460px max) with spec border + shadow; nest inside `AuthCardShell`. */
export function AuthCardInner({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full bg-white dark:bg-carddarkbg rounded-[28px] border border-[rgba(0,0,0,0.08)] dark:border-darkcardborder shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-9 max-sm:px-6 max-sm:py-7">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
