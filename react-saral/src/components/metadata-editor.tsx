import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { papersApi, type PaperResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "./ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Check, Edit2, FileText, User, Calendar, Save, X } from "lucide-react"

interface MetadataEditorProps {
  paper: PaperResponse
  onSuccess?: () => void
  isReadonly?: boolean
}

export function MetadataEditor({
  paper,
  onSuccess,
  isReadonly,
}: MetadataEditorProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(paper.metadata.title)
  const [authors, setAuthors] = useState(paper.metadata.authors)
  const [date, setDate] = useState(paper.metadata.date)

  const updateMutation = useMutation({
    mutationFn: (data: { title: string; authors: string; date: string }) =>
      papersApi.update(paper.paper_id, data).then((r) => r.data),
    onSuccess: () => {
      toast.success("Metadata updated successfully")
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ["paper", paper.paper_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update metadata")
    },
  })

  const handleSave = () => {
    updateMutation.mutate({ title, authors, date })
  }

  const handleContinue = () => {
    if (onSuccess) {
      onSuccess()
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card to-primary/5 p-6 shadow-sm transition-all duration-300 hover:shadow-md">
      {/* Header section */}
      <div className="mb-6 flex items-center justify-between border-b border-primary/5 pb-4">
        <div>
          <h3 className="font-heading text-xl font-bold text-foreground">
            {isReadonly ? "Project Details" : "Verify Information"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isReadonly
              ? "Extracted metadata for this research paper."
              : "Please ensure the extracted details are accurate."}
          </p>
        </div>
        {!isEditing && !isReadonly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="group gap-2 border-primary/20 hover:border-primary/50"
          >
            <Edit2 className="h-4 w-4 transition-transform group-hover:scale-110" />
            Edit Metadata
          </Button>
        )}
      </div>

      <div className="space-y-6">
        {/* Title Field */}
        <div className="group relative space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary/60" />
            <Label
              htmlFor="title"
              className="text-xs font-bold uppercase tracking-widest text-primary/70"
            >
              Paper Title
            </Label>
          </div>
          {isEditing ? (
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-primary/20 bg-background/50 text-lg font-semibold focus:border-primary"
            />
          ) : (
            <h2 className="text-xl font-bold leading-tight text-foreground/90">
              {paper.metadata.title}
            </h2>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Authors Field */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary/60" />
              <Label
                htmlFor="authors"
                className="text-xs font-bold uppercase tracking-widest text-primary/70"
              >
                Authors
              </Label>
            </div>
            {isEditing ? (
              <Input
                id="authors"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                className="border-primary/20 bg-background/50"
                placeholder="List of authors..."
              />
            ) : (
              <p className="text-base text-muted-foreground">
                {paper.metadata.authors || "No authors extracted"}
              </p>
            )}
          </div>

          {/* Date Field */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary/60" />
              <Label
                htmlFor="date"
                className="text-xs font-bold uppercase tracking-widest text-primary/70"
              >
                Publication Date
              </Label>
            </div>
            {isEditing ? (
              <Input
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border-primary/20 bg-background/50"
                placeholder="e.g. 2024"
              />
            ) : (
              <p className="text-base text-muted-foreground font-medium">
                {paper.metadata.date || "Unknown"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="mt-8 flex justify-end gap-3 border-t border-primary/5 pt-6">
        {isEditing ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsEditing(false)
                setTitle(paper.metadata.title)
                setAuthors(paper.metadata.authors)
                setDate(paper.metadata.date)
              }}
              disabled={updateMutation.isPending}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="gap-2 bg-primary px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30"
            >
              {updateMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            onClick={handleContinue}
            className="group gap-3 bg-primary px-8 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] hover:shadow-primary/30"
          >
            {isReadonly ? "Continue" : "Confirm & Continue"}
            <Check className="h-5 w-5 transition-transform group-hover:scale-110" />
          </Button>
        )}
      </div>
    </div>
  )
}
