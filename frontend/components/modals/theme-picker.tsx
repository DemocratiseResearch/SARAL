"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, ZoomIn } from "lucide-react";
import { BEAMER_THEMES } from "@/lib/beamer-themes";

interface ThemePickerProps {
  value: string;
  onChange: (next: string) => void;
}

// Card grid + click-to-enlarge lightbox. Click a card to select; click the
// zoom-in icon (top-right) to view the actual rendered slide full-size.
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const [zoomed, setZoomed] = useState<
    (typeof BEAMER_THEMES)[number] | null
  >(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
        {BEAMER_THEMES.map((t) => {
          const selected = value === t.value;
          return (
            <div
              key={t.value}
              className={`relative rounded-lg border overflow-hidden transition-colors ${
                selected
                  ? "border-saral-forest ring-2 ring-saral-forest/40"
                  : "border-pill-border hover:border-ink/30 dark:border-darkcardborder"
              }`}
            >
              <button
                type="button"
                onClick={() => onChange(t.value)}
                className="block w-full cursor-pointer"
              >
                <img
                  src={t.preview}
                  alt={t.label}
                  className="w-full aspect-[16/9] object-cover bg-white"
                  loading="lazy"
                />
                <div
                  className={`px-2 py-1.5 text-[12px] font-medium text-center ${
                    selected
                      ? "bg-saral-forest/10 dark:bg-saral-forest/20 text-ink dark:text-white"
                      : "text-ink dark:text-white"
                  }`}
                >
                  {t.label}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setZoomed(t)}
                aria-label={`Preview ${t.label}`}
                className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 hover:bg-black/80 text-white cursor-pointer transition-colors"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {zoomed && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomed(null)}
              className="fixed inset-0 bg-black z-[60] cursor-zoom-out"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-6 pointer-events-none"
            >
              <div className="relative max-w-4xl w-full pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setZoomed(null)}
                  aria-label="Close preview"
                  className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-ink shadow-lg flex items-center justify-center cursor-pointer hover:bg-linen-dark"
                >
                  <X size={18} />
                </button>
                <img
                  src={zoomed.preview}
                  alt={zoomed.label}
                  className="w-full rounded-xl shadow-2xl bg-white"
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-sans text-[15px] font-semibold text-white">
                    {zoomed.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(zoomed.value);
                      setZoomed(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-saral-forest hover:bg-[#3d4b45] text-white text-[13px] font-semibold cursor-pointer transition-colors"
                  >
                    Use this template
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
