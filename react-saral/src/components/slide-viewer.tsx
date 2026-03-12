import { useState, useEffect, useRef } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { slidesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"

interface SlideViewerProps {
  paperId: string
  onDone: () => void
}

export function SlideViewer({ paperId, onDone }: SlideViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [blobUrls, setBlobUrls] = useState<string[]>([])
  const blobUrlsRef = useRef<string[]>([])

  const slideQuery = useQuery({
    queryKey: ["slides", paperId],
    queryFn: () => slidesApi.get(paperId).then((r) => r.data),
    retry: false,
    enabled: false,
  })

  const generateMutation = useMutation({
    mutationFn: () => slidesApi.generate(paperId).then((r) => r.data),
    onSuccess: () => {
      setCurrentSlide(0)
      slideQuery.refetch()
    },
  })

  const slide = generateMutation.data ?? slideQuery.data
  const loading = generateMutation.isPending
  const images = slide?.image_paths ?? []
  const total = blobUrls.length

  // Fetch images as authenticated blobs
  const imageKey = images.join(",")
  useEffect(() => {
    if (!images.length) {
      setBlobUrls([])
      return
    }
    let cancelled = false

    // Revoke previous blob URLs
    blobUrlsRef.current.forEach(URL.revokeObjectURL)
    blobUrlsRef.current = []

    Promise.all(
      images.map((path) =>
        slidesApi
          .fetchImage(path)
          .then((res) => URL.createObjectURL(res.data))
          .catch(() => "")
      )
    ).then((urls) => {
      if (cancelled) {
        urls.forEach((u) => u && URL.revokeObjectURL(u))
        return
      }
      blobUrlsRef.current = urls
      setBlobUrls(urls)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey])

  // Cleanup on unmount
  useEffect(() => () => blobUrlsRef.current.forEach(URL.revokeObjectURL), [])

  const handleDownload = async () => {
    const res = await slidesApi.downloadPptx(paperId)
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `presentation_${paperId}.pptx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Create Presentation Slides</CardTitle>
        <div className="flex gap-2">
          {!images.length && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : "Generate Slides"}
            </Button>
          )}
          {images.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1 h-4 w-4" /> Download PPTX
              </Button>
              <Button
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : "Regenerate"}
              </Button>
              <Button onClick={onDone}>Continue</Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {generateMutation.error && (
          <p className="mb-4 text-sm text-red-500">
            {(generateMutation.error as Error).message}
          </p>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {total > 0 && (
          <div className="space-y-4">
            {/* Main slide viewer */}
            <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
              <img
                src={blobUrls[currentSlide]}
                alt={`Slide ${currentSlide + 1}`}
                className="mx-auto block max-h-125 w-full object-contain"
              />

              {/* Navigation arrows */}
              {total > 1 && (
                <>
                  <button
                    onClick={() =>
                      setCurrentSlide((prev) =>
                        prev > 0 ? prev - 1 : total - 1
                      )
                    }
                    className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlide((prev) =>
                        prev < total - 1 ? prev + 1 : 0
                      )
                    }
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Slide counter */}
              <div className="absolute right-3 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                {currentSlide + 1} / {total}
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {blobUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`shrink-0 overflow-hidden rounded border-2 transition ${
                    i === currentSlide
                      ? "border-blue-500"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="h-16 w-28 object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
