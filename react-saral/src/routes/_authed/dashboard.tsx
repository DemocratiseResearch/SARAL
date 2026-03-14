import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Plus, Clock, CheckCircle2, FileText, Trash2 } from "lucide-react"
import { toast } from "sonner"

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
})

function PaperCard({ paper }: { paper: PaperResponse }) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => papersApi.delete(paper.paper_id),
    onSuccess: () => {
      toast.success("Project deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["papers"] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete project")
    }
  })

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

          {/* Simple Pending Status & Actions */}
          <div className="mt-2 flex items-center justify-between">
            {pendingWord === "Completed" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="size-3.5" />
                Completed
              </span>
            ) : pendingWord === "Scripts" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                <Clock className="size-3.5" />
                Scripts Pending
              </span>
            ) : pendingWord === "Audio" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                <Clock className="size-3.5" />
                Audio Pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100/60 px-2.5 py-1 font-sans text-xs font-semibold text-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
                <Clock className="size-3.5" />
                Upload Pending
              </span>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toast("Delete Project?", {
                  description: "This will permanently delete the paper and all assets.",
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
              <Trash2 className="size-4" />
            </Button>
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
