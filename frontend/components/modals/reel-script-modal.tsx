"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Plus, Trash2, Loader2, AlertCircle, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArtifactStore } from "@/lib/artifact-store";
import { REEL_SPEAKER_LABELS } from "@/lib/reel-languages";
import type { ReelTurn, ReelSpeaker } from "@/lib/types";

const MIN_TURNS = 4;
const MAX_TURNS = 12;

export default function ReelScriptModal() {
  const {
    artifacts,
    selectedArtifactId,
    reelScriptModalOpen,
    closeReelScriptModal,
    saveReelScript,
    proceedToReelAvatars,
  } = useArtifactStore();

  const artifact = artifacts.find((a) => a.id === selectedArtifactId);
  const script = artifact?.reelScript;

  const [turns, setTurns] = useState<ReelTurn[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate local state when modal opens with a fresh script
  useEffect(() => {
    if (reelScriptModalOpen && script) {
      setTurns(script.turns.map((t) => ({ ...t })));
      setErrorMsg(null);
    }
  }, [reelScriptModalOpen, script]);

  const validation = useMemo(() => {
    if (turns.length < MIN_TURNS) {
      return `At least ${MIN_TURNS} turns are required (currently ${turns.length}).`;
    }
    if (turns.length > MAX_TURNS) {
      return `At most ${MAX_TURNS} turns are allowed (currently ${turns.length}).`;
    }
    const emptyIdx = turns.findIndex((t) => t.text.trim().length === 0);
    if (emptyIdx !== -1) {
      return `Turn ${emptyIdx + 1} is empty.`;
    }
    return null;
  }, [turns]);

  if (!artifact || !script) return null;

  const updateTurnText = (index: number, text: string) => {
    setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, text } : t)));
  };

  const toggleTurnSpeaker = (index: number) => {
    setTurns((prev) =>
      prev.map((t, i) =>
        i === index
          ? {
              ...t,
              speaker: (t.speaker === "Person1"
                ? "Person2"
                : "Person1") as ReelSpeaker,
            }
          : t,
      ),
    );
  };

  const addTurn = () => {
    if (turns.length >= MAX_TURNS) return;
    const lastSpeaker = turns[turns.length - 1]?.speaker ?? "Person2";
    const nextSpeaker: ReelSpeaker =
      lastSpeaker === "Person1" ? "Person2" : "Person1";
    setTurns((prev) => [...prev, { speaker: nextSpeaker, text: "" }]);
  };

  const removeTurn = (index: number) => {
    if (turns.length <= MIN_TURNS) return;
    setTurns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleContinue = async () => {
    if (validation) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      // Only PUT if the user actually edited something
      const original = script.turns;
      const dirty =
        original.length !== turns.length ||
        turns.some(
          (t, i) =>
            t.speaker !== original[i]?.speaker ||
            t.text.trim() !== original[i]?.text?.trim(),
        );
      if (dirty) {
        await saveReelScript(
          artifact.id,
          turns.map((t) => ({ ...t, text: t.text.trim() })),
        );
      }
      proceedToReelAvatars(artifact.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save script");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {reelScriptModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={closeReelScriptModal}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3"
          >
            <div className="bg-white dark:bg-carddarkbg border border-[#ebe8e3] dark:border-darkcardborder shadow-2xl rounded-2xl max-sm:rounded-xl w-full max-w-200 max-sm:max-w-[95vw] max-h-[90vh] flex flex-col relative">
              {/* Header */}
              <div className="flex-none bg-white dark:bg-carddarkbg border-b border-[#eeebe6] dark:border-darkcardborder px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex items-center justify-between rounded-t-2xl">
                <div>
                  <h2 className="font-serif text-[24px] max-sm:text-[20px] font-semibold text-ink dark:text-white">
                    Review Reel Dialogue
                  </h2>
                  <p className="font-sans text-[13px] text-ink-muted dark:text-white/70 mt-1">
                    Edit the conversation between the two speakers.{" "}
                    {turns.length}/{MAX_TURNS} turns.
                    {script.analysis?.estimated_duration_seconds
                      ? ` ~${script.analysis.estimated_duration_seconds}s`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeReelScriptModal}
                  className="text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-linen-dark dark:hover:bg-saral-dark w-9 h-9 rounded-lg"
                >
                  <X size={20} />
                </Button>
              </div>

              {/* Turns list */}
              <div className="flex-1 overflow-y-auto px-8 py-6 max-lg:px-6 max-sm:px-5 max-sm:py-4 space-y-3 bg-linen dark:bg-saral-dark">
                {turns.map((turn, index) => (
                  <div
                    key={index}
                    className={`rounded-xl overflow-hidden border transition-all ${
                      turn.speaker === "Person1"
                        ? "border-saral-forest/25 dark:border-saral-forest/20"
                        : "border-saral-gold/40 dark:border-saral-gold/20"
                    }`}
                  >
                    {/* Speaker header stripe */}
                    <div
                      className={`flex items-center justify-between px-4 py-2.5 border-b ${
                        turn.speaker === "Person1"
                          ? "bg-saral-forest/[0.06] dark:bg-saral-forest/[0.12] border-saral-forest/[0.12] dark:border-saral-forest/[0.15]"
                          : "bg-saral-gold/[0.06] dark:bg-saral-gold/[0.10] border-saral-gold/[0.15] dark:border-saral-gold/[0.15]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTurnSpeaker(index)}
                        className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
                        title="Click to swap speaker"
                      >
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest ${
                            turn.speaker === "Person1"
                              ? "text-saral-forest dark:text-saral-forest/80"
                              : "text-amber-600 dark:text-saral-gold/80"
                          }`}
                        >
                          {turn.speaker}
                        </span>
                        <span className="text-ink-faint dark:text-white/20 text-[10px]">
                          ·
                        </span>
                        <span
                          className={`text-[13px] font-semibold ${
                            turn.speaker === "Person1"
                              ? "text-saral-forest dark:text-white"
                              : "text-amber-700 dark:text-white"
                          }`}
                        >
                          {REEL_SPEAKER_LABELS[turn.speaker]}
                        </span>
                        <Repeat2
                          size={11}
                          className="text-ink-faint dark:text-white/30 opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-faint dark:text-white/25 font-mono tabular-nums">
                          {index + 1}/{turns.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTurn(index)}
                          disabled={turns.length <= MIN_TURNS}
                          title={
                            turns.length <= MIN_TURNS
                              ? `Minimum ${MIN_TURNS} turns required`
                              : "Remove turn"
                          }
                          className="text-ink-faint hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 w-7 h-7 rounded-md disabled:opacity-25"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>

                    {/* Text content */}
                    <div className="bg-white dark:bg-saral-dark/20 px-4 py-3">
                      <Textarea
                        value={turn.text}
                        onChange={(e) => updateTurnText(index, e.target.value)}
                        rows={3}
                        placeholder="What does this speaker say?"
                        className="resize-none text-[14px] border-transparent bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:border-transparent shadow-none p-0 placeholder:text-ink-faint dark:placeholder:text-white/25"
                      />
                    </div>
                  </div>
                ))}

                {turns.length < MAX_TURNS && (
                  <Button
                    variant="outline"
                    onClick={addTurn}
                    className="w-full rounded-lg border-dashed border-pill-border text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white hover:bg-linen dark:hover:bg-saral-dark/60"
                  >
                    <Plus size={15} className="mr-1" /> Add turn
                  </Button>
                )}

                {(validation || errorMsg) && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 p-3 text-[13px] text-red-700 dark:text-red-300">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{errorMsg ?? validation}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-none border-t border-[#eeebe6] dark:border-darkcardborder px-8 py-5 max-lg:px-6 max-sm:px-5 max-sm:py-4 flex items-center justify-between gap-3 rounded-b-2xl bg-white dark:bg-carddarkbg">
                {/* <p className="font-sans text-[12px] text-ink-muted dark:text-white/70 hidden md:block">
                  Tap a speaker label to swap who delivers the line.
                </p> */}
                <div className="flex gap-3 ml-auto">
                  <Button
                    variant="outline"
                    onClick={closeReelScriptModal}
                    disabled={saving}
                    className="rounded-lg border-pill-border"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleContinue}
                    disabled={saving || validation !== null}
                    className="bg-saral-forest hover:bg-saral-forest/90 text-white rounded-lg font-semibold min-w-32"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
