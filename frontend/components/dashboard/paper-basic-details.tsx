"use client";

import Link from "next/link";
import { PaperHintInfographic } from "@/components/dashboard/paper-hint-infographic";
import { usePaperStore } from "@/lib/paper-store";

interface PaperHeaderProps {
  /** Opens the mobile sheet to pick an artifact type to generate (paper detail only). */
  onOpenGenerateSheet?: () => void;
}

export default function PaperBasicDetails({
  onOpenGenerateSheet,
}: PaperHeaderProps = {}) {
  const { metadata } = usePaperStore();

  return (
    <>
      {/* Document-style header. Left-aligned, full-width, naturally
          responsive — no grid columns or absolute positioning to break
          on edge widths. The title is readable but stays compact (smaller
          and lighter than the centered empty-state heading below, which
          is the actual page hero). */}
      <header className="mb-6 sm:mb-8">
        <Link
          href="/dashboard/papers"
          className="inline-flex items-center font-sans font-semibold text-[13px] sm:text-[14px] text-ink-muted dark:text-white/70 hover:text-saral-forest transition-colors mb-3"
        >
          ← View All Papers
        </Link>
        <h1 className="font-sans font-semibold text-[20px] sm:text-[22px] md:text-[24px] text-ink dark:text-white leading-[1.25]">
          {metadata.title || "Title"}
        </h1>
        {(metadata.authors || metadata.year) && (
          <p className="mt-1.5 font-sans text-[13px] sm:text-[14px] text-ink-muted dark:text-white/60 leading-snug">
            {metadata.authors}
            {metadata.authors && metadata.year ? " · " : ""}
            {metadata.year ?? ""}
          </p>
        )}
      </header>

      <PaperHintInfographic onOpenGenerateSheet={onOpenGenerateSheet} />
    </>
  );
}
