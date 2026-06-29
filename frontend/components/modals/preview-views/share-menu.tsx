"use client";

import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import {
  LinkedInIcon,
  XIcon2,
  YouTubeIcon,
} from "@/components/icons/preview-modal-icons";
import { ARTIFACT_LABELS, type ArtifactType } from "@/lib/artifact-store";
import { ShareHeader } from "./share-header";

const YOUTUBE_TYPES: ReadonlySet<ArtifactType> = new Set([
  "video",
  "podcast",
  "reel",
]);

interface ShareMenuProps {
  artifactType: ArtifactType;
  onBack: () => void;
  onClose: () => void;
  onOpenYouTube: () => void;
  onOpenLinkedIn: () => void;
}

export function ShareMenu({
  artifactType,
  onBack,
  onClose,
  onOpenYouTube,
  onOpenLinkedIn,
}: ShareMenuProps) {
  const label = ARTIFACT_LABELS[artifactType];
  const lowerLabel = label.toLowerCase();
  const showYouTube = YOUTUBE_TYPES.has(artifactType);

  return (
    <motion.div
      key="share-menu"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <ShareHeader title={`Share ${label}`} onBack={onBack} onClose={onClose} />
      <div className="px-7 py-6 max-sm:px-5 max-sm:py-5">
        <p className="font-sans text-[14px] text-ink-muted dark:text-white/70 mb-5">
          Choose a platform to share your {lowerLabel}
        </p>
        <div className="space-y-3">
          {showYouTube && (
            <button
              onClick={() => {
                onOpenYouTube();
              }}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-pill-border hover:cursor-pointer dark:border-darkcardborder hover:border-red-200 hover:bg-red-50 dark:hover:border-red-200 dark:hover:bg-red-400 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center shrink-0 group-hover:bg-red-100 dark:bg-red-900 dark:group-hover:bg-red-800 transition-colors">
                <YouTubeIcon className="text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[15px] font-semibold text-ink dark:text-white">
                  YouTube
                </p>
                <p className="font-sans text-[13px] text-ink-muted dark:text-white/70 mt-0.5">
                  Upload {lowerLabel} to your YouTube channel
                </p>
              </div>
              <ArrowLeft
                size={16}
                className="text-ink-faint rotate-180 shrink-0"
              />
            </button>
          )}

          <button
            onClick={() => {
              onOpenLinkedIn();
            }}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-pill-border hover:cursor-pointer dark:border-darkcardborder hover:border-blue-200 hover:bg-blue-50 dark:hover:border-blue-200 dark:hover:bg-sky-900 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:bg-blue-900 dark:group-hover:bg-blue-800 transition-colors">
              <LinkedInIcon className="text-[#0A66C2] dark:text-[#0A66C2]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sans text-[15px] font-semibold text-ink dark:text-white">
                LinkedIn
              </p>
              <p className="font-sans text-[13px] text-ink-muted dark:text-white/70 mt-0.5">
                Post {lowerLabel} to your LinkedIn feed
              </p>
            </div>
            <ArrowLeft
              size={16}
              className="text-ink-faint rotate-180 shrink-0"
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
