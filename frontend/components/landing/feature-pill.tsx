"use client";

import { useEffect, useState } from "react";

const FEATURES = [
  "Twitter Threads",
  "Presentation Slides",
  "Posters",
  "Reels",
  "Podcasts",
  "Business Briefs",
  "Video Presentations",
];

export default function FeaturePill() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % FEATURES.length);
        setPhase("in");
        setTimeout(() => setPhase("idle"), 400);
      }, 350);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  const animStyle: React.CSSProperties =
    phase === "out"
      ? { animation: "pillFlipOut 0.35s ease forwards" }
      : phase === "in"
        ? { animation: "pillFlipIn 0.4s ease forwards" }
        : {};

  return (
    <div
      className="
        animate-fade-up [animation-delay:0ms]
        mb-9 max-sm:mb-7 inline-flex items-center gap-2.5 max-sm:gap-2
        pl-3 pr-5 py-2 max-sm:pl-2.5 max-sm:pr-4 max-sm:py-1.5 rounded-pill
        bg-pill-bg border border-pill-border
        dark:bg-carddarkbg dark:border-darkcardborder
        shadow-[0_2px_12px_rgba(74,93,85,0.08)]
        text-[15px] max-sm:text-[13px] text-[#555555] dark:text-white/70 font-medium font-sans
        select-none
      "
      style={{ perspective: "400px" }}
    >
      <span
        className="
          inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 max-sm:px-2 rounded-pill
          bg-saral-forest/10 dark:bg-saral-forest/20
          text-[12px] max-sm:text-[11px] font-semibold text-saral-forest dark:text-white
        "
      >
        <span aria-hidden="true" className="relative inline-flex shrink-0 w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-dot opacity-60" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-dot" />
        </span>
        Share to socials
      </span>
      <span
        className="inline-block min-w-44 max-sm:min-w-36 text-center font-semibold text-ink dark:text-white"
        style={{
          ...animStyle,
          transformOrigin: "50% 50%",
          display: "inline-block",
        }}
      >
        {FEATURES[index]}
      </span>
    </div>
  );
}
