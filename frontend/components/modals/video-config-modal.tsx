"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import type { AudienceLevel, Tone } from "@/lib/types";

// One question, two options. Tone is derived from audience (see TONE_FOR
// below) so the user never has to think about register — advanced gets
// formal, beginner gets conversational.
//
// We expose only Beginner / Advanced (the backend still supports the full
// novice/intermediate/expert tier set — we just don't surface the middle
// one because users don't reliably know what "intermediate" means).
//
// Previews describe what the OUTPUT will sound like, in plain words, without
// research-paper analogies or "for [persona]" framing.
const AUDIENCE_OPTIONS: {
  value: AudienceLevel;
  label: string;
  preview: string;
}[] = [
  {
    value: "novice",
    label: "Beginner",
    preview:
      "Simple summaries. High-level summaries explained in plain language.",
  },
  {
    value: "expert",
    label: "Advanced",
    preview: "In-depth breakdowns. Concepts explained in detail.",
  },
];

// Audience → tone. Advanced expects rigor; beginner lands better warm.
const TONE_FOR: Record<AudienceLevel, Tone> = {
  novice: "conversational",
  intermediate: "conversational",
  expert: "formal",
};

export default function VideoConfigModal() {
  const { videoConfigModalOpen, closeVideoConfigModal, confirmVideoConfig } =
    useArtifactStore();

  // Default to Beginner — safer fallback. An advanced user always notices
  // and switches; a beginner stuck with jargon-heavy output is lost.
  const [audience, setAudience] = useState<AudienceLevel>("novice");
  const [narrationLang, setNarrationLang] = useState("english");
  const [slideLanguage, setSlideLanguage] = useState("english");
  const [theme, setTheme] = useState<string>(DEFAULT_BEAMER_THEME);

  const handleGenerate = () => {
    confirmVideoConfig({
      audience_level: audience,
      tone: TONE_FOR[audience],
      language: narrationLang,
      ...(narrationLang !== "english" ? { slideLanguage } : {}),
      pptTemplate: theme,
    });
  };

  return (
    <AnimatePresence>
      {videoConfigModalOpen && (
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
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-4xl max-sm:max-w-[94vw] p-6 max-sm:p-5 max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-sans text-[20px] max-sm:text-[18px] font-semibold text-ink dark:text-white">
                  Who&apos;s this video for?
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeVideoConfigModal}
                  className="h-8 w-8 text-ink-faint hover:text-ink dark:text-white hover:bg-linen-dark rounded-lg"
                >
                  <X size={18} />
                </Button>
              </div>
              <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 mb-5">
                This helps us tailor the video to your needs.
              </p>

              {/* Horizontal layout: settings left, template gallery right. */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] max-md:grid-cols-1 gap-6">
                {/* LEFT: audience + language */}
                <div className="space-y-5">
                  <div>
                    <p className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2">
                      Audience
                    </p>
                    <RadioGroup
                      value={audience}
                      onValueChange={(v) => setAudience(v as AudienceLevel)}
                      className="gap-2"
                    >
                      {AUDIENCE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          htmlFor={`audience-${opt.value}`}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            audience === opt.value
                              ? "border-saral-forest bg-saral-forest/10 dark:bg-saral-forest/20"
                              : "border-pill-border bg-white dark:bg-saral-dark dark:border-darkcardborder dark:hover:bg-saral-dark hover:bg-linen-dark/40"
                          }`}
                        >
                          <RadioGroupItem
                            value={opt.value}
                            id={`audience-${opt.value}`}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="font-sans text-[13px] font-semibold text-ink dark:text-white">
                              {opt.label}
                            </p>
                            <p className="font-sans text-[11px] text-ink-muted dark:text-white/70 mt-0.5">
                              {opt.preview}
                            </p>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                      <LabelTooltip
                        label="Audio Language"
                        description="Language used for the video's spoken narration."
                      />
                    </label>
                    <Select
                      value={narrationLang}
                      onValueChange={(v) => {
                        setNarrationLang(v);
                        setSlideLanguage("english");
                      }}
                    >
                      <SelectTrigger className="w-full rounded-lg border-pill-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem
                            key={lang.apiValue}
                            value={lang.apiValue}
                          >
                            {lang.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {narrationLang !== "english" && (
                    <div>
                      <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2 block">
                        <LabelTooltip
                          label="Slide Language"
                          description="Language used for slide titles and bullet points."
                        />
                      </label>
                      <Select
                        value={slideLanguage}
                        onValueChange={setSlideLanguage}
                      >
                        <SelectTrigger className="w-full rounded-lg border-pill-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value={narrationLang}>
                            {LANGUAGES.find((l) => l.apiValue === narrationLang)
                              ?.displayName ?? narrationLang}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* RIGHT: slide template gallery */}
                <div>
                  <p className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2">
                    Slide Template
                  </p>
                  <ThemePicker value={theme} onChange={setTheme} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={closeVideoConfigModal}
                  className="flex-1 cursor-pointer rounded-lg border-pill-border font-sans font-semibold text-[14px] py-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="flex-1 cursor-pointer bg-saral-forest hover:bg-[#3d4b45] text-white rounded-lg font-sans font-semibold text-[14px] py-5 transition-all"
                >
                  Generate Video
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
