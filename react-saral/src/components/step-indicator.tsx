import { cn } from "@/lib/utils"
import { type WorkflowStep } from "@/stores/workflow-store"
import { Check } from "lucide-react"

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "scripts", label: "Scripts" },
  { key: "images", label: "Images" },
  { key: "slides", label: "Slides" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
]

const ORDER = STEPS.map((s) => s.key)

export function StepIndicator({ current }: { current: WorkflowStep }) {
  const currentIdx = ORDER.indexOf(current)

  return (
    <nav className="flex items-center justify-center gap-2 py-6">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                done && "bg-green-500 text-white",
                active && "bg-brand-600 text-white",
                !done && !active && "bg-gray-200 text-gray-500 dark:bg-gray-700"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                active && "font-semibold text-brand-600",
                done && "text-green-600",
                !done && !active && "text-gray-400"
              )}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-8",
                  idx < currentIdx
                    ? "bg-green-500"
                    : "bg-gray-300 dark:bg-gray-600"
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
