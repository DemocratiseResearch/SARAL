"use client";

import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaperStore } from "@/lib/paper-store";
import { useEffect, useRef } from "react";

const PROCESSING_STEPS = [
  "Extracting Images…",
  "Parsing Text Content…",
  "Analyzing Document Structure…",
  "Generating Summary…",
];

/**
 * Renders a repeating "page" of skeleton bars so the
 * continuously-scrolling strip never runs out of content.
 */
function SkeletonPage() {
  return (
    <div className="space-y-5 py-4 shrink-0">
      {/* Title area */}
      <div className="flex gap-4">
        <Skeleton className="h-6 flex-1 rounded-md" />
        <Skeleton className="h-6 w-2/5 rounded-md" />
      </div>

      {/* Body text lines */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-3/5 rounded-md" />
      </div>

      {/* Image + text block */}
      <div className="flex gap-5">
        <Skeleton className="h-24 w-1/3 rounded-lg" />
        <div className="flex-1 flex flex-col gap-3 justify-center">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-4/5 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      </div>

      {/* More text */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
      </div>

      {/* Two images side by side */}
      <div className="flex gap-4">
        <Skeleton className="h-20 flex-1 rounded-lg" />
        <Skeleton className="h-20 flex-1 rounded-lg" />
      </div>

      {/* Footer text */}
      <div className="flex gap-4">
        <Skeleton className="h-4 flex-1 rounded-md" />
        <Skeleton className="h-4 w-1/4 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
      </div>
    </div>
  );
}

export default function ProcessingView() {
  const { processingStep, setProcessingStep, setDone, reset } = usePaperStore();
  const stepIndex = useRef(0);

  /* Simulate cycling through processing steps */
  useEffect(() => {
    stepIndex.current = 0;
    setProcessingStep(PROCESSING_STEPS[0]);

    const interval = setInterval(() => {
      stepIndex.current += 1;

      if (stepIndex.current >= PROCESSING_STEPS.length) {
        clearInterval(interval);
        setDone();
        return;
      }

      setProcessingStep(PROCESSING_STEPS[stepIndex.current]);
    }, 2800);

    return () => clearInterval(interval);
  }, [setProcessingStep, setDone]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ───── Left Panel — plum ───── */}
      <div className="md:w-[42%] bg-saral-plum relative flex flex-col justify-between p-10 md:p-14 min-h-[280px] md:min-h-screen">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white/90 text-sm font-sans transition-colors w-fit cursor-pointer bg-transparent border-none p-0"
        >
          <ArrowLeft size={16} />
          go back
        </button>

        <div className="mt-auto mb-auto">
          <h1 className="text-white font-serif text-[48px] max-lg:text-[38px] max-sm:text-[28px] leading-[1.1] font-extrabold tracking-tight">
            Hang on tight!
            <br />
            We&apos;re processing
            <br />
            your document
          </h1>
        </div>

        <div className="hidden md:block" />
      </div>

      {/* ───── Right Panel — Scrolling Paper ───── */}
      <div className="md:w-[58%] flex flex-col items-center justify-center p-8 md:p-14 lg:p-16 bg-linen dark:bg-saral-dark">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-[#e5e2dc] shadow-sm overflow-hidden">
          {/* Scrolling paper container */}
          <div className="relative h-[380px] overflow-hidden px-8 pt-2">
            {/* Top fade overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10 bg-linear-to-b from-white to-transparent" />

            {/* Scrolling strip */}
            <div className="animate-scroll-paper flex flex-col">
              <SkeletonPage />
              <SkeletonPage />
              <SkeletonPage />
            </div>

            {/* Bottom fade overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-10 bg-linear-to-t from-white to-transparent" />
          </div>

          {/* Processing step label */}
          <p className="py-5 text-center text-ink dark:text-white font-sans font-semibold text-[15px] tracking-wide border-t border-[#f0ede8]">
            {processingStep}
          </p>
        </div>
      </div>
    </div>
  );
}
