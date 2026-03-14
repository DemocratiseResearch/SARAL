import { useState, useEffect } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { mediaApi } from "@/lib/api"
import { getIdToken } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useWorkflowStore } from "@/stores/workflow-store"

interface AudioGeneratorProps {
  paperId: string
}

export function AudioGenerator({ paperId }: AudioGeneratorProps) {
  const { language, voice, setLanguage, setVoice } = useWorkflowStore()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    getIdToken().then(setToken)
  }, [])

  const languagesQuery = useQuery({
    queryKey: ["languages"],
    queryFn: () => mediaApi.languages().then((r) => r.data),
  })

  const voicesQuery = useQuery({
    queryKey: ["voices"],
    queryFn: () => mediaApi.voices().then((r) => r.data),
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      mediaApi.generateAudio(paperId, language, voice).then((r) => r.data),
    onSuccess: () => {
      getIdToken().then(setToken)
    },
  })

  const mediaQuery = useQuery({
    queryKey: ["media", paperId],
    queryFn: () => mediaApi.get(paperId).then((r) => r.data),
    retry: false,
  })

  // Use the newly generated media data, or fallback to previously fetched media data
  const media = generateMutation.data || mediaQuery.data
  const loading = generateMutation.isPending || mediaQuery.isLoading
  const languages = languagesQuery.data ?? {}
  const voices = voicesQuery.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex border-b border-gray-200 dark:border-gray-800 pb-4 flex-col gap-4">
          {media?.audio_files && media.audio_files.length > 0 ? (
            <>
              <h4 className="font-heading text-sm font-semibold text-foreground">
                Your Generated Audio
              </h4>
              <div className="space-y-3">
                {media.audio_files.map((filename) => (
                  <div key={filename} className="flex items-center gap-4">
                    <span className="text-sm">{filename}</span>
                    {token && (
                      <audio
                        controls
                        src={mediaApi.audioUrl(paperId, filename, token)}
                        className="h-8"
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No audio generated yet. Select a language and voice to start.
            </p>
          )}
        </div>

        <div className="pt-4 space-y-4">
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
                {voices && (
                  <>
                    <optgroup label="Male">
                      {voices.male.map((v) => (
                        <option key={v} value={v}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Female">
                      {voices.female.map((v) => (
                        <option key={v} value={v}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            </div>
          </div>

          <Button onClick={() => generateMutation.mutate()} disabled={loading} variant={media?.audio_files?.length ? "outline" : "default"}>
            {loading ? <Spinner size="sm" /> : media?.audio_files?.length ? "Regenerate Audio" : "Generate Audio"}
          </Button>

          {generateMutation.error && (
            <p className="text-sm text-red-500">
              {(generateMutation.error as Error).message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
