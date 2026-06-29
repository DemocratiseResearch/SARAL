"use client";

import { Loader2, FileText, Sparkles, Clock } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePaperStore } from "@/lib/paper-store";
import {
  useArtifactStore,
  ARTIFACT_LABELS,
  type ArtifactStatus,
  type ArtifactType,
} from "@/lib/artifact-store";

interface LogoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}

const IN_PROGRESS_STATUSES: ArtifactStatus[] = [
  "pending",
  "generating",
  "waiting-script",
];

export default function LogoutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: LogoutConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const papers = usePaperStore((s) => s.papers);
  const artifacts = useArtifactStore((s) => s.artifacts);

  const paperCount = papers.length;
  const totalArtifacts = artifacts.length;
  const inProgress = artifacts.filter((a) =>
    IN_PROGRESS_STATUSES.includes(a.status),
  );

  const byType = artifacts.reduce<Partial<Record<ArtifactType, number>>>(
    (acc, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const breakdownEntries = (Object.entries(byType) as [ArtifactType, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent
        showCloseButton={!pending}
        className="sm:max-w-md w-[calc(100vw-2rem)] bg-white dark:bg-carddarkbg dark:border-darkcardborder border-pill-border rounded-[16px] shadow-xl p-0 overflow-hidden"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b dark:border-darkcardborder border-[#f0ece4]">
          <DialogTitle className="font-sans font-bold text-[18px] text-ink dark:text-white">
            Log out of Saral AI?
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-cta border border-pill-border dark:border-darkcardborder bg-[#faf9f5] dark:bg-carddarkbg px-4 py-3.5">
              <div className="flex items-center gap-2 text-ink-muted dark:text-white/70">
                <FileText size={13} aria-hidden />
                <span className="font-sans text-[11px] font-semibold uppercase tracking-wide">
                  Papers
                </span>
              </div>
              <p className="mt-1 font-sans text-[24px] font-extrabold leading-none text-ink dark:text-white">
                {paperCount}
              </p>
            </div>
            <div className="rounded-cta border border-pill-border dark:border-darkcardborder dark:bg-carddarkbg bg-[#faf9f5] px-4 py-3.5">
              <div className="flex items-center gap-2 text-ink-muted dark:text-white/70">
                <Sparkles size={13} aria-hidden />
                <span className="font-sans text-[11px] font-semibold uppercase tracking-wide">
                  Generations
                </span>
              </div>
              <p className="mt-1 font-sans text-[24px] font-extrabold leading-none text-ink dark:text-white">
                {totalArtifacts}
              </p>
            </div>
          </div>

          {breakdownEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {breakdownEntries.map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded-full border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder px-2.5 py-1 font-sans text-[11px] font-semibold text-ink-muted dark:text-white/70"
                >
                  <span className="text-ink dark:text-white">{count}</span>
                  {ARTIFACT_LABELS[type]}
                  {count > 1 ? "s" : ""}
                </span>
              ))}
            </div>
          )}

          {inProgress.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-[10px] border border-[#f4d79e] dark:border-[#b45309] bg-[#fff8eb] dark:bg-[#4b2e00] px-3.5 py-3">
              <Clock
                size={14}
                className="mt-0.5 shrink-0 text-[#b45309] dark:text-[#f4d79e]"
                aria-hidden
              />
              <p className="font-sans text-[12.5px] leading-relaxed text-[#7c4a06] dark:text-[#f4d79e]/90">
                <span className="font-semibold">
                  {inProgress.length} still running
                </span>
                {" — "}
                you won&apos;t see {inProgress.length === 1
                  ? "it"
                  : "them"}{" "}
                when you sign back in.
              </p>
            </div>
          )}

          <p className="font-sans text-[12.5px] leading-relaxed text-ink-muted dark:text-white/70">
            All of this is saved only in this browser. Logging out clears it
            from this device.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-[#faf9f5] dark:bg-carddarkbg border-t border-[#f0ece4] dark:border-darkcardborder">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-9 px-4 cursor-pointer rounded-[10px] font-sans text-[13px] font-semibold border border-pill-border bg-white dark:bg-saral-dark dark:border-carddarkbg hover:bg-linen-dark text-ink dark:text-white"
          >
            Stay signed in
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="h-9 px-4 cursor-pointer rounded-[10px] font-sans text-[13px] font-semibold bg-saral-forest text-white hover:bg-[#333333] gap-1.5"
          >
            {pending ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden />
                Logging out…
              </>
            ) : (
              "Log out anyway"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
