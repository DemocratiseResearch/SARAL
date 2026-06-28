"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useArtifactStore } from "@/lib/artifact-store";
import { LANGUAGES } from "@/lib/languages";
import { DEFAULT_BEAMER_THEME } from "@/lib/beamer-themes";
import { ThemePicker } from "@/components/modals/theme-picker";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";

export default function PresentationConfigModal() {
  const {
    presentationConfigModalOpen,
    presentationConfigPaperId,
    closePresentationConfigModal,
    startPresentationGeneration,
  } = useArtifactStore();

  const [language, setLanguage] = useState("english");
  const [theme, setTheme] = useState<string>(DEFAULT_BEAMER_THEME);

  const handleGenerate = () => {
    if (!presentationConfigPaperId) return;
    closePresentationConfigModal();
    startPresentationGeneration(presentationConfigPaperId, language, theme);
  };

  return (
    <AnimatePresence>
      {presentationConfigModalOpen && (
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
                  Configure Presentation
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePresentationConfigModal}
                  className="h-8 w-8 text-ink-faint hover:text-ink dark:text-white hover:bg-linen-dark rounded-lg"
                >
                  <X size={18} />
                </Button>
              </div>
              <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 mb-5">
                Pick a language and a template. You can change either later via
                the edit tool.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                    <LabelTooltip
                      label="Slide Language"
                      description="Language used for slide titles, bullet points, and narration."
                    />
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full rounded-lg border-pill-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.apiValue} value={lang.apiValue}>
                          {lang.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2">
                    Slide Template
                  </p>
                  <ThemePicker value={theme} onChange={setTheme} />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={closePresentationConfigModal}
                  className="flex-1 cursor-pointer rounded-lg border-pill-border font-sans font-semibold text-[14px] py-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="flex-1 cursor-pointer bg-saral-forest hover:bg-[#3d4b45] text-white rounded-lg font-sans font-semibold text-[14px] py-5 transition-all"
                >
                  Generate Presentation
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
