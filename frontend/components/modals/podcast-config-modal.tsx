"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useArtifactStore } from "@/lib/artifact-store";
import { LANGUAGES } from "@/lib/languages";
import { useEffect, useState } from "react";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";

export default function PodcastConfigModal() {
  const {
    artifacts,
    selectedArtifactId,
    podcastConfigModalOpen,
    podcastConfigPaperId,
    closePodcastConfigModal,
    startPodcastGeneration,
  } = useArtifactStore();

  // If the modal was opened from a pencil click on an existing podcast,
  // pre-fill with that podcast's current settings so the user only changes
  // what they want. Otherwise (one-click Generate Podcast) start at defaults.
  const sourcePodcast = (() => {
    const a = artifacts.find((x) => x.id === selectedArtifactId);
    return a?.type === "podcast" && a.status === "done" ? a : undefined;
  })();

  const [language, setLanguage] = useState("english");
  const [hostAGender, setHostAGender] = useState<"female" | "male">("female");
  const [hostBGender, setHostBGender] = useState<"female" | "male">("male");
  const [renderVideo, setRenderVideo] = useState(true);

  // Reset / pre-fill whenever the modal transitions from closed -> open so
  // the user sees the right starting state for this invocation.
  useEffect(() => {
    if (!podcastConfigModalOpen) return;
    if (sourcePodcast) {
      setLanguage(sourcePodcast.config.language ?? "english");
      setHostAGender(
        (sourcePodcast.config.voiceGender as "female" | "male") ?? "female",
      );
      // hostBGender isn't currently stored on the artifact; default to the
      // opposite of host A so the user gets a sensible two-voice pairing.
      setHostBGender(
        sourcePodcast.config.voiceGender === "male" ? "female" : "male",
      );
      setRenderVideo(sourcePodcast.podcastRenderVideo !== false);
    } else {
      setLanguage("english");
      setHostAGender("female");
      setHostBGender("male");
      setRenderVideo(true);
    }
  }, [podcastConfigModalOpen, sourcePodcast]);

  const handleGenerate = () => {
    if (!podcastConfigPaperId) return;
    startPodcastGeneration(podcastConfigPaperId, {
      language,
      hostAGender,
      hostBGender,
      renderVideo,
    });
  };

  return (
    <AnimatePresence>
      {podcastConfigModalOpen && (
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
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-110 max-sm:max-w-[90vw] p-8 max-sm:p-5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-sans text-[22px] max-sm:text-[18px] font-semibold text-ink dark:text-white">
                  Configure Podcast
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePodcastConfigModal}
                  className="h-8 w-8 text-ink-faint hover:text-ink dark:text-white hover:bg-linen-dark rounded-lg"
                >
                  <X size={18} />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Language Selection */}
                <div>
                  <label className="font-sans text-[14px] font-semibold text-ink dark:text-white mb-3 block">
                    <LabelTooltip
                      label="Language"
                      description="Language used for the podcast script and spoken dialogue."
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

                {/* Host A & B Gender — stacked */}
                <div className="flex flex-col gap-4">
                  {/* Host A */}
                  <div>
                    <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2.5 block">
                      <LabelTooltip
                        label="Host A Gender"
                        description="Voice gender for the first host in the two-host podcast dialogue."
                      />
                    </label>
                    <RadioGroup
                      value={hostAGender}
                      onValueChange={(v) =>
                        setHostAGender(v as "female" | "male")
                      }
                      className="grid grid-cols-2 gap-2"
                    >
                      {(["female", "male"] as const).map((opt) => {
                        const selected = hostAGender === opt;
                        return (
                          <label
                            key={opt}
                            htmlFor={`host-a-${opt}`}
                            className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-4 py-3 font-sans text-[13px] font-medium capitalize transition-all ${
                              selected
                                ? "border-saral-forest bg-saral-forest/10 dark:bg-saral-forest/20 text-saral-forest dark:text-white shadow-[0_2px_10px_rgba(74,93,85,0.12)]"
                                : "border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5 text-ink-muted dark:text-white/70 hover:border-saral-forest/40 hover:text-ink dark:hover:text-white"
                            }`}
                          >
                            <RadioGroupItem value={opt} id={`host-a-${opt}`} />
                            {opt}
                          </label>
                        );
                      })}
                    </RadioGroup>
                  </div>

                  {/* Host B */}
                  <div>
                    <label className="font-sans text-[13px] font-semibold text-ink dark:text-white mb-2.5 block">
                      <LabelTooltip
                        label="Host B Gender"
                        description="Voice gender for the second host in the two-host podcast dialogue."
                      />
                    </label>
                    <RadioGroup
                      value={hostBGender}
                      onValueChange={(v) =>
                        setHostBGender(v as "female" | "male")
                      }
                      className="grid grid-cols-2 gap-2"
                    >
                      {(["female", "male"] as const).map((opt) => {
                        const selected = hostBGender === opt;
                        return (
                          <label
                            key={opt}
                            htmlFor={`host-b-${opt}`}
                            className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-4 py-3 font-sans text-[13px] font-medium capitalize transition-all ${
                              selected
                                ? "border-saral-forest bg-saral-forest/10 dark:bg-saral-forest/20 text-saral-forest dark:text-white shadow-[0_2px_10px_rgba(74,93,85,0.12)]"
                                : "border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5 text-ink-muted dark:text-white/70 hover:border-saral-forest/40 hover:text-ink dark:hover:text-white"
                            }`}
                          >
                            <RadioGroupItem value={opt} id={`host-b-${opt}`} />
                            {opt}
                          </label>
                        );
                      })}
                    </RadioGroup>
                  </div>
                </div>

                {/* Render Video Toggle */}
                {/* <div className="flex items-center justify-between p-4 rounded-lg bg-linen-dark/50 dark:bg-saral-forest/50">
                  <div className="min-w-0 pr-3">
                    <div className="font-sans text-[14px] font-semibold text-ink dark:text-white">
                      <LabelTooltip
                        label="Generate Waveform Video"
                        description="When enabled, SARAL also produces an MP4 with an audio waveform visualization."
                      />
                    </div>
                    <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 mt-1">
                      Creates an MP4 with audio waveform visualization
                    </p>
                  </div>
                  <Switch
                    checked={renderVideo}
                    onCheckedChange={setRenderVideo}
                  />
                </div> */}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-8">
                <Button
                  variant="outline"
                  onClick={closePodcastConfigModal}
                  className="flex-1 cursor-pointer rounded-lg border-pill-border font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="flex-1 cursor-pointer bg-saral-forest hover:bg-[#3d4b45] text-white rounded-lg font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6 transition-all"
                >
                  Generate Podcast
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
