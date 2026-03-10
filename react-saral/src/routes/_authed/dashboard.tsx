import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Plus, FileText } from "lucide-react"

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
})

function DashboardPage() {
  const papersQuery = useQuery({
    queryKey: ["papers"],
    queryFn: () => papersApi.list().then((r) => r.data),
  })

  const papers = papersQuery.data ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link to="/workflow" search={{ paperId: undefined }}>
          <Button>
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
            <FileText className="mb-4 h-12 w-12 text-gray-300" />
            <p className="mb-4 text-gray-500">No papers yet</p>
            <Link to="/workflow" search={{ paperId: undefined }}>
              <Button>Upload your first paper</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper: PaperResponse) => (
            <Link
              key={paper.paper_id}
              to="/workflow"
              search={{ paperId: paper.paper_id }}
            >
              <Card className="h-full cursor-pointer transition-colors hover:border-brand-500">
                <CardContent className="p-4">
                  <h3 className="mb-2 line-clamp-2 text-sm font-semibold">
                    {paper.metadata.title}
                  </h3>
                  <p className="mb-1 text-xs text-gray-500">
                    {paper.metadata.authors}
                  </p>
                  <p className="text-xs text-gray-400">{paper.metadata.date}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                      {paper.status}
                    </span>
                    {paper.metadata.arxiv_id && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                        arXiv
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
