"use client";

import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";
import { cn } from "@/lib/utils";
import { useArtifactStore } from "@/lib/artifact-store";
import type { ExtractedImage } from "@/lib/types";

interface ScriptSection {
  id: string;
  label: string;
  voiceoverScript: string;
  bulletPoints: string[];
}

interface ScriptSectionEditorProps {
  artifactId: string;
  section: ScriptSection;
  imageAssignments: Record<string, number>;
  images: ExtractedImage[];
  imagesLoading: boolean;
  isPresentation: boolean;
  onOpenLightbox: (index: number, sectionId: string) => void;
}

export function ScriptSectionEditor({
  artifactId,
  section,
  imageAssignments,
  images,
  imagesLoading,
  isPresentation,
  onOpenLightbox,
}: ScriptSectionEditorProps) {
  const { updateScript, setImageAssignment } = useArtifactStore();

  return (
    <>
      {(images.length > 0 || imagesLoading) && (
        <div>
          <label className="font-sans text-[12px] max-sm:text-[11px] font-semibold text-ink dark:text-white mb-3 flex items-center gap-1.5 uppercase tracking-wide">
            <LabelTooltip
              label="Slide Image"
              description={
                isPresentation
                  ? "Choose an image to display with this section of the presentation, or leave it empty."
                  : "Choose an image to display with this section of the video, or leave it empty."
              }
            />
          </label>
          {imagesLoading ? (
            <p className="text-[12px] text-ink-muted dark:text-white/70">
              Loading images…
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImageAssignment(artifactId, section.id, -1)}
                className={cn(
                  "h-18 w-18 shrink-0 rounded-cta border-2 p-0 text-[11px] font-sans font-semibold transition-all cursor-pointer",
                  !(section.id in imageAssignments)
                    ? "border-saral-forest bg-saral-forest/10 text-saral-forest shadow-[0_4px_14px_rgba(74,93,85,0.18)] dark:bg-saral-forest/20 dark:text-white dark:border-saral-forest"
                    : "border-[#e5e2dc] dark:border-darkcardborder bg-white dark:bg-carddarkbg text-ink-muted dark:text-white/70 hover:border-saral-forest/40 hover:text-ink dark:hover:text-white",
                )}
              >
                None
              </Button>
              {images.map((img, arrIdx) => {
                const selected = imageAssignments[section.id] === img.index;
                return (
                  <Button
                    key={img.index}
                    type="button"
                    variant="outline"
                    onClick={() => onOpenLightbox(arrIdx, section.id)}
                    className={cn(
                      "group relative h-18 w-18 shrink-0 overflow-hidden rounded-cta border-2 p-0 transition-all cursor-pointer",
                      selected
                        ? "border-saral-forest ring-2 ring-saral-forest/35 ring-offset-2 ring-offset-white dark:ring-offset-carddarkbg shadow-[0_4px_14px_rgba(74,93,85,0.18)]"
                        : "border-transparent hover:border-saral-forest/40 hover:shadow-[0_4px_14px_rgba(74,93,85,0.10)]",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external presigned URLs */}
                    <img
                      src={img.url}
                      alt={`Slide image ${img.index + 1}`}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {selected && (
                      <span className="pointer-events-none absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-saral-forest text-white shadow">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="size-2.5"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="font-sans text-[12px] max-sm:text-[11px] font-semibold text-ink dark:text-white mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
          <LabelTooltip
            label={isPresentation ? "Slide notes" : "Voiceover Script"}
            description={
              isPresentation
                ? "Add notes for this slide, or leave it empty."
                : "Text that will be spoken for this section in the video"
            }
          />
        </label>
        <Textarea
          value={section.voiceoverScript}
          onChange={(e) =>
            updateScript(
              artifactId,
              section.id,
              "voiceoverScript",
              e.target.value,
            )
          }
          className={cn(
            "min-h-30 bg-white font-sans text-[13px] max-sm:text-[12px] border-pill-border rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent",
            isPresentation ? "min-h-28 resize-y" : "resize-none",
          )}
        />
      </div>

      <div>
        <label className="font-sans text-[12px] max-sm:text-[11px] font-semibold text-ink dark:text-white mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
          <LabelTooltip
            label="Slide Bullet Points"
            description="Short bullet lines displayed on the slide; edit, add or delete rows as needed."
          />
        </label>
        <div className="flex flex-col gap-2">
          {section.bulletPoints.map((point, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={point}
                onChange={(e) => {
                  const updated = [...section.bulletPoints];
                  updated[idx] = e.target.value;
                  updateScript(artifactId, section.id, "bulletPoints", updated);
                }}
                className="bg-white font-sans text-[13px] max-sm:text-[12px] border-pill-border rounded-lg focus:ring-2 focus:ring-ink focus:border-transparent"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete bullet point"
                onClick={() => {
                  const updated = section.bulletPoints.filter(
                    (_, i) => i !== idx,
                  );
                  updateScript(artifactId, section.id, "bulletPoints", updated);
                }}
                className="h-9 w-9 shrink-0 text-ink-faint hover:text-red-500 hover:bg-red-50"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              updateScript(artifactId, section.id, "bulletPoints", [
                ...section.bulletPoints,
                "",
              ]);
            }}
            className="mt-1 bg-linen dark:bg-saral-dark w-full gap-2 rounded-lg border-dashed border-pill-border font-sans text-[13px] text-ink hover:border-ink-muted hover:bg-linen/50 hover:text-ink dark:text-white"
          >
            <Plus size={14} /> Add bullet point
          </Button>
        </div>
      </div>
    </>
  );
}
