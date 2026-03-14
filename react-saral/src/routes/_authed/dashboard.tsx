import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Plus, Clock, CheckCircle2, FileText } from "lucide-react"

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
})

function PaperCard({ paper }: { paper: PaperResponse }) {
  const isUploaded = paper.status === "processing" || paper.status === "processed" || paper.status === "uploaded" || paper.has_scripts || paper.has_audio

  let pendingWord = "Upload"
  if (isUploaded && !paper.has_scripts) {
    pendingWord = "Scripts"
  } else if (paper.has_scripts && !paper.has_audio) {
    pendingWord = "Audio"
  } else if (paper.has_audio) {
    pendingWord = "Completed"
  }

  return (
    <Link
      to="/papers/$paperId"
      params={{ paperId: paper.paper_id }}
    >
      <Card className="h-full cursor-pointer transition-all hover:border-primary hover:shadow-md">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex-1">
            <h3 className="mb-3 line-clamp-2 font-heading text-base font-semibold text-foreground">
              {paper.metadata.title}
            </h3>
            <p className="mb-1 font-sans text-sm text-muted-foreground">
              <span className="font-bold">Authors:</span> {paper.metadata.authors}
            </p>
            <p className="mb-4 font-sans text-sm text-muted-foreground">
              <span className="font-bold">Year:</span> {paper.metadata.date}
            </p>
          </div>

          {/* Simple Pending Status */}
          <div className="mt-2 flex items-center">
            {pendingWord === "Completed" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="size-3.5" />
                Completed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                <Clock className="size-3.5" />
                {pendingWord} Pending
              </span>
            )}
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
