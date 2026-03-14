import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { papersApi, scriptsApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  Plus,
  FileText,
  Upload,
  Presentation,
  Volume2,
  CheckCircle2,
  Circle,
  Clock,
} from "lucide-react"

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
})

interface StepStatus {
  label: string
  icon: React.ComponentType<{ className?: string }>
  done: boolean
  pending: boolean
}

function PaperCard({ paper }: { paper: PaperResponse }) {
  // Check if scripts exist for this paper
  const scriptsQuery = useQuery({
    queryKey: ["scripts", paper.paper_id],
    queryFn: () => scriptsApi.get(paper.paper_id).then((r) => r.data),
    retry: false,
    staleTime: 30_000,
  })

  const hasScripts = !!scriptsQuery.data?.sections?.length
  const paperUploaded = paper.status === "processed" || paper.status === "uploaded"

  const steps: StepStatus[] = [
    {
      label: "Upload",
      icon: Upload,
      done: paperUploaded,
      pending: !paperUploaded,
    },
    {
      label: "Scripts",
      icon: FileText,
      done: hasScripts,
      pending: paperUploaded && !hasScripts,
    },
    {
      label: "Slides",
      icon: Presentation,
      done: false,
      pending: hasScripts,
    },
    {
      label: "Audio",
      icon: Volume2,
      done: false,
      pending: false,
    },
  ]

  return (
    <Link
      to="/papers/$paperId"
      params={{ paperId: paper.paper_id }}
    >
      <Card className="h-full cursor-pointer transition-all hover:border-primary hover:shadow-md">
        <CardContent className="p-6">
          <h3 className="mb-3 line-clamp-2 font-heading text-base font-semibold text-foreground">
            {paper.metadata.title}
          </h3>
          <p className="mb-1 font-sans text-sm text-black/70">
            <span className="font-bold">Authors:</span> {paper.metadata.authors}
          </p>
          <p className="mb-4 font-sans text-sm text-black/80">
            <span className="font-bold">Year:</span> {paper.metadata.date}
          </p>

          {/* Step-wise progress */}
          <div className="grid grid-cols-2 gap-1.5">
            {steps.map((step) => (
              <div
                key={step.label}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${
                  step.done
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : step.pending
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="size-3 shrink-0" />
                ) : step.pending ? (
                  <Clock className="size-3 shrink-0" />
                ) : (
                  <Circle className="size-3 shrink-0" />
                )}
                {step.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function DashboardPage() {
  const papersQuery = useQuery({
    queryKey: ["papers"],
    queryFn: () => papersApi.list().then((r) => r.data),
  })

  const papers = papersQuery.data ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
        <Link to="/workflow" search={{ paperId: undefined }}>
          <Button className="font-heading">
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      {papersQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : papers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No papers yet</p>
            <Link to="/workflow" search={{ paperId: undefined }}>
              <Button className="font-heading">Upload your first paper</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper: PaperResponse) => (
            <PaperCard key={paper.paper_id} paper={paper} />
          ))}
        </div>
      )}
    </div>
  )
}
