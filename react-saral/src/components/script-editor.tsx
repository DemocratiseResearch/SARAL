import { useMutation, useQuery } from "@tanstack/react-query"
import { scriptsApi, type SectionScript } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface ScriptEditorProps {
  paperId: string
  onDone: () => void
}

export function ScriptEditor({ paperId, onDone }: ScriptEditorProps) {
  const scriptsQuery = useQuery({
    queryKey: ["scripts", paperId],
    queryFn: () => scriptsApi.get(paperId).then((r) => r.data),
    retry: false,
  })

  const generateMutation = useMutation({
    mutationFn: () => scriptsApi.generate(paperId).then((r) => r.data),
    onSuccess: () => scriptsQuery.refetch(),
  })

  const scripts = scriptsQuery.data
  const loading = generateMutation.isPending

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Presentation Scripts</CardTitle>
        <div className="flex gap-2">
          {!scripts?.sections?.length && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : "Generate Scripts"}
            </Button>
          )}
          {scripts?.sections?.length ? (
            <Button onClick={onDone}>Continue</Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {generateMutation.error && (
          <p className="mb-4 text-sm text-red-500">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {scripts?.sections?.map((section: SectionScript) => (
          <div key={section.id} className="mb-6">
            <h4 className="mb-2 text-lg font-semibold">
              {section.section_name}
            </h4>
            <p className="mb-2 text-sm whitespace-pre-line text-gray-600 dark:text-gray-400">
              {section.content}
            </p>
            {section.bullet_points.length > 0 && (
              <ul className="ml-4 list-disc space-y-1 text-sm">
                {section.bullet_points.map((bp, i) => (
                  <li key={i}>{bp}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {scriptsQuery.isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
