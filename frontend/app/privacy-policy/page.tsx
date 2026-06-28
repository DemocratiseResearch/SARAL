import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the Saral AI privacy policy: how we collect, use, and protect your data when you use our research-to-media platform.",
  alternates: { canonical: "/privacy-policy" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacy Policy - Saral AI",
    description:
      "Read the Saral AI privacy policy: how we collect, use, and protect your data when you use our research-to-media platform.",
    url: "/privacy-policy",
  },
};

import Navbar from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LAST_UPDATED = "2 Feb 2026";
const CONTACT_EMAIL = "democratiseresearch@gmail.com";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder mb-6">
      <CardContent className="p-8">
        <h2 className="font-serif text-[24px] max-sm:text-[20px] text-ink dark:text-white font-bold mb-4">
          {title}
        </h2>
        <div className="text-[16px] text-ink-muted dark:text-white/70 leading-relaxed space-y-3">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 mt-1">
      {items.map((item, idx) => (
        <li key={idx} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saral-forest dark:bg-saral-forest/80"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <main className="max-w-7xl mx-auto">
        <Navbar />

        <div className="px-6 pt-10 pb-4">
          <Button
            asChild
            variant="ghost"
            className="text-ink-muted hover:text-ink dark:text-white gap-1.5 px-0 h-auto font-normal"
          >
            <Link href="/">
              <ArrowLeft size={15} /> Back to home
            </Link>
          </Button>
        </div>

        <div className="max-w-3xl mx-auto px-6 pb-20">
          {/* Hero */}
          <section className="text-center py-10">
            <span className="inline-flex items-center gap-2 rounded-pill bg-pill-bg dark:bg-white/5 border border-pill-border dark:border-white/10 px-3.5 py-1.5 text-[12px] font-medium text-ink-muted dark:text-white/70 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-dot" />
              Last updated: {LAST_UPDATED}
            </span>
            <h1 className="font-serif text-[44px] max-lg:text-[36px] max-sm:text-[28px] text-ink dark:text-white font-bold leading-tight mb-4">
              Privacy Policy
            </h1>
            <p className="text-[16px] text-ink-muted dark:text-white/70 max-w-xl mx-auto leading-relaxed">
              Saral AI is a research platform that helps you transform
              scholarly content into accessible formats — summaries, videos,
              posters, and podcasts.
            </p>
          </section>

          {/* Information We Collect */}
          <SectionCard title="Information We Collect">
            <p>
              Saral AI follows a minimal data collection approach.
            </p>
            <p>
              Saral AI does not collect or store any personally identifiable
              information (PII) beyond what is strictly required for
              authentication.
            </p>
            <p>
              We do not collect browsing history, location data, device
              identifiers, or behavioral analytics that can be used to identify
              users.
            </p>
          </SectionCard>

          {/* Authentication */}
          <SectionCard title="Authentication (Google OAuth)">
            <p>
              Saral AI uses Google OAuth solely to authenticate users and
              identify who is logged in to the platform.
            </p>
            <BulletList
              items={[
                "Information obtained via Google OAuth is used only for authentication purposes.",
                "This information is not used for communication, marketing, outreach, profiling, or analytics.",
                "We do not contact users using their Google account information.",
                "Authentication data is not shared with third parties.",
              ]}
            />
          </SectionCard>

          {/* Content Processing */}
          <SectionCard title="Content Processing">
            <p>
              Saral AI processes user-provided content (such as research papers
              or text explicitly selected or uploaded by the user) only to
              generate the requested outputs, including summaries, videos,
              posters, or podcasts.
            </p>
            <BulletList
              items={[
                "Content is processed only for the intended functionality.",
                "Content is not stored, retained, or reused after processing.",
                "Content is not shared with third parties for advertising or analytics.",
              ]}
            />
          </SectionCard>

          {/* Data Storage */}
          <SectionCard title="Data Storage">
            <p>
              Saral AI does not store personally identifiable user data. Any
              temporary data used during processing is discarded once the
              requested output is generated.
            </p>
          </SectionCard>

          {/* Third-Party Access */}
          <SectionCard title="Third-Party Access">
            <p>
              Saral AI does not sell, rent, or share user data with third
              parties. No user data is used for advertising, tracking, or
              profiling.
            </p>
          </SectionCard>

          {/* Permissions */}
          <SectionCard title="Permissions">
            <p>
              Saral AI requests only the minimum access required to:
            </p>
            <BulletList
              items={[
                "Authenticate users via Google OAuth.",
                "Access user-provided content for transformation.",
                "Deliver outputs explicitly requested by the user.",
              ]}
            />
            <p>This access is not used for any other purpose.</p>
          </SectionCard>

          {/* Children's Privacy */}
          <SectionCard title="Children's Privacy">
            <p>
              Saral AI does not knowingly collect data from children under the
              age of 13.
            </p>
          </SectionCard>

          {/* Changes */}
          <SectionCard title="Changes to This Policy">
            <p>
              Any updates to this privacy policy will be reflected on this page
              with an updated &ldquo;Last updated&rdquo; date.
            </p>
          </SectionCard>

          {/* Contact */}
          <Card className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder">
            <CardContent className="p-8 text-center">
              <h2 className="font-serif text-[24px] text-ink dark:text-white font-bold mb-3">
                Contact
              </h2>
              <p className="text-[16px] text-ink-muted dark:text-white/70 mb-7">
                Questions or concerns about this privacy policy? Reach out and
                we&rsquo;ll get back to you.
              </p>
              <Button
                asChild
                className="bg-ink text-white rounded-cta px-8 py-3 h-auto font-semibold hover:bg-[#333] transition-colors gap-2"
              >
                <Link href={`mailto:${CONTACT_EMAIL}`}>
                  <Mail size={16} /> {CONTACT_EMAIL}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <main className="max-w-7xl mx-auto">
        <Footer />
      </main>
    </>
  );
}
