"use client";

import { AnimatePresence, motion } from "motion/react";
import { X, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArtifactStore } from "@/lib/artifact-store";
import { REEL_LANGUAGES, DEFAULT_REEL_LANGUAGE } from "@/lib/reel-languages";
import { useState, useEffect } from "react";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";

export default function ReelConfigModal() {
  const {
    reelConfigModalOpen,
    reelConfigPaperId,
    closeReelConfigModal,
    startReelGeneration,
    selectedArtifactId,
    artifacts,
  } = useArtifactStore();

  const sourceReel = (() => {
    const a = artifacts.find((x) => x.id === selectedArtifactId);
    return a?.type === "reel" && a.status === "done" ? a : undefined;
  })();

  const isEditMode = !!sourceReel;

  const [language, setLanguage] = useState(DEFAULT_REEL_LANGUAGE);

  useEffect(() => {
    if (!reelConfigModalOpen) return;
    if (sourceReel) {
      setLanguage(
        sourceReel.reelLanguage ??
          sourceReel.config.language ??
          DEFAULT_REEL_LANGUAGE,
      );
    } else {
      setLanguage(DEFAULT_REEL_LANGUAGE);
    }
  }, [reelConfigModalOpen, sourceReel]);

  const handleGenerate = () => {
    if (!reelConfigPaperId) return;
    startReelGeneration(reelConfigPaperId, language);
  };

  return (
    <AnimatePresence>
      {reelConfigModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={closeReelConfigModal}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-110 max-sm:max-w-[90vw] p-8 max-sm:p-5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-sans text-[22px] max-sm:text-[18px] font-semibold text-ink dark:text-white flex items-center gap-2">
                  <Film size={20} className="text-saral-forest" />
                  {isEditMode ? "Edit Reel" : "Configure Reel"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeReelConfigModal}
                  className="h-8 w-8 text-ink-faint hover:text-ink dark:text-white hover:bg-linen-dark rounded-lg"
                >
                  <X size={18} />
                </Button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="font-sans text-[14px] font-semibold text-ink dark:text-white mb-3 block">
                    <LabelTooltip
                      label="Language"
                      description="Sets the language used for the reel generation"
                    />
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full rounded-lg border-pill-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REEL_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 mt-2 leading-relaxed">
                    A two-person dialogue will be generated in this language and
                    rendered as a vertical 480×850 video.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <Button
                  variant="outline"
                  onClick={closeReelConfigModal}
                  className="flex-1 cursor-pointer rounded-lg border-pill-border font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="flex-1 cursor-pointer bg-saral-forest hover:bg-[#3d4b45] text-white rounded-lg font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6 transition-all"
                >
                  {isEditMode ? "Regenerate Reel" : "Generate Reel"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
