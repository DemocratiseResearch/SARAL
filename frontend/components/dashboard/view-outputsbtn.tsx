import { ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function formatPaperCreatedAt(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PaperCardIcon({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
} = {}) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-saral-forest/11",
        className,
      )}
    >
      <FileText
        size={15}
        className={cn("text-saral-forest", iconClassName)}
        aria-hidden
      />
    </div>
  );
}

const VIEW_OUTPUTS_BUTTON_BASE =
  "h-8 cursor-pointer gap-1 rounded-[8px] border border-saral-forest/15 bg-saral-forest/8 px-3 font-sans text-[12px] font-semibold text-saral-forest shadow-none transition-colors hover:bg-saral-forest hover:text-white";

/** Solid forest CTA — use on grid and list cards so “View Outputs” matches everywhere. */
export const VIEW_OUTPUTS_SOLID_CLASSNAME =
  "w-auto border-transparent bg-saral-forest px-3 text-white shadow-none transition-opacity hover:bg-saral-forest hover:opacity-[0.88] hover:text-white";

export const VIEW_OUTPUTS_ARROW_GROUP_HOVER_CLASSNAME =
  "transition-transform group-hover:translate-x-0.5";

export function ViewOutputsButton({
  onClick,
  className,
  arrowClassName,
}: {
  onClick: () => void;
  className?: string;
  arrowClassName?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(VIEW_OUTPUTS_BUTTON_BASE, className)}
    >
      View Outputs
      <ArrowRight
        size={12}
        strokeWidth={2.25}
        className={arrowClassName}
        aria-hidden
      />
    </Button>
  );
}
