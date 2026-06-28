"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getUserKeys, putUserKeys, type UserKeys } from "@/lib/api";
import { Eye, EyeOff, Check, X, Loader2 } from "lucide-react";

interface ApiKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface KeyFieldState {
  editing: boolean;
  value: string;
  showValue: boolean;
  saving: boolean;
}

function defaultField(): KeyFieldState {
  return { editing: false, value: "", showValue: false, saving: false };
}

export default function ApiKeysDialog({
  open,
  onOpenChange,
}: ApiKeysDialogProps) {
  const [keys, setKeys] = useState<UserKeys | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gemini, setGemini] = useState<KeyFieldState>(defaultField());
  const [sarvam, setSarvam] = useState<KeyFieldState>(defaultField());

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserKeys();
      setKeys(data);
    } catch {
      setError("Failed to load API keys. Make sure you're logged in.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchKeys();
      setGemini(defaultField());
      setSarvam(defaultField());
    }
  }, [open, fetchKeys]);

  const saveKey = async (
    field: "gemini" | "sarvam",
    value: string,
    isClear = false,
  ) => {
    const setter = field === "gemini" ? setGemini : setSarvam;
    setter((s) => ({ ...s, saving: true }));
    try {
      const body =
        field === "gemini"
          ? { gemini_key: isClear ? "" : value }
          : { sarvam_key: isClear ? "" : value };
      const updated = await putUserKeys(body);
      setKeys(updated);
      setter(defaultField());
    } catch {
      setter((s) => ({ ...s, saving: false }));
    }
  };

  const renderKeyRow = (
    label: string,
    field: "gemini" | "sarvam",
    state: KeyFieldState,
    setState: React.Dispatch<React.SetStateAction<KeyFieldState>>,
    keySet: boolean,
    preview: string,
  ) => {
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").trim();
      if (!pasted) return;
      saveKey(field, pasted);
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-sans text-sm font-semibold text-ink dark:text-white">
            {label}
          </span>
          {keySet && !state.editing && (
            <Badge className="bg-[rgba(74,93,85,0.1)] text-saral-forest dark:text-white border-0 font-sans text-[11px] font-semibold px-2 py-0.5">
              Configured
            </Badge>
          )}
        </div>

        {state.editing ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={state.showValue ? "text" : "password"}
                value={state.value}
                onChange={(e) =>
                  setState((s) => ({ ...s, value: e.target.value }))
                }
                placeholder={preview || `Enter ${label}`}
                className="pr-10 font-mono text-sm border-pill-border dark:border-darkcardborder focus-visible:ring-saral-forest"
                disabled={state.saving}
                autoFocus
              />
              <button
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, showValue: !s.showValue }))
                }
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white transition-colors"
              >
                {state.showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button
              size="icon"
              onClick={() => saveKey(field, state.value)}
              disabled={state.saving || !state.value.trim()}
              className="w-9 h-9 bg-saral-forest hover:bg-[#3d4b45] text-white shrink-0"
            >
              {state.saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setState(defaultField())}
              disabled={state.saving}
              className="w-9 h-9 shrink-0 border border-pill-border"
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Input
                readOnly
                onPaste={handlePaste}
                value={keySet && preview ? preview : ""}
                placeholder={`Paste to save instantly…`}
                className="font-mono text-sm border-pill-border bg-[#fafafa] dark:bg-saral-dark text-ink-muted dark:text-white/70 cursor-default focus-visible:ring-1 focus-visible:ring-saral-forest"
              />
              {state.saving && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Loader2
                    size={14}
                    className="animate-spin text-ink-muted dark:text-white/70"
                  />
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState((s) => ({ ...s, editing: true }))}
              className="shrink-0 h-9 px-3 text-xs font-semibold border border-pill-border hover:bg-linen-dark text-ink dark:text-white"
            >
              {keySet ? "Edit" : "Set"}
            </Button>
            {keySet && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => saveKey(field, "", true)}
                className="shrink-0 h-9 px-3 text-xs font-semibold border border-pill-border hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-ink-muted dark:text-white/70"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100vw-2rem)] bg-white dark:bg-carddarkbg border-pill-border dark:border-darkcardborder rounded-[16px] shadow-xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b dark:border-darkcardborder border-[#f0ece4]">
          <DialogTitle className="font-sans font-bold text-[18px] text-ink dark:text-white">
            Configure API Keys
          </DialogTitle>
          <p className="font-sans text-sm text-ink-muted dark:text-white/70 mt-0.5">
            Your keys are stored securely and used only for generation.
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2
                size={24}
                className="animate-spin text-ink-muted dark:text-white/70"
              />
            </div>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="font-sans text-sm text-red-500">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchKeys}
                className="mt-3 text-ink dark:text-white hover:bg-linen-dark dark:hover:bg-saral-dark"
              >
                Retry
              </Button>
            </div>
          ) : keys ? (
            <>
              {renderKeyRow(
                "Gemini API Key",
                "gemini",
                gemini,
                setGemini,
                keys.gemini_key_set,
                keys.gemini_key_preview,
              )}
              <div className="w-full h-px bg-[#f0ece4] dark:bg-darkcardborder" />
              {renderKeyRow(
                "Sarvam API Key",
                "sarvam",
                sarvam,
                setSarvam,
                keys.sarvam_key_set,
                keys.sarvam_key_preview,
              )}
            </>
          ) : null}
        </div>

        <div className="px-6 pb-5">
          <DialogClose asChild>
            <Button
              variant="ghost"
              className="w-full h-10 border border-pill-border dark:bg-saral-dark dark:border-darkcardborder hover:bg-linen-dark text-ink dark:text-white font-semibold text-sm rounded-[8px]"
            >
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
