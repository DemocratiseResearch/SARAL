import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import PptxGenJS from "pptxgenjs"
import { scriptsApi, papersApi, type SectionScript } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"

interface SlideViewerProps {
  paperId: string
}

interface SlideData {
  title: string
  content: string
  isTitle?: boolean
  subtitle?: string
}

function buildSlides(
  sections: SectionScript[],
  metadata: { title: string; authors: string; date: string }
): SlideData[] {
  const slides: SlideData[] = [
    {
      title: metadata.title || "Research Presentation",
      content: "",
      isTitle: true,
      subtitle: [metadata.authors, metadata.date].filter(Boolean).join(" · "),
    },
  ]
  for (const section of sections) {
    slides.push({
      title: section.section_name,
      content: section.content ?? "",
    })
  }
  return slides
}

function downloadPptx(slides: SlideData[]) {
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"

  for (const slide of slides) {
    const s = pptx.addSlide()
    s.background = { color: "1A1A2E" }

    if (slide.isTitle) {
      s.addText(slide.title, {
        x: "5%",
        y: "30%",
        w: "90%",
        h: "20%",
        fontSize: 36,
        bold: true,
        color: "00D2FF",
        align: "center",
      })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: "5%",
          y: "55%",
          w: "90%",
          h: "10%",
          fontSize: 18,
          color: "E0E0E0",
          align: "center",
        })
      }
    } else {
      s.addText(slide.title, {
        x: "5%",
        y: "3%",
        w: "90%",
        h: "12%",
        fontSize: 28,
        bold: true,
        color: "00D2FF",
      })
      if (slide.content) {
        s.addText(slide.content, {
          x: "5%",
          y: "18%",
          w: "90%",
          h: "75%",
          fontSize: 14,
          color: "E0E0E0",
          valign: "top",
        })
      }
    }
  }

  pptx.writeFile({ fileName: "presentation.pptx" })
}

function SlidePreview({ slide }: { slide: SlideData }) {
  if (slide.isTitle) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg bg-[#1A1A2E] p-8">
        <h2 className="mb-4 text-center text-2xl font-bold text-[#00D2FF] md:text-3xl">
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="text-center text-sm text-gray-300 md:text-base">
            {slide.subtitle}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex aspect-video w-full flex-col rounded-lg bg-[#1A1A2E] p-6">
      <h3 className="mb-4 text-lg font-bold text-[#00D2FF] md:text-xl">
        {slide.title}
      </h3>
      {slide.content && (
        <p className="overflow-y-auto text-sm leading-relaxed text-gray-200 md:text-base">
          {slide.content}
        </p>
      )}
    </div>
  )
}

export function SlideViewer({ paperId }: SlideViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const scriptQuery = useQuery({
    queryKey: ["scripts", paperId],
    queryFn: () => scriptsApi.get(paperId).then((r) => r.data),
  })

  const paperQuery = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => papersApi.get(paperId).then((r) => r.data),
  })

  const loading = scriptQuery.isLoading || paperQuery.isLoading
  const error = scriptQuery.error || paperQuery.error

  const slides =
    scriptQuery.data && paperQuery.data
      ? buildSlides(scriptQuery.data.sections, paperQuery.data.metadata)
      : []
  const total = slides.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Presentation Slides</CardTitle>
        {total > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPptx(slides)}
          >
            <Download className="mr-1 h-4 w-4" /> Download PPTX
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{(error as Error).message}</p>
        )}

        {total > 0 && (
          <div className="space-y-4">
            <div className="relative">
              <SlidePreview slide={slides[currentSlide]} />

              {total > 1 && (
                <>
                  <button
                    onClick={() =>
                      setCurrentSlide((p) => (p > 0 ? p - 1 : total - 1))
                    }
                    className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlide((p) => (p < total - 1 ? p + 1 : 0))
                    }
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              <div className="absolute right-3 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                {currentSlide + 1} / {total}
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slides.map((slide, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`shrink-0 rounded border-2 px-3 py-1 text-xs transition ${
                    i === currentSlide
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-transparent text-gray-400 opacity-60 hover:opacity-100"
                  }`}
                >
                  {slide.isTitle ? "Title" : slide.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
