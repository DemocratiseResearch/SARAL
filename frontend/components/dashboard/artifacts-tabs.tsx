"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video,
  Mic,
  Presentation,
  Film,
  AtSign,
  Image,
  FileText,
  Play,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useArtifactStore,
  type Artifact,
  type ArtifactType,
  ARTIFACT_LABELS,
} from "@/lib/artifact-store";
import { usePaperStore } from "@/lib/paper-store";
import { useStartArtifactGeneration } from "@/lib/use-start-artifact-generation";
import { GA_EVENTS, trackGAEvent } from "@/lib/gtag";
import {
  ARTIFACT_TAB_ITEMS,
  ArtifactEntriesGrid,
  CardCarousel,
  type ArtifactCarouselEntry,
} from "@/components/dashboard/paper-artifact-cards";
// import { TourGuide } from "@/components/dashboard/quick-guide";

const ALL_ARTIFACTS_TAB = "all";

/** Quick-pick cards on the “All” empty state — order matches product list. */
const EMPTY_STATE_CARD_TYPES = [
  "video",
  "presentation",
  "podcast",
  "reel",
  "poster",
  "business-brief",
  "x-linkedin",
] as const satisfies readonly ArtifactType[];

type EmptyStateArtifactType = (typeof EMPTY_STATE_CARD_TYPES)[number];

/** Icon tile colors — Saral tokens only (forest / gold / plum / amber-dot). */
const EMPTY_STATE_CARD_STYLES: Record<
  EmptyStateArtifactType,
  { iconWrap: string; iconClass: string }
> = {
  video: { iconWrap: "bg-saral-plum/15", iconClass: "text-saral-plum" },
  presentation: {
    iconWrap: "bg-saral-forest/15",
    iconClass: "text-saral-forest",
  },
  podcast: { iconWrap: "bg-saral-gold/20", iconClass: "text-saral-gold" },
  reel: { iconWrap: "bg-amber-dot/12", iconClass: "text-amber-dot" },
  poster: {
    iconWrap: "bg-saral-forest/12",
    iconClass: "text-saral-forest",
  },
  "x-linkedin": {
    iconWrap: "bg-saral-plum/12",
    iconClass: "text-saral-plum",
  },
  "business-brief": {
    iconWrap: "bg-saral-gold/12",
    iconClass: "text-saral-gold",
  },
};

const EMPTY_STATE_CARD_ICONS: Record<EmptyStateArtifactType, ReactNode> = {
  video: <Video className="size-5 shrink-0" strokeWidth={2} aria-hidden />,
  podcast: <Mic className="size-5 shrink-0" strokeWidth={2} aria-hidden />,
  presentation: (
    <Presentation className="size-5 shrink-0" strokeWidth={2} aria-hidden />
  ),
  reel: (
    <Play className="size-5 shrink-0 fill-current text-current" aria-hidden />
  ),
  poster: <Image className="size-5 shrink-0" strokeWidth={2} aria-hidden />,
  "x-linkedin": (
    <AtSign className="size-5 shrink-0" strokeWidth={2} aria-hidden />
  ),
  "business-brief": (
    <FileText className="size-5 shrink-0" strokeWidth={2} aria-hidden />
  ),
};

function emptyStateCardLabel(type: EmptyStateArtifactType): string {
  if (type === "x-linkedin") return "LinkedIn/X post";
  return ARTIFACT_LABELS[type];
}

/** GA event fired when a generate button for a given artifact type is clicked. */
const ARTIFACT_GA_EVENT: Record<ArtifactType, string> = {
  video: GA_EVENTS.ONE_CLICK_VIDEO,
  podcast: GA_EVENTS.ONE_CLICK_PODCAST,
  poster: GA_EVENTS.ONE_CLICK_POSTER,
  reel: GA_EVENTS.CUSTOM_REEL_GENERATION,
  "business-brief": GA_EVENTS.BUSINESS_BRIEF,
  presentation: GA_EVENTS.ONE_CLICK_PRESENTATION,
  "x-linkedin": GA_EVENTS.SOCIAL_POST,
};

