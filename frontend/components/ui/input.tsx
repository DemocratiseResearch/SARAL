import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Sizing — kept compact so dense layouts don't break.
        "h-9 w-full min-w-0 rounded-[11px] px-3.5 py-1.5 text-[14px] font-medium",
        // Surface — warm cream in light, subtle white wash in dark (matches login).
        "border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5",
        // Text + placeholder.
        "font-sans text-ink dark:text-white placeholder:text-ink-faint dark:placeholder:text-white/40",
        // Behavior.
        "shadow-none transition-colors outline-none",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // Focus ring — saral-forest accent matches the auth pages.
        "focus-visible:border-saral-forest focus-visible:ring-2 focus-visible:ring-saral-forest/30",
        // States.
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
