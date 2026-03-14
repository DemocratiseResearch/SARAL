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
      <Card className="h-full rounded-lg p-6 transition-shadow duration-150 hover:shadow-lg">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
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
      icon: Check,
      title: "Slide Generation",
      description:
        "Preview and download slides as PPTX. Slides are rendered client-side for fast, customizable presentations.",
    },
  ]

  const benefits = [
    "Upload papers from arXiv or LaTeX sources",
    "AI-powered script generation",
    "Multi-language voice synthesis",
    "Customizable slides and content",
    "Export slides and audio",
  ]

  return (
    <div className="min-h-screen bg-background transition-colors duration-150">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="font-heading text-sm font-bold text-primary-foreground">
                SA
              </span>
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              Saral AI
            </h1>
          </Link>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <Link
                to="/dashboard"
                className="text-base font-semibold text-black dark:text-white dark:hover:text-white/50 hover:text-[#084898]"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-base font-semibold text-black dark:text-white dark:hover:text-white/50 hover:text-[#084898]"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="border-b border-border py-16 md:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center px-6 md:flex-row">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.05 }}
            className="text-center md:w-1/2"
          >
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Turn Academic Papers into Slide Presentations with Narrated Audio
            </h2>

            <p className="mb-8 text-lg text-muted-foreground">
              Saral AI seamlessly transforms your research papers into engaging
              slide presentations, utilizing AI-powered scripts, customizable
              slides, and natural voice narration.
            </p>

            <div className="flex items-center justify-center gap-3">
              <Link to={user ? "/dashboard" : "/login"}>
                <Button size="lg" className="font-heading gap-2">
                  Get Started <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Videos — See Saral AI in Action ────────────────────── */}
      <section className="border-b border-border py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-12 text-center"
          >
            <h2 className="text-3xl font-semibold text-foreground">
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
                <h3 className="mb-4 text-lg font-semibold text-foreground">
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
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 text-3xl font-semibold text-foreground">
              How It Works
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
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
              <h2 className="mb-6 text-3xl font-semibold text-foreground">
                Democratize Research Access
              </h2>
              <p className="mb-8 leading-relaxed text-muted-foreground">
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
                    <span className="text-foreground">
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
              <Card className="rounded-lg p-8">
                <div className="text-center">
                  <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-muted">
                    <Video className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-foreground">
                    Ready to Get Started?
                  </h3>
                  <p className="mb-6 text-muted-foreground">
                    Join researchers worldwide who are making their work more
                    accessible through video presentations.
                  </p>
                  <Link to={user ? "/dashboard" : "/login"} className="block">
                    <Button className="font-heading w-full gap-2">
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
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-12 text-center text-3xl font-semibold text-foreground"
          >
            Partners
          </motion.h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                name: "Anusandhan National Research Foundation (ANRF)",
                logo: "/logos/anrf-logo.png",
                url: "https://anrfonline.in",
                domain: "anrfonline.in",
              },
              {
                name: "Sarvam",
                logo: "/logos/sarvam-ai-logo.jpeg",
                url: "https://sarvam.ai",
                domain: "sarvam.ai",
              },
              {
                name: "Google",
                logo: null,
                url: "https://cloud.google.com",
                domain: "cloud.google.com",
              },
            ].map((partner, idx) => (
              <motion.div
                key={partner.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.05 }}
                className="h-full"
              >
                <Card className="flex h-full flex-col items-center rounded-lg p-6 text-center">
                  <div className="mb-4 flex h-28 w-40 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
                    {partner.logo ? (
                      <img
                        src={partner.logo}
                        alt={partner.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <svg viewBox="0 0 24 24" className="size-16">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                  </div>
                  <h3 className="mb-4 text-base font-semibold text-foreground">
                    {partner.name}
                  </h3>
                  <div className="mt-auto flex w-full items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {partner.domain}
                    </span>
                    <a
                      href={partner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="font-heading gap-1.5">
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
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="font-heading text-sm font-bold text-primary-foreground">
                SA
              </span>
            </div>
            <span className="font-heading text-lg font-semibold text-foreground">
              Saral AI
            </span>
          </div>
          <p className="mb-6 text-muted-foreground">
            Making research accessible through AI-powered video generation
          </p>
          <div className="flex justify-center gap-6">
            <a
              href="mailto:democratise.research@gmail.com"
              className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
