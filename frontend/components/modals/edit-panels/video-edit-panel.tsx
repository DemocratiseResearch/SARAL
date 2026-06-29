"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";
import { useArtifactStore } from "@/lib/artifact-store";
import { LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/artifact-store";
import { useSectionImages } from "./use-section-images";
import { ScriptSectionEditor } from "./script-section-editor";
import { ImageLightbox, type LightboxState } from "./image-lightbox";
import { ErrorBanner } from "./error-banner";

interface VideoEditPanelProps {
  artifact: Artifact;
  open: boolean;
}

export function VideoEditPanel({ artifact, open }: VideoEditPanelProps) {
  const { closeEditModal, resumePipeline, setImageAssignment } =
    useArtifactStore();
  const [saving, setSaving] = useState(false);
  const [lightboxState, setLightboxState] = useState<LightboxState | null>(
    null,
  );

  // Local-only state — never written back to the store while editing.
  // This prevents the original artifact card from mutating its language pill
  // the moment the user touches a dropdown.
  const [narrationLang, setNarrationLang] = useState(
    artifact.config.language ?? "",
  );
  const [slideLanguage, setSlideLanguage] = useState(
    artifact.config.slideLanguage ?? artifact.config.language ?? "",
  );
  const [voiceGender, setVoiceGender] = useState<"male" | "female">(
    artifact.config.voiceGender ?? "female",
  );

  const { images, imagesLoading } = useSectionImages({
    enabled: open,
    isPresentation: false,
    artifactRunId: artifact.runId,
    paperRunId: artifact.videoPaperRunId,
    artifactId: artifact.id,
  });

  const handleGenerate = async () => {
    // Build the full script object from the current edit state.
    // resumePipeline receives it and uploads it to whatever new run_id
    // triggerVideoGeneration assigns — keeping the original video intact.
    const imageAssignments: Record<string, string> = {};
    for (const [sectionId, imageIndex] of Object.entries(
      artifact.imageAssignments,
    )) {
      const img = images.find((i) => i.index === imageIndex);
      if (img) {
        imageAssignments[sectionId] = img.gcs_path;
      }
    }

    const editedScript: import("@/lib/types").Script = {
      ...artifact.rawScript,
      run_id: artifact.runId ?? "",
      sections: artifact.scripts.map((s) => ({
        id: s.id,
        title: s.label,
        summary:
          artifact.rawScript?.sections.find((os) => os.id === s.id)?.summary ??
          "",
        narration: s.voiceoverScript,
        bullets: s.bulletPoints,
      })),
      language: narrationLang || artifact.rawScript?.language,
      voice_gender: voiceGender ?? artifact.rawScript?.voice_gender,
      ...(Object.keys(imageAssignments).length > 0 && {
        image_assignments: imageAssignments,
      }),
    };

    setSaving(true);
    setSaving(false);

    closeEditModal();
    if (artifact.runId) {
      const resolvedSlideLanguage =
        narrationLang !== "english"
          ? slideLanguage || narrationLang
          : undefined;
      resumePipeline(artifact.id, {
        language: narrationLang,
        voiceGender,
        editedScript,
        ...(resolvedSlideLanguage
          ? { slideLanguage: resolvedSlideLanguage }
          : {}),
      });
    }
  };

  const currentImg =
    lightboxState != null ? images[lightboxState.index] : undefined;
  const lightboxSelected = !!(
    currentImg &&
    lightboxState &&
    artifact.imageAssignments[lightboxState.sectionId] === currentImg.index
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 space-y-6 max-sm:space-y-4">
        {artifact.errorMessage && (
          <ErrorBanner message={artifact.errorMessage} />
        )}

        <div className="flex gap-6 max-sm:flex-col max-sm:gap-4">
          <div className="flex-1">
            <label className="font-sans text-[13px] max-sm:text-[12px] font-semibold text-ink dark:text-white mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
              <LabelTooltip
                label="Choose Audio Language"
                description="Sets the language for the video narration script."
              />
            </label>
            <Select
              value={narrationLang}
              onValueChange={(val) => {
                setNarrationLang(val);
                setSlideLanguage(val !== "english" ? val : "");
              }}
            >
              <SelectTrigger className="w-full bg-white border-pill-border rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent">
                <SelectValue placeholder="Select language" />
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

          {narrationLang &&
            narrationLang !== "english" &&
            (() => {
              const narrationDisplay =
                LANGUAGES.find((l) => l.apiValue === narrationLang)
                  ?.displayName ?? narrationLang;
              return (
                <div className="flex-1">
                  <label className="font-sans text-[13px] max-sm:text-[12px] font-semibold text-ink dark:text-white mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
                    <LabelTooltip
                      label="Choose Slide Language"
                      description="Sets language for content in slides"
                    />
                  </label>
                  <Select
                    value={slideLanguage || narrationLang}
                    onValueChange={(val) => setSlideLanguage(val)}
                  >
                    <SelectTrigger className="w-full bg-white border-pill-border rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent">
                      <SelectValue placeholder="Select slide language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={narrationLang}>
                        {narrationDisplay}
                      </SelectItem>
                      <SelectItem value="english">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

          <div className="flex-1">
            <label className="font-sans text-[13px] max-sm:text-[12px] font-semibold text-ink dark:text-white mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
              <LabelTooltip
                label="Choose Voice Gender"
                description="Gender for the narration of the video script."
              />
            </label>
            <Select
              value={voiceGender}
              onValueChange={(val) => setVoiceGender(val as "male" | "female")}
            >
              <SelectTrigger className="w-full bg-white border-pill-border rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2 border-t border-[#f5f5f5] dark:border-darkcardborder">
          <h3 className="font-sans text-[13px] max-sm:text-[12px] font-semibold text-ink dark:text-white mb-4 flex items-center gap-1.5 uppercase tracking-wide">
            <LabelTooltip
              label="Generated Scripts"
              description="AI-generated sections for video. Switch between tabs to review and refine each part"
            />
          </h3>

          <Tabs defaultValue={artifact.scripts[0]?.id ?? ""}>
            <TabsList className="mb-5 max-sm:mb-4 flex h-auto min-h-0 w-full max-w-full min-w-0 flex-none flex-row flex-wrap content-start items-stretch justify-start gap-2 rounded-none border-0 bg-transparent p-0 text-inherit shadow-none">
              {artifact.scripts.map((section) => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className={cn(
                    "relative box-border inline-flex max-w-full shrink-0 grow-0 basis-auto items-center whitespace-normal!",
                    "h-auto! min-h-11 border px-3 py-2.5 text-left font-sans text-[13px] leading-snug wrap-break-word max-sm:text-[12px] sm:text-center",
                    "flex-none! [&::after]:hidden",
                    "transition-[color,background-color,border-color,box-shadow] duration-150 outline-none select-none cursor-pointer",
                    "border-[#d4cfc6] bg-white text-[#494949] dark:border-darkcardborder dark:bg-carddarkbg dark:text-white",
                    "hover:z-1 hover:border-[#9e968a] hover:bg-[#f3f1ec] hover:text-ink dark:hover:border-white/20 dark:hover:bg-saral-forest/60 dark:hover:text-white",
                    "data-[state=active]:z-1 data-[state=active]:border-saral-forest data-[state=active]:bg-saral-forest data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:border-white/20 dark:data-[state=active]:bg-saral-forest/50",
                    "data-[state=active]:hover:border-saral-forest data-[state=active]:hover:bg-saral-forest/60 data-[state=active]:hover:text-white dark:data-[state=active]:hover:border-white/20 dark:data-[state=active]:hover:bg-saral-forest/60",
                    "focus-visible:z-1 focus-visible:border-saral-forest/50 focus-visible:ring-2 focus-visible:ring-saral-forest/35 focus-visible:ring-offset-2",
                  )}
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {artifact.scripts.map((section) => (
              <TabsContent
                key={section.id}
                value={section.id}
                className="space-y-5 mt-0 outline-none data-[state=inactive]:hidden isolate"
              >
                <ScriptSectionEditor
                  artifactId={artifact.id}
                  section={section}
                  imageAssignments={artifact.imageAssignments}
                  images={images}
                  imagesLoading={imagesLoading}
                  isPresentation={false}
                  onOpenLightbox={(index, sectionId) =>
                    setLightboxState({ index, sectionId })
                  }
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      <div className="flex-none bg-white dark:bg-carddarkbg dark:border-darkcardborder border-t border-[#f5f5f5] px-8 py-5 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex justify-end rounded-b-2xl">
        <Button
          onClick={handleGenerate}
          disabled={saving}
          className="bg-saral-forest cursor-pointer text-white hover:bg-[#3d4b45] font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6 max-sm:w-full rounded-lg disabled:opacity-50 transition-all"
        >
          {saving ? "Saving…" : "Confirm & Generate"}
        </Button>
      </div>

      <ImageLightbox
        lightboxState={lightboxState}
        images={images}
        isSelected={lightboxSelected}
        onClose={() => setLightboxState(null)}
        onPrev={() =>
          setLightboxState((lb) =>
            lb
              ? {
                  ...lb,
                  index: (lb.index - 1 + images.length) % images.length,
                }
              : lb,
          )
        }
        onNext={() =>
          setLightboxState((lb) =>
            lb ? { ...lb, index: (lb.index + 1) % images.length } : lb,
          )
        }
        onUse={() => {
          if (lightboxState && currentImg && !lightboxSelected) {
            setImageAssignment(
              artifact.id,
              lightboxState.sectionId,
              currentImg.index,
            );
          }
          setLightboxState(null);
        }}
      />
    </>
  );
}
