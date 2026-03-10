import { useMutation, useQuery } from "@tanstack/react-query"
import { slidesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface SlideViewerProps {
  paperId: string
  onDone: () => void
}

export function SlideViewer({ paperId, onDone }: SlideViewerProps) {
  const slideQuery = useQuery({
    queryKey: ["slides", paperId],
    queryFn: () => slidesApi.get(paperId).then((r) => r.data),
    retry: false,
  })

  const generateMutation = useMutation({
    mutationFn: () => slidesApi.generate(paperId).then((r) => r.data),
    onSuccess: () => slideQuery.refetch(),
  })

  const slide = slideQuery.data
  const loading = generateMutation.isPending

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Presentation Slides</CardTitle>
        <div className="flex gap-2">
          {!slide?.image_paths?.length && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : "Generate Slides"}
            </Button>
          )}
          {slide?.image_paths?.length ? (
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

        {slide?.image_paths?.length ? (
          <div className="space-y-4">
            {slide.image_paths.map((path, i) => (
              <img
                key={i}
                src={path}
                alt={`Slide ${i + 1}`}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
              />
            ))}
          </div>
        ) : null}

        {slideQuery.isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
