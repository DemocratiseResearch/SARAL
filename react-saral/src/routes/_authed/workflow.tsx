import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useWorkflowStore } from "@/stores/workflow-store"
import { StepIndicator } from "@/components/step-indicator"
import { PaperUpload } from "@/components/paper-upload"
import { ScriptEditor } from "@/components/script-editor"
import { ImageSelector } from "@/components/image-selector"
import { SlideViewer } from "@/components/slide-viewer"
import { AudioGenerator } from "@/components/audio-generator"
import { VideoPlayer } from "@/components/video-player"
import { useEffect } from "react"

export const Route = createFileRoute("/_authed/workflow")({
  component: WorkflowPage,
  validateSearch: (search: Record<string, unknown>) => ({
    paperId: (search.paperId as string) || undefined,
  }),
})

function WorkflowPage() {
  const { paperId: queryPaperId } = useSearch({ from: "/_authed/workflow" })
  const { currentStep, paperId, setStep, setPaperId } = useWorkflowStore()

  useEffect(() => {
    if (queryPaperId && queryPaperId !== paperId) {
      setPaperId(queryPaperId)
      setStep("scripts")
    }
  }, [queryPaperId, paperId, setPaperId, setStep])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <StepIndicator current={currentStep} />

      <div className="mt-4">
        {currentStep === "upload" && (
          <PaperUpload
            onSuccess={(paper) => {
              setPaperId(paper.paper_id)
              setStep("scripts")
            }}
          />
        )}

        {currentStep === "scripts" && paperId && (
          <ScriptEditor paperId={paperId} onDone={() => setStep("images")} />
        )}

        {currentStep === "images" && paperId && (
          <ImageSelector paperId={paperId} onDone={() => setStep("slides")} />
        )}

        {currentStep === "slides" && paperId && (
          <SlideViewer paperId={paperId} onDone={() => setStep("audio")} />
        )}

        {currentStep === "audio" && paperId && (
          <AudioGenerator paperId={paperId} onDone={() => setStep("video")} />
        )}

        {currentStep === "video" && paperId && (
          <VideoPlayer paperId={paperId} />
        )}
      </div>
    </div>
  )
}
