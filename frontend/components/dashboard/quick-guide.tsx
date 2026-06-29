"use client";

import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TourGuideProps {
  guideStep: number;
  onGuideStepChange: (step: number) => void;
  onDismiss: () => void;
}

export function TourGuide({
  guideStep,
  onGuideStepChange,
  onDismiss,
}: TourGuideProps) {
  return (
    <div
      className={cn(
        "z-100 rounded-[16px] border border-[#e5e5e5] bg-white p-5 shadow-[0_20px_60px_rgba(17,17,17,0.12)]",
        "fixed bottom-4 left-4 right-4 w-auto max-w-md sm:left-auto sm:right-4 sm:w-[min(100%-2rem,280px)]",
        "lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-auto lg:left-6 lg:top-[calc(100%+8px)] lg:w-[280px]",
      )}
    >
      <div className="pointer-events-none absolute left-6 -top-5 hidden text-saral-forest lg:block">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M12 20L12 6M12 6L6 12M12 6L18 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="relative flex flex-col gap-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-saral-forest">
            Quick Guide {guideStep}/2
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="size-7 shrink-0 rounded-full text-ink-muted dark:text-white/70 hover:bg-linen dark:bg-saral-dark hover:text-ink dark:text-white"
            aria-label="Close guide"
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>

        <div className="min-h-[44px]">
          {guideStep === 1 ? (
            <>
              <p className="mb-1 font-sans text-[14px] font-bold text-ink dark:text-white">
                Choose your artifact
              </p>
              <p className="font-sans text-[12px] leading-[1.6] text-ink-muted dark:text-white/70">
                Select a format like Video or Podcast to generate. You can create
                multiple formats from the same paper.
              </p>
            </>
          ) : (
            <>
              <p className="mb-1 font-sans text-[14px] font-bold text-ink dark:text-white">
                Review and edit
              </p>
              <p className="font-sans text-[12px] leading-[1.6] text-ink-muted dark:text-white/70">
                Once generated, click an artifact in the main area to view,
                edit, or download it.
              </p>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[rgba(0,0,0,0.05)] pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onDismiss}
            className="h-auto px-0 py-0 text-[12px] font-semibold text-ink-faint hover:bg-transparent hover:text-ink dark:text-white"
          >
            Skip tour
          </Button>
          {guideStep === 1 ? (
            <Button
              type="button"
              onClick={() => onGuideStepChange(2)}
              className="flex items-center gap-1 rounded-full bg-saral-forest px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-ink"
            >
              Next <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onDismiss}
              className="flex items-center gap-1 rounded-full bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#333]"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
