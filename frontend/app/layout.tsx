import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { ThemedToaster } from "@/components/themed-toaster";
import { FirebaseTokenSync } from "@/components/auth/firebase-token-sync";
import PwaRegister from "@/components/pwa/pwa-register";
import PwaInstallPrompt from "@/components/pwa/pwa-install-prompt";
import NeedsInputWatcher from "@/components/notifications/needs-input-watcher";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const SITE_NAME = "Saral AI";
const SITE_TITLE = "Saral AI - Academic Papers to Multiple Outputs";
const SITE_DESCRIPTION =
  "Saral AI automatically converts your research papers into professional video presentations with AI-generated scripts, custom slides, and natural voice narration.";
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://saral.democratiseresearch.in"
).replace(/\/$/, "");
const SITE_OG_IMAGE = "/light/Logo-Sqaure-light.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s - Saral AI",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "Saral AI",
    "research paper to video",
    "academic paper summarizer",
    "AI research assistant",
    "paper to podcast",
    "paper to slides",
    "paper to reel",
    "research video generator",
    "scientific communication",
    "educational AI",
    "academic content creation",
  ],
  authors: [{ name: "Saral AI" }],
  creator: "Saral AI",
  publisher: "Saral AI",
  category: "education",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE,
        width: 414,
        height: 201,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#111315" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="bg-linen dark:bg-saral-dark font-sans antialiased overflow-x-hidden">
        <ThemeProvider>
          {/* Fixed bottom-left peach glow blob — purely decorative; hidden in dark */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[-1] dark:hidden"
            style={{
              background:
                "radial-gradient(ellipse 60% 55% at 0% 100%, rgba(240,195,145,0.40) 0%, transparent 70%)",
            }}
          />
          <TooltipProvider>
            <FirebaseTokenSync />
            <PwaRegister />
            <PwaInstallPrompt />
            <NeedsInputWatcher />
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
