import { cn } from "@/lib/utils"

interface SpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  const sizeClass = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" }[size]
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-gray-300 border-t-brand-600",
        sizeClass,
        className
      )}
    />
  )
}
