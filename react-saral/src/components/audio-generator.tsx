import { useMutation, useQuery } from "@tanstack/react-query"
import { mediaApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useWorkflowStore } from "@/stores/workflow-store"

interface AudioGeneratorProps {
  paperId: string
  onDone: () => void
}

export function AudioGenerator({ paperId, onDone }: AudioGeneratorProps) {
  const { language, voice, setLanguage, setVoice } = useWorkflowStore()

  const languagesQuery = useQuery({
    queryKey: ["languages"],
    queryFn: () => mediaApi.languages().then((r) => r.data),
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      mediaApi.generateAudio(paperId, language, voice).then((r) => r.data),
  })

  const media = generateMutation.data
  const loading = generateMutation.isPending
  const languages = languagesQuery.data ?? {}

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generate Audio</CardTitle>
        {media?.audio_files?.length ? (
          <Button onClick={onDone}>Continue</Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              {Object.keys(languages).map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              <option value="vidya">Vidya (Female)</option>
              <option value="karun">Karun (Male)</option>
            </select>
          </div>
        </div>

        <Button onClick={() => generateMutation.mutate()} disabled={loading}>
          {loading ? <Spinner size="sm" /> : "Generate Audio"}
        </Button>

        {generateMutation.error && (
          <p className="text-sm text-red-500">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {media?.audio_files?.map((filename) => (
          <div key={filename} className="flex items-center gap-4">
            <span className="text-sm">{filename}</span>
            <audio
              controls
              src={mediaApi.audioUrl(paperId, filename)}
              className="h-8"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
