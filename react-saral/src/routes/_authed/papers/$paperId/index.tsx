import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { papersApi, scriptsApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Upload,
  FileText,
  Presentation,
  Volume2,
  ArrowLeft,
  Pencil,
  CheckCircle2,
  Circle,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

export const Route = createFileRoute("/_authed/papers/$paperId/")({
  component: PaperDetailPage,
})

function PaperDetailPage() {
  const { paperId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => papersApi.delete(paperId),
    onSuccess: () => {
      toast.success("Project deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["papers"] })
      navigate({ to: "/dashboard" })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete project")
    }
  })

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
      description: "Upload your research paper via arXiv URL, ZIP, or PDF.",
      completed: !!paper,
    },
    {
      key: "metadata",
      label: "Metadata",
      icon: FileText,
      description: "Review and edit paper title, authors, and other metadata.",
      completed: !!paper?.metadata.title && paper.metadata.title !== "Untitled",
    },
    {
      key: "scripts",
      label: "Scripts",
      icon: FileText,
      description:
        "Generate and edit presentation scripts from your paper content.",
      completed: hasScripts,
    },
    {
      key: "slides",
      label: "Slides",
      icon: Presentation,
      description:
        "Preview and download your auto-generated presentation slides.",
      completed: hasScripts,
    },
    {
      key: "audio",
      label: "Audio",
      icon: Volume2,
      description:
        "Generate narrated audio for your presentation in multiple languages.",
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back to dashboard */}
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      {/* Paper title */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {paper?.metadata.title ?? "Paper"}
          </h1>
          {paper?.metadata.authors && (
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              {paper.metadata.authors}
            </p>
          )}
        </div>
        
        <Button 
          variant="destructive" 
          size="sm" 
          className="shrink-0"
          onClick={() => {
            toast("Delete Project?", {
              description: "This will permanently delete the paper and all generated assets. This action cannot be undone.",
              action: {
                label: "Delete",
                onClick: () => deleteMutation.mutate()
              },
              cancel: {
                label: "Cancel",
                onClick: () => {}
              }
            })
          }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="size-4 mr-2" />
          {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
        </Button>
      </div>

      {/* Steps accordion */}
      <Card>
        <CardContent className="p-0">
          <Accordion defaultValue={[hasScripts ? "slides" : paper ? "metadata" : "upload"]}>
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
                <AccordionContent className="px-6 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-sm text-muted-foreground">
                      {step.description}
                    </p>
                    <Link
                      to="/papers/$paperId/edit"
                      params={{ paperId }}
                      search={{ step: step.key }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-4 gap-1.5 font-heading"
                      >
                        <Pencil className="size-3.5" />
                        {step.completed ? "Edit Step" : "Start"}
                      </Button>
                    </Link>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
