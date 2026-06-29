"use client";

import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareHeaderProps {
  title: string;
  icon?: ReactNode;
  onBack: () => void;
  onClose: () => void;
}

/** Shared header used by share-menu, share-youtube, share-linkedin views. */
export function ShareHeader({ title, icon, onBack, onClose }: ShareHeaderProps) {
  return (
    <div className="flex items-center justify-between px-7 pt-6 pb-5 max-sm:px-5 max-sm:pt-5 max-sm:pb-4 border-b dark:border-darkcardborder border-[#f0f0f0]">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
        >
          <ArrowLeft size={18} />
        </Button>
        <h2 className="font-sans text-[20px] max-sm:text-[16px] font-semibold text-ink dark:text-white leading-tight flex items-center gap-2">
          {icon}
          {title}
        </h2>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="h-9 w-9 max-sm:h-10 max-sm:w-10 text-ink-muted hover:text-ink dark:text-white hover:bg-linen-dark active:bg-linen-dark rounded-lg"
      >
        <X size={18} />
      </Button>
    </div>
  );
}
