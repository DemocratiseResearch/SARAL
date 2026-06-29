import { IconBrandInstagram } from "@tabler/icons-react";
import {
  FileUp,
  Video,
  Mic,
  MonitorPlay,
  ImageIcon,
  Zap,
  Link as LinkIcon,
} from "lucide-react";
import type { RefObject } from "react";

const GENERATE_ITEMS = [
  {
    Icon: Video,
    title: "Explainer Videos",
    desc: "Engaging summaries of your research in video format",
  },
  {
    Icon: Mic,
    title: "Podcast Episodes",
    desc: "Host + guest discussion format",
  },
  {
    Icon: MonitorPlay,
    title: "Slide Decks",
    desc: "Presentation-ready slides from your paper",
  },
  {
    Icon: ImageIcon,
    title: "Visual Posters",
    desc: "Conference-style research paper posters",
  },
  {
    Icon: IconBrandInstagram,
    title: "Instagram Reels",
    desc: "Crisp 60-second summaries for short-form video",
  },
];

export default function PaperEmptyState({
  isDragging,
  pdfInputRef,
  zipInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onPasteArxiv,
}: {
  isDragging: boolean;
  pdfInputRef: RefObject<HTMLInputElement | null>;
  zipInputRef: RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPasteArxiv: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-8 max-md:grid-cols-1">
      {/* Left: drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Click or drag a PDF here to upload"
        onClick={() => pdfInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") pdfInputRef.current?.click();
        }}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-8 py-16 text-center transition-all max-sm:py-10 ${
          isDragging
            ? "border-saral-forest bg-saral-forest/5 dark:bg-saral-forest/10 shadow-[0_8px_32px_rgba(74,93,85,0.12)]"
            : "border-[rgba(74,93,85,0.22)] dark:border-darkcardborder bg-white dark:bg-carddarkbg hover:border-saral-forest/45 hover:shadow-[0_8px_32px_rgba(74,93,85,0.09)]"
        }`}
      >
        <div
          className={`mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] transition-colors ${
            isDragging
              ? "bg-saral-forest/20"
              : "bg-saral-forest/10 group-hover:bg-saral-forest/15"
          }`}
        >
          <FileUp size={28} strokeWidth={1.75} className="text-saral-forest" />
        </div>
        <p className="mb-1.5 font-sans text-[20px] font-bold text-ink dark:text-white">
          {isDragging ? "Drop to upload" : "Upload paper to get started"}
        </p>
        <p className="mb-6 font-sans text-[14px] text-ink-muted dark:text-white/70">
          Upload a PDF to begin, or pick an option below
        </p>

        {/* Browse Files — triggers PDF picker */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Browse PDF files"
          onClick={(e) => {
            e.stopPropagation();
            pdfInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              pdfInputRef.current?.click();
            }
          }}
          className="mb-4 flex w-full max-w-72 cursor-pointer items-center justify-center rounded-[10px] bg-saral-forest px-6 py-2.5 font-sans text-[15px] font-bold text-white transition-colors hover:bg-saral-forest/90"
        >
          Browse Files
        </div>

        {/* Secondary options */}
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Paste arXiv URL"
            onClick={(e) => {
              e.stopPropagation();
              onPasteArxiv();
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-pill-border bg-linen dark:bg-saral-dark dark:border-darkcardborder px-5 py-3 font-sans text-[12px] text-ink-muted dark:text-white/70 transition-colors hover:border-saral-forest/30 hover:text-ink dark:text-white"
          >
            <LinkIcon size={11} />
            Paste arXiv URL
          </button>
          <button
            type="button"
            aria-label="Upload LaTeX .zip"
            onClick={(e) => {
              e.stopPropagation();
              zipInputRef.current?.click();
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-pill-border bg-linen dark:bg-saral-dark dark:border-darkcardborder px-5 py-3 font-sans text-[12px] text-ink-muted dark:text-white/70 transition-colors hover:border-saral-forest/30 hover:text-ink dark:text-white"
          >
            Upload LaTeX .zip
          </button>
        </div>
      </div>

      {/* Right: what you can generate */}
      <div>
        <h2 className="mb-4 font-sans text-[17px] font-bold text-ink dark:text-white">
          What you can generate?
        </h2>
        <div className="flex flex-col gap-2.5">
          {GENERATE_ITEMS.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-center gap-3.5 rounded-[14px] bg-white dark:bg-carddarkbg dark:border dark:border-saral-dark px-4 py-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-saral-forest/10">
                <Icon size={17} className="text-saral-forest" />
              </div>
              <div>
                <p className="font-sans text-[14px] font-semibold text-ink dark:text-white">
                  {title}
                </p>
                <p className="font-sans text-[12px] text-ink-muted dark:text-white/70">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