const TAB_ICONS: Record<ArtifactType, ReactNode> = {
  video: <Video className="size-4 shrink-0" strokeWidth={2} />,
  podcast: <Mic className="size-4 shrink-0" strokeWidth={2} />,
  presentation: <Presentation className="size-4 shrink-0" strokeWidth={2} />,
  reel: <Film className="size-4 shrink-0" strokeWidth={2} />,
  "x-linkedin": <AtSign className="size-4 shrink-0" strokeWidth={2} />,
  poster: <Image className="size-4 shrink-0" strokeWidth={2} />,
  "business-brief": <FileText className="size-4 shrink-0" strokeWidth={2} />,
};

/** Panel titles use singular labels; carousel sections still use plural from ARTIFACT_TAB_ITEMS. */
const TAB_PANEL_COPY: Record<
  ArtifactType,
  {
    subtitle: string;
    generateVerb: string;
    emptyHeadline: string;
    emptyDescription: string;
  }
> = {
  video: {
    subtitle: "Professional narrated video",
    generateVerb: "Generate Video",
    emptyHeadline: "Generate a video from this paper",
    emptyDescription:
      "SARAL AI will analyze the paper and produce a narrated video with slides tailored to your research.",
  },
  podcast: {
    subtitle: "Audio overview",
    generateVerb: "Generate Podcast",
    emptyHeadline: "Generate a podcast from this paper",
    emptyDescription:
      "SARAL AI will turn the paper into a polished podcast-style audio summary.",
  },
  presentation: {
    subtitle: "Slide deck summary",
    generateVerb: "Generate Presentation",
    emptyHeadline: "Generate a presentation from this paper",
    emptyDescription:
      "SARAL AI will build slide-ready summaries and exports from your paper.",
  },
  reel: {
    subtitle: "Short-form social video",
    generateVerb: "Generate Reel",
    emptyHeadline: "Generate a reel from this paper",
    emptyDescription:
      "SARAL AI will analyze the paper and create a reel with voiceover, visuals, and pacing tuned for social.",
  },
  "x-linkedin": {
    subtitle: "Posts for X and LinkedIn",
    generateVerb: "Generate Social Posts",
    emptyHeadline: "Generate social posts from this paper",
    emptyDescription:
      "SARAL AI will draft concise posts you can refine and publish on X or LinkedIn.",
  },
  poster: {
    subtitle: "Conference-style poster",
    generateVerb: "Generate Poster",
    emptyHeadline: "Generate a poster from this paper",
    emptyDescription:
      "SARAL AI will lay out a poster highlighting key methods, results, and takeaways.",
  },
  "business-brief": {
    subtitle: "Executive-ready PDF",
    generateVerb: "Generate Business Brief",
    emptyHeadline: "Generate a business brief from this paper",
    emptyDescription:
      "SARAL AI will produce a structured brief suitable for stakeholders and partners.",
  },
};

interface PaperArtifactsPanelProps {
  onShareArtifact: (artifactId: string) => void;
}

const pillTriggerClass =
  "relative cursor-pointer !flex-none inline-flex h-[calc(100%-1px)] min-h-0 shrink-0 flex-row items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-transparent bg-transparent px-2.5 py-2 font-sans text-[13px] font-semibold leading-snug text-ink dark:text-white/80 shadow-none transition-[colors,box-shadow] duration-200 after:!hidden hover:bg-muted/60 hover:text-ink dark:text-white focus-visible:ring-2 focus-visible:ring-saral-forest/35 focus-visible:ring-offset-2 [&_svg]:size-[13px] [&_svg]:shrink-0 [&_svg]:opacity-90 [&_svg]:text-current [&_span]:line-clamp-none " +
  "data-[state=active]:!border-transparent data-[state=active]:!bg-saral-forest data-[state=active]:!text-white data-[state=active]:!shadow-none data-[state=active]:[&_svg]:!text-white dark:data-[state=active]:!bg-saral-forest dark:data-[state=active]:!text-white dark:data-[state=active]:[&_svg]:!text-white";

