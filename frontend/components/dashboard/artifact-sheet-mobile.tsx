"use client";

import type { ReactNode } from "react";
import {
  Video,
  Mic,
  Presentation,
  Film,
  AtSign,
  Image,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ARTIFACT_LABELS, type ArtifactType } from "@/lib/artifact-store";
import { useStartArtifactGeneration } from "@/lib/use-start-artifact-generation";

const GENERATE_ITEMS: { type: ArtifactType; icon: ReactNode }[] = [
  { type: "video", icon: <Video size={16} /> },
  { type: "podcast", icon: <Mic size={16} /> },
  { type: "presentation", icon: <Presentation size={16} /> },
  { type: "reel", icon: <Film size={16} /> },
  { type: "x-linkedin", icon: <AtSign size={16} /> },
  { type: "poster", icon: <Image size={16} /> },
  { type: "business-brief", icon: <FileText size={16} /> },
];

export function ArtifactGenerateDropdownItems({
  onAfterPick,
}: {
  onAfterPick?: () => void;
}) {
  const start = useStartArtifactGeneration();

  return (
    <>
      {GENERATE_ITEMS.map(({ type, icon }) => (
        <DropdownMenuItem
          key={type}
          onClick={() => {
            start(type);
            onAfterPick?.();
          }}
          className="gap-2 font-sans"
        >
          <span className="text-muted-foreground">{icon}</span>
          {ARTIFACT_LABELS[type]}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function ArtifactGenerateSheetButtons({
  onAfterPick,
}: {
  onAfterPick?: () => void;
}) {
  const start = useStartArtifactGeneration();

  return (
    <>
      <SheetTitle className="pr-10 font-sans text-lg font-semibold leading-snug tracking-tight text-ink dark:text-white">
        What should we create?
      </SheetTitle>
      <ul className="mt-4 flex list-none flex-col gap-3 p-0 m-0" role="list">
        {GENERATE_ITEMS.map(({ type, icon }) => (
          <li key={type} className="m-0 p-0">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full justify-start gap-3 rounded-xl border-pill-border dark:border-darkcardborder bg-white px-3.5 py-3 font-sans font-semibold text-ink dark:text-white hover:bg-linen-dark"
              onClick={() => {
                start(type);
                onAfterPick?.();
              }}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-ink-muted dark:text-white/70 [&>svg]:size-4">
                {icon}
              </span>
              <span className="text-left">{ARTIFACT_LABELS[type]}</span>
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
