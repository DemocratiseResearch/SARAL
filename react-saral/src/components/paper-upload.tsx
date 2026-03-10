import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Upload, Link as LinkIcon, FileText } from "lucide-react"

interface PaperUploadProps {
  onSuccess: (paper: PaperResponse) => void
}

export function PaperUpload({ onSuccess }: PaperUploadProps) {
  const [arxivUrl, setArxivUrl] = useState("")
  const [tab, setTab] = useState<"arxiv" | "zip" | "pdf">("arxiv")

  const arxivMutation = useMutation({
    mutationFn: (url: string) => papersApi.scrapeArxiv(url).then((r) => r.data),
    onSuccess,
  })

  const zipMutation = useMutation({
    mutationFn: (file: File) => papersApi.uploadZip(file).then((r) => r.data),
    onSuccess,
  })

  const pdfMutation = useMutation({
    mutationFn: (file: File) => papersApi.uploadPdf(file).then((r) => r.data),
    onSuccess,
  })

  const loading =
    arxivMutation.isPending || zipMutation.isPending || pdfMutation.isPending
  const error = arxivMutation.error || zipMutation.error || pdfMutation.error

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Upload Research Paper</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {(["arxiv", "zip", "pdf"] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t)}
            >
              {t === "arxiv" && <LinkIcon className="mr-1 h-4 w-4" />}
              {t === "zip" && <Upload className="mr-1 h-4 w-4" />}
              {t === "pdf" && <FileText className="mr-1 h-4 w-4" />}
              {t.toUpperCase()}
            </Button>
          ))}
        </div>

        {tab === "arxiv" && (
          <div className="flex gap-2">
            <Input
              placeholder="https://arxiv.org/abs/2301.12345"
              value={arxivUrl}
              onChange={(e) => setArxivUrl(e.target.value)}
              disabled={loading}
            />
            <Button
              onClick={() => arxivMutation.mutate(arxivUrl)}
              disabled={!arxivUrl || loading}
            >
              {loading ? <Spinner size="sm" /> : "Fetch"}
            </Button>
          </div>
        )}

        {tab === "zip" && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-brand-500 dark:border-gray-600">
            <Upload className="mb-2 h-8 w-8 text-gray-400" />
            <span className="text-sm text-gray-500">
              {loading ? "Uploading…" : "Click to upload a ZIP file"}
            </span>
            <input
              type="file"
              accept=".zip"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) zipMutation.mutate(file)
              }}
            />
          </label>
        )}

        {tab === "pdf" && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-brand-500 dark:border-gray-600">
            <FileText className="mb-2 h-8 w-8 text-gray-400" />
            <span className="text-sm text-gray-500">
              {loading ? "Uploading…" : "Click to upload a PDF"}
            </span>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) pdfMutation.mutate(file)
              }}
            />
          </label>
        )}

        {error && (
          <p className="text-sm text-red-500">
            {(error as Error).message || "Something went wrong"}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
