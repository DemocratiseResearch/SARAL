import type { LucideIcon } from "lucide-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  ArrowRight,
  FileText,
  Mic,
  Video,
  Zap,
  Check,
  ExternalLink,
} from "lucide-react"
import { motion } from "motion/react"

export const Route = createFileRoute("/")({
  component: LandingPage,
})

/* ------------------------------------------------------------------ */
/*  Feature card                                                       */
/* ------------------------------------------------------------------ */

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  delay?: number
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay }}
      className="h-full"
    >
      <Card className="h-full p-6 transition-shadow duration-150 hover:shadow-lg">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <Icon className="size-6 text-gray-700 dark:text-gray-300" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {description}
        </p>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Landing page                                                       */
/* ------------------------------------------------------------------ */

function LandingPage() {
  const user = useAuthStore((s) => s.user)

  const features: FeatureCardProps[] = [
    {
      icon: FileText,
      title: "Paper Upload",
      description:
        "Upload research papers via arXiv links or direct LaTeX files. Our system automatically extracts content and figures.",
    },
    {
      icon: Zap,
      title: "AI Script Generation",
      description:
        "Generate engaging presentation scripts using advanced AI models like Gemini and GPT for educational content.",
    },
    {
      icon: Mic,
      title: "Voice Synthesis",
      description:
        "Convert scripts to natural-sounding audio narration with support for multiple languages including Hindi.",
    },
    {
      icon: Video,
      title: "Video Production",
      description:
        "Automatically create professional presentation videos combining slides, narration, and visual elements.",
    },
  ]

  const benefits = [
    "Upload papers from arXiv or LaTeX sources",
    "AI-powered script generation",
    "Multi-language voice synthesis",
    "Professional video output",
    "Customizable slides and content",
    "Export in multiple formats",
  ]

  return (
    <div className="min-h-screen bg-neutral-50 transition-colors duration-150 dark:bg-neutral-900">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-neutral-200 dark:border-neutral-700">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gray-900 dark:bg-white">
              <span className="text-sm font-bold text-white dark:text-gray-900">
                SA
              </span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Saral AI
            </h1>
          </Link>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <Link to="/dashboard">
                <Button variant="secondary">Dashboard</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="border-b border-neutral-200 py-16 md:py-20 dark:border-neutral-700">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center px-6 md:flex-row">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.05 }}
            className="text-center md:w-1/2"
          >
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl dark:text-white">
              Turn Academic Papers into Engaging Video Presentations
            </h2>

            <p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
              Saral AI seamlessly transforms your research papers into
              professional video presentations, utilizing AI-powered scripts,
              customized slides, and natural voice narration.
            </p>

            <div className="flex items-center justify-center gap-3">
              <Link to={user ? "/dashboard" : "/login"}>
                <Button size="lg" className="gap-2">
                  Get Started <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Videos — See Saral AI in Action ────────────────────── */}
      <section className="border-b border-neutral-200 py-24 dark:border-neutral-700">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-12 text-center"
          >
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              See Saral AI in Action
            </h2>
          </motion.div>

          <div className="grid gap-10 md:grid-cols-2">
            {[
              {
                title: "Saral podcast demo",
                id: "K6mUnh1aXMQ",
              },
              {
                title: "Hands-on Session with ANRF",
                id: "ORRieF7JI_w",
              },
            ].map((video, idx) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.05 }}
                className="flex flex-col items-center"
              >
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                  {video.title}
                </h3>
                <div className="aspect-video w-full overflow-hidden rounded-xl shadow-lg">
                  <iframe
                    className="size-full"
                    src={`https://www.youtube.com/embed/${video.id}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section className="bg-white py-24 dark:bg-neutral-800">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 text-3xl font-semibold text-gray-900 dark:text-white">
              How It Works
            </h2>
            <p className="mx-auto max-w-2xl text-gray-600 dark:text-gray-400">
              Our streamlined workflow transforms your research papers into
              professional presentation videos in just a few steps.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, idx) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={idx * 0.05}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ───────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h2 className="mb-6 text-3xl font-semibold text-gray-900 dark:text-white">
                Democratize Research Access
              </h2>
              <p className="mb-8 leading-relaxed text-gray-600 dark:text-gray-400">
                Make complex research accessible to wider audiences through
                engaging video presentations. Our AI-powered platform handles
                the technical complexity while you focus on your content.
              </p>

              <div className="space-y-3">
                {benefits.map((benefit, idx) => (
                  <motion.div
                    key={benefit}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: idx * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                      <Check className="size-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">
                      {benefit}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: 0.1 }}
            >
              <Card className="bg-linear-to-br from-gray-50 to-gray-100 p-8 dark:from-gray-800 dark:to-gray-900">
                <div className="text-center">
                  <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-900/20">
                    <Video className="size-8 text-gray-600 dark:text-gray-400" />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
                    Ready to Get Started?
                  </h3>
                  <p className="mb-6 text-gray-600 dark:text-gray-400">
                    Join researchers worldwide who are making their work more
                    accessible through video presentations.
                  </p>
                  <Link to={user ? "/dashboard" : "/login"} className="block">
                    <Button className="w-full gap-2">
                      Create Your First Video
                      <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Partners ───────────────────────────────────────────── */}
      <section className="border-t border-neutral-200 py-24 dark:border-neutral-700">
        <div className="mx-auto max-w-7xl px-6">
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-12 text-center text-3xl font-semibold text-gray-900 dark:text-white"
          >
            Partners
          </motion.h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                name: "Anusandhan National Research Foundation (ANRF)",
                logo: "/logos/anrf.svg",
                url: "https://anrfonline.in",
                domain: "anrfonline.in",
              },
              {
                name: "Sarvam",
                logo: "/logos/sarvam.svg",
                url: "https://sarvam.ai",
                domain: "sarvam.ai",
              },
              {
                name: "Google",
                logo: "/logos/google.svg",
                url: "https://cloud.google.com",
                domain: "cloud.google.com",
              },
            ].map((partner, idx) => (
              <motion.div
                key={partner.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.05 }}
              >
                <Card className="flex flex-col items-center p-6 text-center">
                  <div className="mb-4 flex h-28 w-40 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
                    {partner.name}
                  </h3>
                  <div className="mt-auto flex w-full items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {partner.domain}
                    </span>
                    <a
                      href={partner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="gap-1.5">
                        Visit <ExternalLink className="size-3" />
                      </Button>
                    </a>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-200 py-12 dark:border-neutral-700">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gray-900 dark:bg-white">
              <span className="text-sm font-bold text-white dark:text-gray-900">
                SA
              </span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Saral AI
            </span>
          </div>
          <p className="mb-6 text-gray-500 dark:text-gray-400">
            Making research accessible through AI-powered video generation
          </p>
          <div className="flex justify-center gap-6">
            <a
              href="mailto:democratise.research@gmail.com"
              className="text-gray-600 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
