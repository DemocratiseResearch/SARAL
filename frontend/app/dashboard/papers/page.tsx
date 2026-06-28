"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Search, LayoutGrid, List, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePaperStore } from "@/lib/paper-store";
import { useArtifactStore } from "@/lib/artifact-store";
import UploadModal from "@/components/modals/upload-modal";
import TopNav from "@/components/dashboard/top-nav";
import { cn } from "@/lib/utils";
import { PaperGridCard } from "@/components/dashboard/paper-grid-card";
import { PaperListCard } from "@/components/dashboard/paper-list-card";
import PaperEmptyState from "@/components/dashboard/paper-empty-state";

type ViewMode = "grid" | "list";
type UploadEntryType = "pdf" | "latex" | "arxiv";
type SortOption = "recent" | "oldest" | "title-asc" | "title-desc";
type ArtifactFilter = "all" | "none" | "has";

const ARTIFACT_FILTER_LABELS: Record<ArtifactFilter, string> = {
  all: "All",
  none: "No outputs",
  has: "Has outputs",
};

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Recently Updated",
  oldest: "Oldest First",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
};

function ViewModeToggle({
  view,
  onViewChange,
  className,
}: {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-[10px] border border-[#e0dcd4] bg-white dark:bg-carddarkbg dark:border-darkcardborder px-1.5 py-1.5",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onViewChange("grid")}
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        className={`h-8 w-8 rounded-md ${
          view === "grid"
            ? "bg-[#e8e6e3] dark:bg-saral-dark text-ink hover:bg-[#e0dedb] hover:text-ink dark:text-white"
            : "text-ink-muted dark:text-white/70 hover:bg-transparent hover:text-ink"
        }`}
      >
        <LayoutGrid size={16} strokeWidth={1.75} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onViewChange("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
        className={`h-8 w-8 rounded-md ${
          view === "list"
            ? "bg-[#e8e6e3] dark:bg-saral-dark text-ink hover:bg-[#e0dedb] hover:text-ink dark:text-white"
            : "text-ink-muted dark:text-white/70 hover:bg-transparent hover:text-ink"
        }`}
      >
        <List size={16} strokeWidth={1.75} />
      </Button>
    </div>
  );
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export default function PapersPage() {
  const { papers, setFile } = usePaperStore();
  const artifacts = useArtifactStore((s) => s.artifacts);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialStep, setModalInitialStep] = useState<"select" | "upload">(
    "select",
  );
  const [modalInitialType, setModalInitialType] =
    useState<UploadEntryType>("pdf");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [artifactFilter, setArtifactFilter] = useState<ArtifactFilter>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [isDragging, setIsDragging] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Opens the modal fresh at the type-selection screen (Upload Paper button)
  const openModalFresh = () => {
    setModalInitialStep("select");
    setModalInitialType("pdf");
    setModalOpen(true);
  };

  // Opens the modal pre-set to a specific upload type, skipping step 1
  const openModalWithType = (type: UploadEntryType) => {
    setModalInitialStep("upload");
    setModalInitialType(type);
    setModalOpen(true);
  };

  // Called after a file is chosen via hidden input or drag & drop
  const handleFileReady = (file: File) => {
    const isZip = file.name.endsWith(".zip");
    setFile(file);
    openModalWithType(isZip ? "latex" : "pdf");
  };

  // Drag & drop handlers for the empty-state drop zone
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileReady(file);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (papers.length === 0) return;
        e.preventDefault();
        document.getElementById("papers-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [papers.length]);

  const paperArtifactCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of artifacts) {
      if (!a.paperId) continue;
      counts.set(a.paperId, (counts.get(a.paperId) ?? 0) + 1);
    }
    return counts;
  }, [artifacts]);

  const totalArtifacts = useMemo(
    () =>
      papers.reduce(
        (sum, p) => sum + (paperArtifactCount.get(p.paperId ?? "") ?? 0),
        0,
      ),
    [papers, paperArtifactCount],
  );

  const displayPapers = useMemo(() => {
    const matchesSearch = (paper: (typeof papers)[0]) =>
      !search ||
      fuzzyMatch(search, paper.title) ||
      fuzzyMatch(search, paper.authors) ||
      fuzzyMatch(search, paper.year ?? "");

    const matchesArtifactFilter = (paper: (typeof papers)[0]) => {
      if (artifactFilter === "all") return true;
      const count = paperArtifactCount.get(paper.paperId ?? "") ?? 0;
      return artifactFilter === "has" ? count > 0 : count === 0;
    };

    const list = papers
      .filter(matchesSearch)
      .filter(matchesArtifactFilter)
      .sort((a, b) => {
        switch (sortBy) {
          case "recent":
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          case "oldest":
            return (
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          case "title-asc":
            return a.title.localeCompare(b.title);
          case "title-desc":
            return b.title.localeCompare(a.title);
          default:
            return 0;
        }
      });
    return list;
  }, [papers, search, sortBy, artifactFilter, paperArtifactCount]);

  const handlePaperClick = (id: string) => {
    router.push(`/dashboard/paper/${id}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-400 flex-1 px-7 pb-20 pt-7 max-sm:px-4 max-sm:pb-16 max-sm:pt-5 md:px-20">
        {papers.length === 0 ? (
          /* ── Empty State ── */
          <>
            {/* Hidden file inputs — opened programmatically */}
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileReady(f);
                e.target.value = "";
              }}
            />
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileReady(f);
                e.target.value = "";
              }}
            />

            <div className="mb-8">
              <h1 className="font-sans text-[22px] font-extrabold leading-snug tracking-tight text-ink dark:text-white md:text-[26px]">
                My Papers
              </h1>
            </div>

            <PaperEmptyState
              isDragging={isDragging}
              pdfInputRef={pdfInputRef}
              zipInputRef={zipInputRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPasteArxiv={() => openModalWithType("arxiv")}
            />
          </>
        ) : (
          /* ── Papers list state ── */
          <>
            {/* Row 1: title + search + upload · Row 2: view + count + sort */}
            <div className="mb-4 flex flex-col gap-3.5 md:mb-7 md:gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 md:gap-4">
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <h1 className="font-sans text-[18px] font-extrabold leading-snug tracking-tight text-ink dark:text-white">
                    My Papers
                  </h1>
                  <Button
                    type="button"
                    onClick={openModalFresh}
                    className="h-9 shrink-0 cursor-pointer gap-1.5 rounded-[10px] bg-saral-forest px-2.5 font-sans text-[12px] font-bold text-white shadow-none hover:bg-saral-forest/90"
                  >
                    <FilePlus size={16} strokeWidth={2} aria-hidden />
                    <span className="hidden min-[380px]:inline">
                      Upload Paper
                    </span>
                    <span className="min-[380px]:hidden">Upload</span>
                  </Button>
                </div>
                <h1 className="hidden shrink-0 font-sans text-[22px] font-extrabold leading-snug tracking-tight text-ink dark:text-white sm:block md:text-[26px]">
                  My Papers
                </h1>
                <div className="relative min-w-0 w-full sm:flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint sm:left-3.5 md:left-4"
                    aria-hidden
                  />
                  <Input
                    id="papers-search"
                    type="search"
                    placeholder="Search papers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-full rounded-full border border-[#e0dcd4] dark:border-darkcardborder bg-white dark:bg-carddarkbg py-2 pl-9 pr-3 font-sans text-[13px] shadow-none placeholder:text-ink-faint focus-visible:border-saral-forest/35 focus-visible:ring-saral-forest/20 sm:h-10 sm:pl-10 sm:pr-4 sm:text-[14px] md:h-11 md:pl-11 md:pr-17"
                  />
                  <div
                    className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 font-sans text-[11px] font-medium text-ink-faint md:flex"
                    aria-hidden
                  >
                    <kbd className="rounded-md border border-[#e0dcd4] bg-[#f7f5f2] dark:border-darkcardborder dark:bg-carddarkbg px-1.5 py-0.5 font-sans">
                      ⌘
                    </kbd>
                    <kbd className="rounded-md border border-[#e0dcd4] bg-[#f7f5f2] dark:border-darkcardborder dark:bg-carddarkbg px-1.5 py-0.5 font-sans">
                      K
                    </kbd>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={openModalFresh}
                  className="hidden h-9 shrink-0 cursor-pointer gap-1.5 rounded-[10px] bg-saral-forest px-2.5 font-sans text-[12px] font-bold text-white shadow-none hover:bg-saral-forest/90 sm:inline-flex sm:h-10 sm:gap-2 sm:px-3.5 sm:text-[13px] md:h-11 md:px-5 md:text-[14px]"
                >
                  <FilePlus size={16} strokeWidth={2} aria-hidden />
                  <span className="hidden min-[380px]:inline">
                    Upload Paper
                  </span>
                  <span className="min-[380px]:hidden">Upload</span>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="whitespace-nowrap font-sans text-[12px] text-ink-muted dark:text-white/70 sm:text-[13px]">
                  {papers.length} {papers.length === 1 ? "paper" : "papers"}
                  <span className="mx-1.5 text-ink-faint dark:text-white/40">
                    ·
                  </span>
                  {totalArtifacts} {totalArtifacts === 1 ? "output" : "outputs"}{" "}
                  total
                </p>
                <div
                  role="tablist"
                  aria-label="Filter papers by outputs"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {(
                    Object.keys(ARTIFACT_FILTER_LABELS) as ArtifactFilter[]
                  ).map((key) => {
                    const active = artifactFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setArtifactFilter(key)}
                        className={cn(
                          "h-7 cursor-pointer rounded-pill border px-3 font-sans text-[12px] font-medium transition-colors sm:text-[13px]",
                          active
                            ? "border-saral-forest bg-saral-forest/10 text-saral-forest shadow-[0_2px_10px_rgba(74,93,85,0.12)] dark:bg-saral-forest/20 dark:text-white"
                            : "border-[#e0dcd4] bg-white text-ink-muted hover:bg-linen-dark hover:text-ink dark:border-darkcardborder dark:bg-carddarkbg dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white",
                        )}
                      >
                        {ARTIFACT_FILTER_LABELS[key]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* <div className="flex min-w-0 flex-row items-center justify-between gap-2 sm:gap-3">
                <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
                  <ViewModeToggle
                    view={view}
                    onViewChange={setView}
                    className="shrink-0"
                  />
                  <p className="whitespace-nowrap font-sans text-[12px] text-ink-muted dark:text-white/70 sm:text-[13px]">
                    {papers.length} {papers.length === 1 ? "paper" : "papers"}
                  </p>
                </div>
                <div className="flex shrink-0 justify-end">
                  <Select
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as SortOption)}
                  >
                    <SelectTrigger
                      size="default"
                      aria-label="Sort papers"
                      className="group min-h-11 w-fit min-w-0 shrink-0 cursor-pointer gap-1.5 rounded-[10px] border border-[#ebe8e3] bg-white dark:bg-carddarkbg dark:border-darkcardborder px-2.5 py-1.5 font-sans text-[12px] font-medium leading-normal text-ink-muted dark:text-white shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-white focus-visible:ring-0 focus-visible:ring-offset-0 data-[size=default]:h-auto data-[state=open]:bg-white dark:data-[state=open]:bg-carddarkbg sm:gap-2 sm:px-3.5 sm:text-[13px] md:px-5 md:text-[14px] [&>svg:last-child]:text-ink-muted dark:[&>svg:last-child]:text-white/70 [&>svg:last-child]:opacity-100"
                    >
                      <ArrowUpDown
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 text-ink-muted dark:text-white/70"
                        aria-hidden
                      />
                      <span className="hidden shrink-0 text-ink-muted dark:text-white/70 min-[400px]:inline sm:inline">
                        Sort by
                      </span>
                      <SelectValue placeholder={SORT_LABELS.recent} />
                    </SelectTrigger>
                    <SelectContent
                      align="end"
                      sideOffset={6}
                      className="min-w-48 rounded-cta border border-[#ebe8e2] bg-white p-1 shadow-[0_8px_28px_rgba(27,61,47,0.08)]"
                    >
                      {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                        <SelectItem
                          key={key}
                          value={key}
                          className="cursor-pointer rounded-[8px] px-2.5 py-2 font-sans text-[13px] text-ink-muted dark:text-white/70 focus:bg-[#f4f1ea] dark:focus:bg-darkcardbg focus:text-ink dark:focus:text-white"
                        >
                          {SORT_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div> */}
            </div>

            {/* Cards */}
            {displayPapers.length === 0 ? (
              <div className="py-16 text-center font-sans text-[15px] text-ink dark:text-white/70">
                {search
                  ? "No papers match your search."
                  : artifactFilter === "has"
                    ? "No papers have outputs yet."
                    : artifactFilter === "none"
                      ? "Every paper has at least one output."
                      : "No papers to show."}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:gap-6">
                {displayPapers.map((paper) => (
                  <PaperGridCard
                    key={paper.id}
                    paper={paper}
                    onViewOutputs={() => handlePaperClick(paper.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayPapers.map((paper) => (
                  <PaperListCard
                    key={paper.id}
                    paper={paper}
                    onViewOutputs={() => handlePaperClick(paper.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <UploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialStep={modalInitialStep}
        initialUploadType={modalInitialType}
      />
    </div>
  );
}
