"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtifactStore } from "@/lib/artifact-store";
import { getReelAvatars } from "@/lib/api";
import type { ReelAvatarPair } from "@/lib/types";

export default function ReelAvatarModal() {
  const {
    artifacts,
    selectedArtifactId,
    reelAvatarModalOpen,
    closeReelAvatarModal,
    selectReelAvatarAndFinalize,
  } = useArtifactStore();

  const artifact = artifacts.find((a) => a.id === selectedArtifactId);

  const [pairs, setPairs] = useState<ReelAvatarPair[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Fetch fresh catalog every time the modal opens (URLs expire in 1h).
  // Only run when the modal transitions to open; cleanup runs on close so we
  // avoid setState-in-effect for the closed branch.
  useEffect(() => {
    if (!reelAvatarModalOpen) {
      return () => {};
    }
    let cancelled = false;
    setLoading(true);
    getReelAvatars()
      .then((catalog) => {
        if (cancelled) return;
        setPairs(catalog.pairs);
        if (artifact?.reelSelectedPair) {
          setPickedId(artifact.reelSelectedPair);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load avatars",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
      // Reset all state on close so a re-open starts clean.
      // Must reset loading + submitting here because the finally/catch blocks
      // skip setLoading(false) when cancelled=true, and submitting is never
      // reset in the success path (modal closes before it could run).
      setPairs(null);
      setPickedId(null);
      setLoadError(null);
      setSubmitError(null);
      setLoading(false);
      setSubmitting(false);
    };
  }, [reelAvatarModalOpen, artifact?.reelSelectedPair]);

  if (!artifact) return null;

  const handleGenerate = async () => {
    if (!pickedId || !pairs) return;
    const pair = pairs.find((p) => p.id === pickedId);
    if (!pair) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await selectReelAvatarAndFinalize(
        artifact.id,
        pair.id,
        pair.person1_url,
        pair.person2_url,
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to finalize");
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {reelAvatarModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={submitting ? undefined : closeReelAvatarModal}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg rounded-2xl max-sm:rounded-xl shadow-2xl w-full max-w-200 max-sm:max-w-[95vw] max-h-[90vh] flex flex-col relative">
              {/* Header */}
              <div className="flex-none bg-white dark:bg-carddarkbg border-b border-[#f5f5f5] dark:border-darkcardborder px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex items-center justify-between rounded-t-2xl">
                <div>
                  <h2 className="font-serif text-[24px] max-sm:text-[20px] font-semibold text-ink dark:text-white">
                    Pick your avatars
                  </h2>
                  <p className="font-sans text-[13px] text-ink-muted dark:text-white/70 mt-1">
                    Choose a pair of speakers for the reel.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeReelAvatarModal}
                  disabled={submitting}
                  className="text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-linen-dark w-9 h-9 rounded-lg"
                >
                  <X size={20} />
                </Button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2
                      size={28}
                      className="animate-spin text-ink-muted dark:text-white/70"
                    />
                    <p className="font-sans text-[13px] text-ink-muted dark:text-white/70">
                      Loading avatars…
                    </p>
                  </div>
                )}

                {loadError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                  </div>
                )}

                {pairs && pairs.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    {pairs.map((pair) => {
                      const selected = pickedId === pair.id;
                      return (
                        <button
                          key={pair.id}
                          type="button"
                          onClick={() => setPickedId(pair.id)}
                          className={`group relative cursor-pointer rounded-xl border-2 transition-all p-4 text-left ${
                            selected
                              ? "border-saral-forest bg-saral-forest/5 shadow-md"
                              : "border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder dark:hover:border-saral-dark hover:border-ink-muted"
                          }`}
                        >
                          {selected && (
                            <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-saral-forest text-white flex items-center justify-center shadow-sm">
                              <Check size={15} />
                            </div>
                          )}
                          <div className="flex gap-3 items-end justify-center mb-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pair.person1_url}
                              alt={`${pair.name} — Speaker 1`}
                              className="w-24 h-24 max-sm:w-20 max-sm:h-20 rounded-full object-cover bg-linen dark:bg-saral-dark border dark:border-darkcardborder border-pill-border"
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pair.person2_url}
                              alt={`${pair.name} — Speaker 2`}
                              className="w-24 h-24 max-sm:w-20 max-sm:h-20 rounded-full object-cover bg-linen dark:bg-saral-dark border dark:hover:border-darkcardborder border-pill-border"
                            />
                          </div>
                          <p className="font-sans text-[14px] font-semibold text-ink dark:text-white text-center">
                            {pair.name}
                          </p>
                          {pair.description && (
                            <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 text-center mt-1 line-clamp-2">
                              {pair.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {submitError && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-[13px] text-red-700">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-none border-t border-[#f5f5f5] px-8 py-5 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex items-center justify-end gap-3 rounded-b-2xl">
                <Button
                  variant="outline"
                  onClick={closeReelAvatarModal}
                  disabled={submitting}
                  className="rounded-lg border-pill-border"
                >
                  Back
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!pickedId || submitting || loading}
                  className="bg-saral-forest hover:bg-saral-forest/90 text-white rounded-lg font-semibold min-w-36"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Generate Reel"
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
