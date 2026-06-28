"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        // Layout — slightly bigger so the dot reads cleanly.
        "group/radio-group-item peer relative flex aspect-square size-4.5 shrink-0 cursor-pointer rounded-full outline-none",
        // Surface — clearly contrasting outline in both modes.
        "border-2 border-ink-muted/60 bg-white dark:border-white/40 dark:bg-white/5",
        // Hover affordance.
        "transition-colors hover:border-saral-forest dark:hover:border-saral-forest",
        // Checked — solid forest fill with white dot.
        "data-checked:border-saral-forest data-checked:bg-saral-forest dark:data-checked:border-saral-forest dark:data-checked:bg-saral-forest",
        // Focus ring.
        "focus-visible:ring-2 focus-visible:ring-saral-forest/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-carddarkbg",
        // Disabled.
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Invalid.
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        // Expanded hit-area for easier tapping.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="size-2 rounded-full bg-white" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
