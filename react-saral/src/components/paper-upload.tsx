import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Upload, Link as LinkIcon, FileText, CheckCircle2, Info } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface PaperUploadProps {
  onSuccess: (paper: PaperResponse) => void
  isReadonly?: boolean
}

export function PaperUpload({ onSuccess, isReadonly }: PaperUploadProps) {
  const [arxivUrl, setArxivUrl] = useState("")
  const [tab, setTab] = useState<"arxiv" | "zip" | "pdf">("arxiv")

  const handleSuccess = (data: PaperResponse) => {
    toast.success("Paper uploaded successfully!")
    onSuccess(data)
  }

  const handleError = (error: Error) => {
    toast.error(error.message || "Failed to upload paper")
  }

  const arxivMutation = useMutation({
    mutationFn: (url: string) => papersApi.scrapeArxiv(url).then((r) => r.data),
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const zipMutation = useMutation({
    mutationFn: (file: File) => papersApi.uploadZip(file).then((r) => r.data),
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const pdfMutation = useMutation({
    mutationFn: (file: File) => papersApi.uploadPdf(file).then((r) => r.data),
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const loading =
    arxivMutation.isPending || zipMutation.isPending || pdfMutation.isPending
  const error = arxivMutation.error || zipMutation.error || pdfMutation.error

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card to-primary/5 p-6 shadow-sm transition-all duration-300">
      {isReadonly ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping rounded-full bg-green-500/20" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-100 shadow-inner dark:bg-green-900/30">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h3 className="font-heading text-xl font-bold text-foreground">
            Upload Complete
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your paper has been successfully uploaded and the system has
            extracted its core structure.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
            Source Document Verified
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-bold text-foreground">
              Source Document
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose your preferred method to import the research paper.
            </p>
          </div>

          <div className="flex gap-1.5 rounded-lg border border-primary/5 bg-background/50 p-1">
            {(["arxiv", "pdf", "zip"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-bold transition-all",
                  tab === t
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                {t === "arxiv" && <LinkIcon className="h-4 w-4" />}
                {t === "zip" && <Upload className="h-4 w-4" />}
                {t === "pdf" && <FileText className="h-4 w-4" />}
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-[160px]">
            {tab === "arxiv" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://arxiv.org/abs/2301.12345"
                    value={arxivUrl}
                    onChange={(e) => setArxivUrl(e.target.value)}
                    disabled={loading}
                    className="h-12 border-primary/20 bg-background/50 focus:border-primary"
                  />
                  <Button
                    size="lg"
                    onClick={() => arxivMutation.mutate(arxivUrl)}
                    disabled={!arxivUrl || loading}
                    className="px-6"
                  >
                    {loading ? <Spinner size="sm" /> : "Fetch Paper"}
                  </Button>
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  We'll automatically extract metadata and figures from the
                  arXiv source.
                </p>
              </div>
            )}

            {(tab === "pdf" || tab === "zip") && (
              <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/10 bg-primary/5 p-10 transition-all hover:border-primary/40 hover:bg-primary/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  {tab === "pdf" ? (
                    <FileText className="h-7 w-7 text-primary" />
                  ) : (
                    <Upload className="h-7 w-7 text-primary" />
                  )}
                </div>
                <div className="text-center">
                  <span className="block text-base font-bold text-foreground">
                    {loading ? "Uploading…" : `Upload ${tab.toUpperCase()}`}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Drag and drop or click to browse
                  </span>
                </div>
                <input
                  type="file"
                  accept={tab === "pdf" ? ".pdf" : ".zip"}
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (tab === "pdf") pdfMutation.mutate(file)
                      else zipMutation.mutate(file)
                    }
                  }}
                />
              </label>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm font-medium text-red-600 dark:text-red-400 animate-in shake duration-300">
              {(error as Error).message || "Something went wrong"}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
