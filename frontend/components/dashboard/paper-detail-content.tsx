"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePaperStore } from "@/lib/paper-store";
import { useArtifactStore } from "@/lib/artifact-store";
import PaperArtifactsPanel from "@/components/dashboard/artifacts-tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ArtifactGenerateSheetButtons } from "@/components/dashboard/artifact-sheet-mobile";
import PaperBasicDetails from "@/components/dashboard/paper-basic-details";

export default function PaperDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { papers, metadata, loadPaper } = usePaperStore();
  const { openPreviewModal } = useArtifactStore();

  const [loaded, setLoaded] = useState(false);
  const [generateSheetOpen, setGenerateSheetOpen] = useState(false);

  useEffect(() => {
    const paperId = params.id;
    if (!paperId) return;

    const paper = papers.find((p) => p.id === paperId || p.paperId === paperId);
    if (paper) {
      loadPaper(paperId);
      setLoaded(true);
    } else {
      router.replace("/dashboard/papers");
    }
  }, [params.id, papers, loadPaper, router]);

  const handleShareArtifact = (artifactId: string) => {
    openPreviewModal(artifactId, { initialView: "share-menu" });
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {!loaded || !metadata.title ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="h-7 w-7 rounded-full border-[3px] border-saral-forest/20 border-t-saral-forest"
            style={{ animation: "spin 0.75s linear infinite" }}
          />
        </div>
      ) : (
        <>
          <Sheet open={generateSheetOpen} onOpenChange={setGenerateSheetOpen}>
            <SheetContent
              side="right"
              className="flex w-[min(100vw-2rem,22rem)] dark:border-darkcardborder flex-col gap-0 border-l border-pill-border bg-linen dark:bg-saral-dark p-0"
            >
              <div className="flex flex-col px-4 pb-8 pt-14">
                <ArtifactGenerateSheetButtons
                  onAfterPick={() => setGenerateSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          <main className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-3 pt-6 pb-3 sm:pt-8 md:px-4">
            <div className="mx-auto max-w-7xl pb-8">
              <PaperBasicDetails
                onOpenGenerateSheet={() => setGenerateSheetOpen(true)}
              />
              <PaperArtifactsPanel onShareArtifact={handleShareArtifact} />
            </div>
          </main>
        </>
      )}
    </div>
  );
}
