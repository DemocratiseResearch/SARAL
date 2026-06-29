"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type LabelTooltipProps = {
  label: string;
  description: string;
  className?: string;
};

export function LabelTooltip({
  label,
  description,
  className,
}: LabelTooltipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        className,
      )}
    >
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`More information about ${label}`}
            className="size-4 min-h-0 min-w-0 shrink-0 rounded-full p-0 text-saral-forest dark:text-white/60 hover:bg-transparent hover:text-saral-forest/80 focus-visible:ring-2 focus-visible:ring-saral-forest/30"
          >
            <CircleHelp size={14} strokeWidth={2} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="max-w-65 rounded-xl border-0 bg-saral-forest px-3.5 py-2 text-[12px] leading-relaxed text-white shadow-lg [&>svg:last-child]:bg-saral-forest [&>svg:last-child]:fill-saral-forest"
        >
          {description}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
