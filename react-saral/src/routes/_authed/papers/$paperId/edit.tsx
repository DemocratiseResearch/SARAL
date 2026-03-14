import { createFileRoute, Link, useSearch } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { papersApi, scriptsApi } from "@/lib/api"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent } from "@/components/ui/card"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { PaperUpload } from "@/components/paper-upload"
import { ScriptEditor } from "@/components/script-editor"
import { SlideViewer } from "@/components/slide-viewer"
import { AudioGenerator } from "@/components/audio-generator"
import { useWorkflowStore } from "@/stores/workflow-store"
import {
  Upload,
  FileText,
  Presentation,
  Volume2,
  ArrowLeft,
  CheckCircle2,
  Circle,
} from "lucide-react"
import { useEffect } from "react"

export const Route = createFileRoute("/_authed/papers/$paperId/edit")({
  component: StepEditorPage,
  validateSearch: (search: Record<string, unknown>) => ({
    step: (search.step as string) || "upload",
  }),
})

function StepEditorPage() {
  const { paperId } = Route.useParams()
  const { step: activeStep } = useSearch({ from: "/_authed/papers/$paperId/edit" })
  const { setPaperId, setStep } = useWorkflowStore()

  // Lock the paperId in the workflow store
  useEffect(() => {
    setPaperId(paperId)
  }, [paperId, setPaperId])

  const paperQuery = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => papersApi.get(paperId).then((r) => r.data),
  })

  const scriptsQuery = useQuery({
    queryKey: ["scripts", paperId],
    queryFn: () => scriptsApi.get(paperId).then((r) => r.data),
    retry: false,
  })

  const paper = paperQuery.data
  const hasScripts = !!scriptsQuery.data?.sections?.length || !!paper?.has_scripts
  const hasAudio = !!paper?.has_audio

  const steps = [
    {
      key: "upload",
      label: "Upload",
      icon: Upload,
      completed: !!paper,
    },
    {
      key: "scripts",
      label: "Scripts",
      icon: FileText,
      completed: hasScripts,
    },
    {
      key: "slides",
      label: "Slides",
      icon: Presentation,
      completed: hasScripts, // Slides are ready once scripts are ready
    },
    {
      key: "audio",
      label: "Audio",
      icon: Volume2,
      completed: hasAudio,
    },
  ]

  if (paperQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back to dashboard */}
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      {/* Paper title */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {paper?.metadata.title ?? "Paper"}
        </h1>
      </div>

      {/* Steps accordion with full UI */}
      <Card>
        <CardContent className="p-0">
          <Accordion defaultValue={[activeStep]}>
            {steps.map((step) => (
              <AccordionItem key={step.key} value={step.key}>
                <AccordionTrigger className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {step.completed ? (
                      <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2">
                      <step.icon className="size-4 text-primary" />
                      <span className="font-heading text-base font-semibold text-foreground">
                        {step.label}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  {step.key === "upload" && (
                    <PaperUpload
                      onSuccess={(newPaper) => {
                        setPaperId(newPaper.paper_id)
                        setStep("scripts")
                      }}
                    />
                  )}

                  {step.key === "scripts" && paperId && (
                    <ScriptEditor
                      paperId={paperId}
                      onDone={() => setStep("output")}
                    />
                  )}

                  {step.key === "slides" && paperId && (
                    <SlideViewer paperId={paperId} />
                  )}

                  {step.key === "audio" && paperId && (
                    <AudioGenerator paperId={paperId} />
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
