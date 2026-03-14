import { useState, useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { mediaApi } from "@/lib/api"
import { getIdToken } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useWorkflowStore } from "@/stores/workflow-store"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AudioGeneratorProps {
  paperId: string
}

const GENERATION_STEPS = [
  { label: "Preparing scripts for synthesis…", duration: 3000 },
  { label: "Translating content to target language…", duration: 15000 },
  { label: "Synthesizing audio sections in parallel…", duration: 30000 },
  { label: "Processing audio tracks…", duration: 30000 },
  { label: "Stitching & finalizing audio files…", duration: 45000 },
]

const ESTIMATED_TIME = "1–2 min"

export function AudioGenerator({ paperId }: AudioGeneratorProps) {
  const { language, voice, setLanguage, setVoice } = useWorkflowStore()
  const [token, setToken] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    getIdToken().then(setToken)
  }, [])

  // Progress step advancement
  useEffect(() => {
    if (!isGenerating) return

    const advanceStep = () => {
      setCurrentStep((prev) => {
        const next = prev + 1
        if (next < GENERATION_STEPS.length) {
          stepTimerRef.current = setTimeout(advanceStep, GENERATION_STEPS[next].duration)
          return next
        }
        return prev // Stay on last step until done
      })
    }

    stepTimerRef.current = setTimeout(advanceStep, GENERATION_STEPS[0].duration)

    // Elapsed time counter
    setElapsedSeconds(0)
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [isGenerating])

  const languagesQuery = useQuery({
    queryKey: ["languages"],
    queryFn: () => mediaApi.languages().then((r) => r.data),
    staleTime: Infinity,
  })

  const voicesQuery = useQuery({
    queryKey: ["voices"],
    queryFn: () => mediaApi.voices().then((r) => r.data),
    staleTime: Infinity,
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      mediaApi.generateAudio(paperId, language, voice).then((r) => r.data),
    onMutate: () => {
      setIsGenerating(true)
      setCurrentStep(0)
    },
    onSuccess: () => {
      setIsGenerating(false)
      setCurrentStep(0)
      setElapsedSeconds(0)
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      toast.success("Audio generated successfully!")
      getIdToken().then(setToken)
      queryClient.invalidateQueries({ queryKey: ["media", paperId] })
      queryClient.invalidateQueries({ queryKey: ["paper", paperId] })
    },
    onError: (error: Error) => {
      setIsGenerating(false)
      setCurrentStep(0)
      setElapsedSeconds(0)
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      toast.error(error.message || "Failed to generate audio")
    },
  })

  const mediaQuery = useQuery({
    queryKey: ["media", paperId],
    queryFn: () => mediaApi.get(paperId).then((r) => r.data),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  // Use the newly generated media data, or fallback to previously fetched media data
  const media = generateMutation.data || mediaQuery.data
  const loading = generateMutation.isPending || mediaQuery.isLoading
  const languages = languagesQuery.data ?? {}
  const voices = voicesQuery.data

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const progressPercent = isGenerating
    ? Math.min(((currentStep + 1) / GENERATION_STEPS.length) * 100, 95)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex border-b border-border pb-4 flex-col gap-4">
          {/* Generation Progress */}
          {isGenerating && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Spinner size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {GENERATION_STEPS[currentStep]?.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Step {currentStep + 1} of {GENERATION_STEPS.length} · Elapsed: {formatTime(elapsedSeconds)} · Est. ~{ESTIMATED_TIME}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/70 italic">
                Audio generation involves translation + TTS synthesis for each section. Please don't close this page.
              </p>
            </div>
          )}

          {/* Audio Player List */}
          {!isGenerating && media?.audio_files && media.audio_files.length > 0 ? (
            <>
              <h4 className="font-heading text-sm font-semibold text-foreground">
                Your Generated Audio
                {media.language && media.language !== "English" && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {capitalize(media.language)}
                  </span>
                )}
              </h4>
              <div className="space-y-3">
                {media.audio_files.map((filename) => {
                  const cleanName = filename
                    .replace(/^\d+_/, "")
                    .replace(/\.wav$/, "")
                    .replace(/_/g, " ")
                  return (
                    <div
                      key={filename}
                      className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium capitalize min-w-[120px]">
                        {cleanName}
                      </span>
                      {token && (
                        <audio
                          controls
                          src={mediaApi.audioUrl(paperId, filename, token)}
                          className="h-8 flex-1"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            !isGenerating && (
              <p className="text-sm text-muted-foreground">
                No audio generated yet. Select a language and voice to start.
              </p>
            )
          )}
        </div>

        <div className="pt-2 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Language Selection */}
            <div className="space-y-4">
              <label className="text-base mb-2 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground">
                Language
              </label>
              <Select value={language} onValueChange={(val) => val && setLanguage(val)}>
                <SelectTrigger className="w-full mt-5 transition-shadow hover:ring-1 hover:ring-border focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Available Languages</SelectLabel>
                    {Object.keys(languages).map((lang) => (
                      <SelectItem key={lang} value={lang} className="cursor-pointer">
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Voice Selection */}
            <div className="space-y-4">
              <label className="text-base mb-2 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground">
                Voice Character
              </label>
              <Select value={voice} onValueChange={(val) => val && setVoice(val)}>
                <SelectTrigger className="w-full mt-5 transition-shadow hover:ring-1 hover:ring-border focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="Select a voice">
                    {capitalize(voice)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {voices && (
                    <>
                      <SelectGroup>
                        <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                          Male Voices
                        </SelectLabel>
                        {voices.male.map((v) => (
                          <SelectItem key={v} value={v} className="cursor-pointer">
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground mt-2 border-t pt-2">
                          Female Voices
                        </SelectLabel>
                        {voices.female.map((v) => (
                          <SelectItem key={v} value={v} className="cursor-pointer">
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center pt-2">
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={loading || isGenerating}
              variant={media?.audio_files?.length ? "secondary" : "default"}
              className="w-full sm:w-auto shadow-sm"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Generating…
                </>
              ) : media?.audio_files?.length ? (
                "Regenerate Audio"
              ) : (
                "Generate Perfect Audio"
              )}
            </Button>
          </div>

          {generateMutation.error && !isGenerating && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {(generateMutation.error as Error).message}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
