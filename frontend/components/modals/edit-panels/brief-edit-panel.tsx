"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LabelTooltip } from "@/components/dashboard/label-tooltip";
import { useArtifactStore } from "@/lib/artifact-store";
import { updateBusinessBrief } from "@/lib/api";
import type { Artifact } from "@/lib/artifact-store";
import { ErrorBanner } from "./error-banner";

const BRIEF_SECTION_ORDER = [
  "Executive Summary",
  "Business Problem Addressed",
  "Technical Innovation Summary",
  "Business Impact",
  "Commercial Applications",
  "Implementation Considerations",
  "Risks and Limitations",
  "Strategic Recommendations",
];

const BRIEF_SECTION_DESCRIPTIONS: Record<string, string> = {
  "Executive Summary":
    "A short overview of the brief for quick executive reading.",
  "Business Problem Addressed":
    "The problem, pain point, or gap this research or product addresses.",
  "Technical Innovation Summary":
    "What is novel technically—methods, models, or engineering advances.",
  "Business Impact":
    "Expected outcomes, value, or ROI for the business or market.",
  "Commercial Applications":
    "How this could be productized, licensed, or brought to market.",
  "Implementation Considerations":
    "What it takes to deploy—resources, partners, timelines, and constraints.",
  "Risks and Limitations":
    "Known risks, edge cases, ethical limits, or open issues.",
  "Strategic Recommendations":
    "Concrete next steps or decisions for leadership.",
};

interface BriefEditPanelProps {
  artifact: Artifact;
  open: boolean;
}

export function BriefEditPanel({ artifact, open }: BriefEditPanelProps) {
  const { closeEditModal, openPreviewModal, updateBriefSection } =
    useArtifactStore();
  const [saving, setSaving] = useState(false);

  // Business-brief no longer has an editing UI — if anything opens the edit
  // modal for one, redirect to the preview modal instead.
  useEffect(() => {
    if (!open) return;
    closeEditModal();
    openPreviewModal(artifact.id);
  }, [open, artifact, closeEditModal, openPreviewModal]);

  const handleSaveBrief = async () => {
    if (!artifact.paperId || !artifact.briefSections) return;
    setSaving(true);
    try {
      await updateBusinessBrief(artifact.paperId, artifact.briefSections);
      closeEditModal();
      openPreviewModal(artifact.id);
    } catch (err) {
      console.error("[edit-modal] updateBusinessBrief failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 space-y-6 max-sm:space-y-4">
        {artifact.errorMessage && <ErrorBanner message={artifact.errorMessage} />}

        <p className="font-sans text-[13px] text-ink-muted dark:text-white/70">
          Edit the generated sections below. Saving overwrites the stored brief;
          the PDF is re-rendered the next time you download it.
        </p>

        <div className="space-y-5">
          {BRIEF_SECTION_ORDER.filter(
            (key) => artifact.briefSections?.[key] !== undefined,
          ).map((key) => (
            <div key={key}>
              <label className="font-sans text-[13px] max-sm:text-[12px] font-semibold text-ink-muted dark:text-white/70 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
                <LabelTooltip
                  label={key}
                  description={
                    BRIEF_SECTION_DESCRIPTIONS[key] ??
                    `Content for the ${key} section of your business brief.`
                  }
                />
              </label>
              <Textarea
                value={artifact.briefSections?.[key] ?? ""}
                onChange={(e) =>
                  updateBriefSection(artifact.id, key, e.target.value)
                }
                className="min-h-35 font-sans text-[13px] max-sm:text-[12px] border-pill-border rounded-lg resize-y focus:ring-2 focus:ring-ink focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-none bg-white dark:bg-carddarkbg dark:border-darkcardborder border-t border-[#f5f5f5] px-8 py-5 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex justify-end rounded-b-2xl">
        <Button
          onClick={handleSaveBrief}
          disabled={saving}
          className="bg-ink cursor-pointer text-white hover:bg-[#333] font-sans font-semibold text-base max-sm:text-[14px] px-8 py-6 max-sm:w-full rounded-lg disabled:opacity-50 transition-all"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}
