import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { scriptsApi, type SectionScript } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"

interface ScriptEditorProps {
  paperId: string
  onDone: () => void
}

export function ScriptEditor({ paperId, onDone }: ScriptEditorProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState("")

  const scriptsQuery = useQuery({
    queryKey: ["scripts", paperId],
    queryFn: () => scriptsApi.get(paperId).then((r) => r.data),
    retry: false,
  })

  const generateMutation = useMutation({
    mutationFn: () => scriptsApi.generate(paperId).then((r) => r.data),
    onSuccess: () => {
      toast.success("Scripts generated successfully!")
      scriptsQuery.refetch()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to generate scripts")
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      scriptsApi.update(id, { content }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Script updated successfully!")
      setEditingId(null)
      setEditContent("")
      scriptsQuery.refetch()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update script")
    }
  })

  const scripts = generateMutation.data ?? scriptsQuery.data
  const loading = generateMutation.isPending
  const fetching = scriptsQuery.isLoading

  const startEdit = (section: SectionScript) => {
    setEditingId(section.id)
    setEditContent(section.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent("")
  }

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, content: editContent })
  }

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Presentation Scripts</CardTitle>
        <div className="flex gap-2">
          {!scripts?.sections?.length && !fetching && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : "Generate Scripts"}
            </Button>
          )}
          {scripts?.sections?.length ? (
            <>
              <Button
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : "Regenerate"}
              </Button>
              <Button onClick={onDone}>Continue</Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {fetching && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {generateMutation.error && (
          <p className="mb-4 text-sm text-red-500">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {scripts?.sections?.map((section: SectionScript) => (
          <div key={section.id} className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-lg font-semibold">{section.section_name}</h4>
              {editingId !== section.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(section)}
                >
                  Edit
                </Button>
              )}
            </div>

            {editingId === section.id ? (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveEdit(section.id)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? <Spinner size="sm" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mb-2 text-sm whitespace-pre-line text-gray-600 dark:text-gray-400">
                {section.content}
              </p>
            )}

            {section.bullet_points.length > 0 && editingId !== section.id && (
              <ul className="ml-4 list-disc space-y-1 text-sm">
                {section.bullet_points.map((bp, i) => (
                  <li key={i}>{bp}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
