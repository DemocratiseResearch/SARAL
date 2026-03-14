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
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-8 shadow-inner md:p-12">
        <div className="max-w-4xl space-y-6 text-center">
          <h2 className="text-balance font-heading text-3xl font-bold tracking-tight text-white drop-shadow-sm md:text-4xl lg:text-5xl">
            {slide.title}
          </h2>
          {slide.subtitle && (
            <p className="text-balance font-sans text-sm font-medium text-slate-300 md:text-base lg:text-lg">
              {slide.subtitle}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex aspect-video w-full flex-col rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-8 shadow-inner md:p-10">
      <h3 className="mb-6 font-heading text-2xl font-bold tracking-tight text-white drop-shadow-sm md:text-3xl lg:text-4xl px-2">
        {slide.title}
      </h3>
      {slide.content && (
        <div className="flex-1 overflow-y-auto px-2">
          <p className="text-base leading-relaxed text-slate-200 md:text-lg">
            {slide.content}
          </p>
        </div>
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
          <div className="space-y-6">
            {/* Slide Preview with Controls */}
            <div className="group relative overflow-hidden rounded-xl shadow-lg ring-1 ring-border/50">
              <SlidePreview slide={slides[currentSlide]} />

              {total > 1 && (
                <>
                  <button
                    onClick={() =>
                      setCurrentSlide((p) => (p > 0 ? p - 1 : total - 1))
                    }
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/70 opacity-0 backdrop-blur-md transition-all hover:bg-black/60 hover:text-white group-hover:opacity-100"
                  >
                    <ChevronLeft className="size-6 cursor-pointer" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlide((p) => (p < total - 1 ? p + 1 : 0))
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/70 opacity-0 backdrop-blur-md transition-all hover:bg-black/60 hover:text-white group-hover:opacity-100"
                  >
                    <ChevronRight className="size-6 cursor-pointer" />
                  </button>
                </>
              )}

              <div className="absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1 text-xs font-medium tracking-wide text-white/90 backdrop-blur-md">
                {currentSlide + 1} / {total}
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex snap-x gap-2 overflow-x-auto pb-2 pt-2 scrollbar-none">
              {slides.map((slide, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`shrink-0 snap-center rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    i === currentSlide
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {slide.isTitle
                    ? "Title"
                    : slide.title.length > 30
                      ? slide.title.substring(0, 30) + "..."
                      : slide.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
