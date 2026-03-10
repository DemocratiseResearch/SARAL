import { createFileRoute, Link } from "@tanstack/react-router"
import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"
import { ArrowRight, FileText, Video, Languages } from "lucide-react"

export const Route = createFileRoute("/")({
  component: LandingPage,
})

function LandingPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          <span className="text-brand-600">SARAL</span> — Paper to Video
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          Transform research papers into narrated video presentations in
          minutes. Upload a paper, generate scripts, create slides, add audio in
          11 Indian languages, and produce a polished video — all from one
          workflow.
        </p>

        <div className="mt-10 flex justify-center gap-4">
          {user ? (
            <Link to="/dashboard">
              <Button size="lg">
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button size="lg">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        <div className="mt-20 grid gap-8 text-left sm:grid-cols-3">
          <FeatureCard
            icon={<FileText className="h-8 w-8 text-brand-600" />}
            title="Multi-Source Input"
            description="Upload LaTeX ZIP, PDF, or paste an arXiv URL. SARAL extracts text, metadata, and images automatically."
          />
          <FeatureCard
            icon={<Languages className="h-8 w-8 text-brand-600" />}
            title="11 Languages"
            description="Generate narrations in English, Hindi, Tamil, Telugu, and 8 more Indian languages via Sarvam AI."
          />
          <FeatureCard
            icon={<Video className="h-8 w-8 text-brand-600" />}
            title="End-to-End Pipeline"
            description="From paper to video in a guided workflow: scripts, slides, audio, and final video composition."
          />
        </div>
      </div>
    </Layout>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
      <div className="mb-4">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  )
}
