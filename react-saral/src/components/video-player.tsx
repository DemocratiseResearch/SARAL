import { useMutation } from "@tanstack/react-query"
import { mediaApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useWorkflowStore } from "@/stores/workflow-store"
import { Download, Play } from "lucide-react"

interface VideoPlayerProps {
  paperId: string
}

export function VideoPlayer({ paperId }: VideoPlayerProps) {
  const language = useWorkflowStore((s) => s.language)

  const generateMutation = useMutation({
    mutationFn: () =>
      mediaApi.generateVideo(paperId, language).then((r) => r.data),
  })

  const media = generateMutation.data
  const loading = generateMutation.isPending

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Video Presentation</CardTitle>
        {media?.video_path && (
          <a href={mediaApi.downloadVideoUrl(paperId)} download>
            <Button variant="outline" size="sm">
              <Download className="mr-1 h-4 w-4" /> Download
            </Button>
          </a>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!media?.video_path && (
          <Button onClick={() => generateMutation.mutate()} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" /> Generating…
              </>
            ) : (
              <>
                <Play className="mr-1 h-4 w-4" /> Generate Video
              </>
            )}
          </Button>
        )}

        {generateMutation.error && (
          <p className="text-sm text-red-500">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {media?.video_path && (
          <video
            controls
            className="w-full rounded-lg"
            src={mediaApi.videoUrl(paperId)}
          />
        )}
      </CardContent>
    </Card>
  )
}
