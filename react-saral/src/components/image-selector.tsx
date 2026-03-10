import { useQuery } from "@tanstack/react-query"
import { papersApi } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

interface ImageSelectorProps {
  paperId: string
  onDone: () => void
}

export function ImageSelector({ paperId, onDone }: ImageSelectorProps) {
  const paperQuery = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => papersApi.get(paperId).then((r) => r.data),
  })

  const paper = paperQuery.data

  if (paperQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const images = paper?.image_files ?? []

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Assign Images to Sections</CardTitle>
        <Button onClick={onDone}>Continue</Button>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <p className="text-sm text-gray-500">
            No images extracted from the paper. You can skip this step.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {images.length} image(s) found. You can assign them to sections in
              the next iteration.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {images.map((img) => (
                <div
                  key={img}
                  className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <img
                    src={`/api/papers/${paperId}/images/${img}`}
                    alt={img}
                    className="h-32 w-full bg-gray-100 object-contain dark:bg-gray-800"
                  />
                  <p className="truncate p-2 text-center text-xs text-gray-500">
                    {img}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
