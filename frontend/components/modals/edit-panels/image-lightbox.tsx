"use client";

import { AnimatePresence, motion } from "motion/react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExtractedImage } from "@/lib/types";

export interface LightboxState {
  index: number;
  sectionId: string;
}

interface ImageLightboxProps {
  lightboxState: LightboxState | null;
  images: ExtractedImage[];
  isSelected: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onUse: () => void;
}

export function ImageLightbox({
  lightboxState,
  images,
  isSelected,
  onClose,
  onPrev,
  onNext,
  onUse,
}: ImageLightboxProps) {
  return (
    <AnimatePresence>
      {lightboxState &&
        images.length > 0 &&
        (() => {
          const lb = lightboxState;
          const currentImg = images[lb.index];
          return (
            <>
              <motion.div
                key="lightbox-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md"
                onClick={onClose}
              />
              <motion.div
                key="lightbox-frame"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{
                  type: "spring",
                  damping: 24,
                  stiffness: 300,
                }}
                className="fixed inset-0 z-61 flex flex-col items-center justify-center p-8 max-sm:p-4 gap-5"
                onClick={onClose}
              >
                <motion.div
                  className="relative flex items-center justify-center max-h-[70vh] max-w-[90vw]"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_e, info) => {
                    if (info.offset.x < -60) onNext();
                    else if (info.offset.x > 60) onPrev();
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external presigned URLs */}
                  <img
                    key={currentImg?.url}
                    src={currentImg?.url}
                    alt={`Slide image ${(currentImg?.index ?? 0) + 1}`}
                    className="max-h-[70vh] max-w-[80vw] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/10 select-none"
                    draggable={false}
                  />
                </motion.div>

                <div
                  className="flex items-center gap-3 z-62 rounded-full bg-white/10 backdrop-blur-md px-4 py-1.5 ring-1 ring-white/15"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-sans text-[12px] font-medium text-white/70 tabular-nums">
                    {lb.index + 1} / {images.length}
                  </span>
                  <span className="h-4 w-px bg-white/20" aria-hidden />
                  <Button
                    type="button"
                    onClick={onUse}
                    className={cn(
                      "font-sans font-semibold text-[13px] rounded-full px-5 h-8 transition-all cursor-pointer",
                      isSelected
                        ? "bg-saral-forest text-white hover:bg-[#3d5248] shadow-[0_4px_14px_rgba(74,93,85,0.35)]"
                        : "bg-white text-ink hover:bg-white/90 shadow-[0_4px_14px_rgba(0,0,0,0.25)]",
                    )}
                  >
                    {isSelected ? "Selected" : "Use this image"}
                  </Button>
                </div>
              </motion.div>

              {images.length > 1 && (
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev();
                  }}
                  className="fixed left-5 top-1/2 -translate-y-1/2 z-62 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20 hover:ring-white/25 transition-all cursor-pointer max-sm:h-9 max-sm:w-9"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              {images.length > 1 && (
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  className="fixed right-5 top-1/2 -translate-y-1/2 z-62 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20 hover:ring-white/25 transition-all cursor-pointer max-sm:h-9 max-sm:w-9"
                >
                  <ChevronRight size={22} />
                </button>
              )}

              <button
                type="button"
                aria-label="Close image"
                onClick={onClose}
                className="fixed right-5 top-5 z-62 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/20 hover:ring-white/25 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </>
          );
        })()}
    </AnimatePresence>
  );
}
