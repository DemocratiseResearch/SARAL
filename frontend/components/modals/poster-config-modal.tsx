"use client";

import { AnimatePresence, motion } from "motion/react";
import { X, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useArtifactStore } from "@/lib/artifact-store";
import {
  POSTER_THEMES,
  DEFAULT_POSTER_THEME,
  POSTER_LAYOUTS,
  DEFAULT_POSTER_LAYOUT,
  type PosterThemeValue,
  type PosterLayoutValue,
} from "@/lib/poster-themes";

const THEME_SWATCHES: Record<PosterThemeValue, { primary: string; secondary: string; surface: string }> = {
  classic_navy: { primary: "#0F2741", secondary: "#D97706", surface: "#F8FAFC" },
  teal_emerald: { primary: "#064E3B", secondary: "#059669", surface: "#ECFDF5" },
  crimson_burgundy: { primary: "#881337", secondary: "#BE123C", surface: "#FFF1F2" },
  slate_indigo: { primary: "#1E293B", secondary: "#4F46E5", surface: "#FAFAFA" },
  amber_earth: { primary: "#78350F", secondary: "#D97706", surface: "#FEF3C7" },
};

export default function PosterConfigModal() {
  const {
    posterConfigModalOpen,
    posterConfigPaperId,
    closePosterConfigModal,
    startPosterGeneration,
  } = useArtifactStore();

  const [theme, setTheme] = useState<PosterThemeValue>(DEFAULT_POSTER_THEME);
  const [layout, setLayout] = useState<PosterLayoutValue>(DEFAULT_POSTER_LAYOUT);

  const handleGenerate = () => {
    if (!posterConfigPaperId) return;
    closePosterConfigModal();
    startPosterGeneration(posterConfigPaperId, theme, layout);
  };

  return (
    <AnimatePresence>
      {posterConfigModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-2xl max-sm:max-w-[94vw] p-6 max-sm:p-5 max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-sans text-[20px] max-sm:text-[18px] font-semibold text-ink dark:text-white">
                  Configure Academic Poster
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePosterConfigModal}
                  className="h-8 w-8 text-ink-faint hover:text-ink dark:text-white hover:bg-linen-dark rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </Button>
              </div>
              <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 mb-5">
                Choose an academic color palette and layout archetype for your 120cm × 72cm conference poster.
              </p>

              <div className="space-y-6">
                {/* Theme Palette Picker */}
                <div>
                  <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2.5 block">
                    Color Palette
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {POSTER_THEMES.map((t) => {
                      const isSelected = theme === t.value;
                      const swatches = THEME_SWATCHES[t.value];
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setTheme(t.value)}
                          className={`relative text-left p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-saral-forest bg-saral-forest/5 shadow-sm"
                              : "border-pill-border hover:border-ink-faint bg-white dark:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex -space-x-1">
                              <span
                                className="w-4 h-4 rounded-full border border-white dark:border-black/20"
                                style={{ backgroundColor: swatches.primary }}
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-white dark:border-black/20"
                                style={{ backgroundColor: swatches.secondary }}
                              />
                            </div>
                            {isSelected && (
                              <Check size={14} className="ml-auto text-saral-forest font-bold" />
                            )}
                          </div>
                          <p className="font-sans text-[13px] font-semibold text-ink dark:text-white leading-tight">
                            {t.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Layout Archetype Picker */}
                <div>
                  <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2.5 block">
                    Poster Layout Archetype
                  </label>
                  <div className="space-y-2.5">
                    {POSTER_LAYOUTS.map((l) => {
                      const isSelected = layout === l.value;
                      return (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => setLayout(l.value)}
                          className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-saral-forest bg-saral-forest/5 shadow-sm"
                              : "border-pill-border hover:border-ink-faint bg-white dark:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-sans text-[14px] font-semibold text-ink dark:text-white">
                              {l.label}
                            </p>
                            {isSelected && (
                              <Check size={16} className="text-saral-forest font-bold" />
                            )}
                          </div>
                          <p className="font-sans text-[12px] text-ink-muted dark:text-white/70">
                            {l.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <Button
                  variant="outline"
                  onClick={closePosterConfigModal}
                  className="flex-1 cursor-pointer rounded-lg border-pill-border font-sans font-semibold text-[14px] py-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="flex-1 cursor-pointer bg-saral-forest hover:bg-[#3d4b45] text-white rounded-lg font-sans font-semibold text-[14px] py-5 transition-all"
                >
                  Generate Poster
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
