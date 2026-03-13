import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useWorkflowStore } from "@/stores/workflow-store"
import { StepIndicator } from "@/components/step-indicator"
import { PaperUpload } from "@/components/paper-upload"
import { ScriptEditor } from "@/components/script-editor"
import { SlideViewer } from "@/components/slide-viewer"
import { AudioGenerator } from "@/components/audio-generator"
import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { scriptsApi } from "@/lib/api"

export const Route = createFileRoute("/_authed/workflow")({
  component: WorkflowPage,
  validateSearch: (search: Record<string, unknown>) => ({
    paperId: (search.paperId as string) || undefined,
  }),
})

function WorkflowPage() {
  const { paperId: queryPaperId } = useSearch({ from: "/_authed/workflow" })
  const { currentStep, paperId, setStep, setPaperId } = useWorkflowStore()
  const hasAutoAdvanced = useRef(false)

  useEffect(() => {
    if (queryPaperId && queryPaperId !== paperId) {
      setPaperId(queryPaperId)
      setStep("scripts")
      hasAutoAdvanced.current = false
    }
  }, [queryPaperId, paperId, setPaperId, setStep])

  // Check if scripts already exist for this paper
  const existingScripts = useQuery({
    queryKey: ["scripts", paperId],
    queryFn: () => scriptsApi.get(paperId!).then((r) => r.data),
    enabled: !!paperId && currentStep === "scripts" && !hasAutoAdvanced.current,
    retry: false,
  })

  // Auto-advance to output if scripts already exist (only on initial load)
  useEffect(() => {
    if (
      existingScripts.data?.sections?.length &&
      currentStep === "scripts" &&
      !hasAutoAdvanced.current
    ) {
      hasAutoAdvanced.current = true
      setStep("output")
    }
  }, [existingScripts.data, currentStep, setStep])

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
          <ScriptEditor paperId={paperId} onDone={() => setStep("output")} />
        )}

        {currentStep === "output" && paperId && (
          <div className="space-y-6">
            <SlideViewer paperId={paperId} />
            <AudioGenerator paperId={paperId} />
          </div>
        )}
      </div>
    </div>
  )
}