export default function PaperArtifactsPanel({
  onShareArtifact,
}: PaperArtifactsPanelProps) {
  const startArtifact = useStartArtifactGeneration();
  const {
    artifacts,
    openEditModal,
    openPreviewModal,
    openGeneratingModal,
    reopenReelStageModal,
  } = useArtifactStore();
  const { paperId } = usePaperStore();
  const [tab, setTab] = useState<string>(ALL_ARTIFACTS_TAB);
  // const [guideStep, setGuideStep] = useState(1);
  // const [showGuide, setShowGuide] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [tabScrollHints, setTabScrollHints] = useState({
    left: false,
    right: false,
  });

  // useEffect(() => {
  //   if (!localStorage.getItem("saral_has_seen_tour")) {
  //     setShowGuide(true);
  //   }
  // }, []);

  // const dismissGuide = () => {
  //   setShowGuide(false);
  //   setGuideStep(1);
  //   localStorage.setItem("saral_has_seen_tour", "true");
  // };

  const updateTabScrollHints = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth - clientWidth;
    const eps = 4;
    setTabScrollHints({
      left: scrollLeft > eps,
      right: overflow > eps && scrollLeft < overflow - eps,
    });
  }, []);

  useEffect(() => {
    updateTabScrollHints();
    const el = tabsScrollRef.current;
    const ro = el ? new ResizeObserver(updateTabScrollHints) : null;
    if (el) ro?.observe(el);
    window.addEventListener("resize", updateTabScrollHints);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateTabScrollHints);
    };
  }, [tab, updateTabScrollHints]);

  const scrollTabsStrip = (direction: -1 | 1) => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const delta = Math.min(200, Math.round(el.clientWidth * 0.65)) * direction;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  const startArtifactTracked = (type: ArtifactType) => {
    trackGAEvent(ARTIFACT_GA_EVENT[type]);
    startArtifact(type);
  };

  const artifactMatchesPaper = (a: Artifact) =>
    a.paperId === paperId &&
    (a.status === "done" ||
      a.status === "pending" ||
      a.status === "generating" ||
      a.status === "waiting-script");

  const getArtifactsByType = (type: ArtifactType): Artifact[] =>
    artifacts.filter((a) => a.type === type && artifactMatchesPaper(a));

  const allPaperArtifacts = artifacts.filter(artifactMatchesPaper);

  // Shared "Want another format?" hint. Rendered on EVERY populated tab
  // (All-outputs and per-type) the moment any generation starts, so the
  // user always has a next-action prompt visible while waiting — keeps
  // the page feeling active instead of idle. Auto-collapses once every
  // type has been generated. Empty string when there's nothing to nudge.
  const unusedTypesForHint = (() => {
    const usedTypes = new Set(allPaperArtifacts.map((a) => a.type));
    return EMPTY_STATE_CARD_TYPES.filter((t) => !usedTypes.has(t));
  })();
  // Parallel-generation prompt — delivered as a sonner toast (same
  // surface as "Your video is ready") so we don't pollute the page with
  // inline chrome. Fires whenever a NEW artifact enters an active state
  // (waiting-script / generating / pending), not just on the first one
  // ever, so users who start gen #2 while gen #1 is still running also
  // get the prompt, and users who missed the first toast get a second
  // chance to learn the parallel-generation capability. Suppressed once
  // every format type has been tried (no more "another format" to
  // suggest) and de-duplicated via a ref of IDs we've already toasted
  // about so a single artifact transitioning between active sub-states
  // doesn't re-fire.
  const inflightIds = allPaperArtifacts
    .filter(
      (a) =>
        a.status === "generating" ||
        a.status === "waiting-script" ||
        a.status === "pending",
    )
    .map((a) => a.id);
  const toastedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (unusedTypesForHint.length === 0) return;
    const newKickoff = inflightIds.find(
      (id) => !toastedIdsRef.current.has(id),
    );
    if (!newKickoff) return;
    // Mark every currently-inflight id as toasted (covers the new one
    // plus any concurrent ones, so we don't re-toast for the same batch).
    inflightIds.forEach((id) => toastedIdsRef.current.add(id));
    toast("Running in the background", {
      description:
        "Start another format from the tabs above — they generate in parallel.",
      closeButton: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inflightIds.join("|"), unusedTypesForHint.length]);

  const handleOpenGenerating = (id: string) => {
    const a = artifacts.find((x) => x.id === id);
    if (a?.type === "reel" && a.reelStage) {
      reopenReelStageModal(id);
    } else {
      openGeneratingModal(id);
    }
  };

  /** All tab: one shared grid for types with a single artifact; section + carousel when a type has 2+. */
  const allArtifactsLayout = (() => {
    const blocks: ReactNode[] = [];
    let singletonBuffer: ArtifactCarouselEntry[] = [];

    const flushSingletons = () => {
      if (singletonBuffer.length === 0) return;
      const entries = singletonBuffer;
      const blockKey = entries.map((e) => e.artifact.id).join("|");
      singletonBuffer = [];
      blocks.push(
        <div key={`all-singleton-${blockKey}`} className="min-w-0">
          <ArtifactEntriesGrid
            entries={entries}
            openEditModal={openEditModal}
            openPreviewModal={openPreviewModal}
            openShareModal={onShareArtifact}
            openGeneratingModal={handleOpenGenerating}
            reopenReelStageModal={reopenReelStageModal}
          />
        </div>,
      );
    };

    const gridProps = {
      openEditModal,
      openPreviewModal,
      openShareModal: onShareArtifact,
      openGeneratingModal: handleOpenGenerating,
      reopenReelStageModal,
    } as const;

    for (const item of ARTIFACT_TAB_ITEMS) {
      const typeArtifacts = getArtifactsByType(item.id);
      if (typeArtifacts.length === 0) continue;
      if (typeArtifacts.length === 1) {
        singletonBuffer.push({
          artifact: typeArtifacts[0],
          item,
        });
        continue;
      }
      flushSingletons();
      blocks.push(
        <div key={item.id} className="min-w-0 space-y-3">
          <h3 className="font-sans text-[15px] font-bold tracking-tight text-ink dark:text-white">
            {item.label}
          </h3>
          <CardCarousel artifacts={typeArtifacts} item={item} {...gridProps} />
        </div>,
      );
    }
    flushSingletons();
    return blocks;
  })();

  return (
    <>
      {/* {showGuide && (
        <div
          className="fixed inset-0 z-40 dark:bg-saral-dark bg-white transition-opacity"
          aria-hidden="true"
        />
      )} */}
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 w-full gap-0">
        {/* Tab strip — hidden until at least one artifact exists / is processing */}
        {allPaperArtifacts.length > 0 && (
          <div
            className={cn(
              "relative mb-4 min-w-0 rounded-2xl bg-card dark:bg-carddarkbg px-2 py-2.5 sm:p-3 max-md:mb-3.5",
              // showGuide && "z-50",
            )}
          >
            {/* {showGuide && (
              <TourGuide
                guideStep={guideStep}
                onGuideStepChange={setGuideStep}
                onDismiss={dismissGuide}
              />
            )} */}
            <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Scroll tabs left"
                className="size-9 shrink-0 rounded-full text-ink-muted hover:bg-muted/70 hover:text-ink dark:text-white md:hidden disabled:pointer-events-none disabled:opacity-25"
                disabled={!tabScrollHints.left}
                onClick={() => scrollTabsStrip(-1)}
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </Button>
              <div
                ref={tabsScrollRef}
                onScroll={updateTabScrollHints}
                className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scrollbar-hide md:overflow-visible"
              >
                <TabsList
                  variant="line"
                  className={cn(
                    "flex h-auto min-h-0 w-max max-w-none flex-nowrap items-center gap-2 bg-transparent p-0",
                    "md:w-full md:max-w-full md:flex-wrap md:justify-start",
                  )}
                >
                  <TabsTrigger
                    value={ALL_ARTIFACTS_TAB}
                    className={pillTriggerClass}
                  >
                    <LayoutGrid className="size-3.5 shrink-0 opacity-90" />
                    <span>All outputs</span>
                  </TabsTrigger>
                  {ARTIFACT_TAB_ITEMS.map((item) => (
                    <TabsTrigger
                      key={item.id}
                      value={item.id}
                      className={pillTriggerClass}
                    >
                      {TAB_ICONS[item.id]}
                      <span>{ARTIFACT_LABELS[item.id]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Scroll tabs right"
                className="size-9 shrink-0 rounded-full text-ink hover:bg-muted/70 hover:text-ink dark:text-white md:hidden disabled:pointer-events-none disabled:opacity-25"
                disabled={!tabScrollHints.right}
                onClick={() => scrollTabsStrip(1)}
              >
                <ChevronRight className="size-5" strokeWidth={2} />
              </Button>
            </div>
          </div>
        )}

        <TabsContent
          value={ALL_ARTIFACTS_TAB}
          className="mt-0 min-w-0 w-full outline-none"
        >
          <div className="isolate min-w-0 overflow-hidden rounded-[20px] border border-border bg-card dark:bg-carddarkbg shadow-sm ring-1 ring-border">
            {/* "All outputs" header + descriptive subtitle removed — the
                active tab in the strip above already communicates which
                view this is, and the descriptive sentence was just text
                between the user and the actual content. */}
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              {allPaperArtifacts.length === 0 ? (
                <div className="flex flex-col items-center px-2 py-2 text-center sm:px-4">
                  <h3 className="mb-3 font-serif text-[26px] sm:text-[30px] font-bold tracking-tight leading-[1.15] text-ink dark:text-white animate-fade-up [animation-delay:80ms]">
                    What would you like to create?
                  </h3>
                  <p className="mb-8 max-w-lg font-sans text-[14px] sm:text-[15px] leading-relaxed text-ink-muted dark:text-white/70 animate-fade-up [animation-delay:160ms]">
                    Pick a format below — we&rsquo;ll turn this paper into it.
                  </p>
                  {/* The 7-card grid leaves the last tile orphaned. Center
                      it explicitly: on mobile (2-col) span both columns with
                      half width so it visually sits between them; on
                      desktop (3-col) push it to the centre column. */}
                  <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:max-sm:col-span-2 [&>*:last-child]:max-sm:w-[calc(50%-0.375rem)] [&>*:last-child]:max-sm:justify-self-center [&>*:last-child]:sm:col-start-2">
                    {EMPTY_STATE_CARD_TYPES.map((type) => {
                      const styles = EMPTY_STATE_CARD_STYLES[type];
                      return (
                        <Button
                          key={type}
                          type="button"
                          variant="outline"
                          onClick={() => startArtifactTracked(type)}
                          className={cn(
                            "h-auto min-h-28 cursor-pointer flex-col gap-3 rounded-xl border border-pill-border bg-linen dark:bg-carddarkbg px-3 py-4 font-sans text-left shadow-none transition-[background-color,box-shadow,border-color,transform] duration-200",
                            "hover:border-saral-forest/25 hover:bg-saral-forest/20 hover:shadow-md",
                            "active:scale-[0.99]",
                            "focus-visible:ring-2 focus-visible:ring-saral-forest/35 focus-visible:ring-offset-2",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-12 items-center justify-center rounded-lg",
                              styles.iconWrap,
                            )}
                          >
                            <span
                              className={cn(
                                "flex items-center justify-center [&_svg]:size-5",
                                styles.iconClass,
                              )}
                            >
                              {EMPTY_STATE_CARD_ICONS[type]}
                            </span>
                          </span>
                          <span className="w-full text-center font-sans text-[14px] sm:text-[15px] font-semibold leading-snug text-ink dark:text-white">
                            {emptyStateCardLabel(type)}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-8">
                  {allArtifactsLayout}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {ARTIFACT_TAB_ITEMS.map((item) => {
          const type = item.id;
          const copy = TAB_PANEL_COPY[type];
          const typeArtifacts = getArtifactsByType(type);
          const emptyHeadline = copy.emptyHeadline;
          const hasAny = typeArtifacts.length > 0;

          return (
            <TabsContent
              key={item.id}
              value={item.id}
              className="mt-0 min-w-0 w-full outline-none"
            >
              {/* Artefact content — separate container (matches screenshot 3) */}
              <div className="isolate min-w-0 overflow-hidden rounded-[20px] border border-border bg-card dark:bg-carddarkbg shadow-sm ring-1 ring-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
                  <h2 className="min-w-0 flex-1 truncate font-sans text-base font-bold tracking-tight text-ink dark:text-white sm:text-[17px]">
                    {ARTIFACT_LABELS[type]}
                  </h2>
                  {/* Header "Generate X" button only appears AFTER the first
                      artifact exists — it's for creating an additional one.
                      Before any exist, the centered empty-state CTA is the
                      single, unambiguous entry point. On phones the button
                      collapses to just "Generate" so the long verb can't crush
                      the heading — the heading already names the type. */}
                  {hasAny && (
                    <Button
                      type="button"
                      onClick={() => startArtifactTracked(type)}
                      className="h-11 shrink-0 rounded-xl bg-saral-forest px-4 font-sans text-sm font-semibold text-white hover:bg-saral-forest/90 sm:h-11 sm:px-5"
                    >
                      <span className="sm:hidden">Generate</span>
                      <span className="hidden sm:inline">{copy.generateVerb}</span>
                      <ChevronRight className="ml-1 size-4 opacity-90" />
                    </Button>
                  )}
                </div>

                <div className="px-4 py-6 sm:px-6 sm:py-8">
                  {typeArtifacts.length === 0 ? (
                    // First-run empty state. Single, prominent CTA — clicking
                    // fires generation (modal for video, immediate for the
                    // rest, per useStartArtifactGeneration).
                    <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
                      <div
                        className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted"
                        aria-hidden
                      >
                        <span className="text-muted-foreground [&_svg]:size-7">
                          {TAB_ICONS[type]}
                        </span>
                      </div>
                      <p className="mb-2 font-sans text-lg font-bold text-ink dark:text-white">
                        {emptyHeadline}
                      </p>
                      <p className="mb-8 max-w-md font-sans text-[14px] leading-relaxed text-muted-foreground">
                        {copy.emptyDescription}
                      </p>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => startArtifactTracked(type)}
                        className="h-12 rounded-xl bg-saral-forest px-8 font-sans text-[15px] font-semibold text-white hover:bg-saral-forest/90"
                      >
                        {copy.generateVerb}
                        <ArrowRight className="ml-2 size-5" />
                      </Button>
                    </div>
                  ) : (
                    <CardCarousel
                      artifacts={typeArtifacts}
                      item={item}
                      openEditModal={openEditModal}
                      openPreviewModal={openPreviewModal}
                      openShareModal={onShareArtifact}
                      openGeneratingModal={handleOpenGenerating}
                      reopenReelStageModal={reopenReelStageModal}
                    />
                  )}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </>
  );
}
