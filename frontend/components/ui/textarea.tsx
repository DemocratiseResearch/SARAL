import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Layout — preserves shadcn's auto-grow + min height.
        "flex field-sizing-content min-h-16 w-full rounded-[11px] px-3.5 py-2.5 text-[14px] font-medium",
        // Surface — matches Input/Select.
        "border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5",
        // Text + placeholder.
        "font-sans text-ink dark:text-white placeholder:text-ink-faint dark:placeholder:text-white/40",
        // Behavior.
        "shadow-none transition-colors outline-none",
        // Focus ring — saral-forest accent.
        "focus-visible:border-saral-forest focus-visible:ring-2 focus-visible:ring-saral-forest/30",
        // States.
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
