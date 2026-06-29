import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const POST_URL =
  "https://www.linkedin.com/feed/update/urn:li:activity:7450586496589537280/";

export default function InTheNews() {
  return (
    <section id="media" className="px-6 py-24 max-sm:py-16 scroll-mt-24">
      {/* Eyebrow pill — same shape as before, just sized up so it reads
          as a heading element rather than a microbadge. */}
      <div className="flex justify-center mb-6">
        <span className="inline-flex items-center gap-2.5 rounded-pill bg-pill-bg dark:bg-white/5 border border-pill-border dark:border-white/10 px-5 py-2 text-[14px] font-semibold text-ink dark:text-white">
          <span className="h-2 w-2 rounded-full bg-amber-dot" />
          In the News
        </span>
      </div>

      {/* Headline */}
      <h2 className="font-serif text-[36px] max-lg:text-[30px] max-sm:text-[24px] text-ink dark:text-white font-bold leading-[1.15] text-center mb-10 max-sm:mb-8">
        Recognized by India&rsquo;s Ministry of{" "}
        <span
          className="text-italic-text italic"
          style={{
            backgroundImage:
              "linear-gradient(to top, transparent 10%, rgba(215, 193, 168, 0.35) 40%, transparent 10%)",
            borderRadius: "4px",
            padding: "2px 8px",
          }}
        >
          Science &amp; Technology
        </span>
      </h2>

      {/* Editorial spread */}
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-14 max-md:gap-10 items-center">
        {/* Photo column */}
        <figure className="flex flex-col">
          <div className="overflow-hidden rounded-2xl border border-pill-border dark:border-darkcardborder shadow-[0_8px_30px_rgba(17,17,17,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] bg-white dark:bg-carddarkbg">
            <Image
              src="/assets/media/jitendra-singh-anrf-meeting.png"
              alt="Dr. Jitendra Singh chairing a Department of Science & Technology review featuring SARAL AI"
              width={2000}
              height={894}
              className="w-full h-auto object-cover"
              priority={false}
            />
          </div>
          <figcaption className="mt-4 text-[13px] text-ink-faint dark:text-white/50 font-sans text-center max-sm:text-left">
            Dr. Jitendra Singh chairing a Science &amp; Technology review
            featuring SARAL AI
          </figcaption>
        </figure>

        {/* Quote column */}
        <div className="flex flex-col">
          {/* Decorative quote glyph — uses font-serif italic for visual continuity with hero */}
          <span
            aria-hidden="true"
            className="font-serif italic text-[64px] leading-none text-italic-text/60 dark:text-white/30 -ml-1"
          >
            &ldquo;
          </span>

          <blockquote className="font-serif italic text-[22px] max-lg:text-[19px] max-sm:text-[17px] leading-normal text-ink dark:text-white mb-8">
            SARAL AI addresses this directly by using artificial intelligence to
            transform complex research publications and patents into simple,
            engaging formats&hellip; in 18 Indian languages. The idea is not
            just simplification, but democratisation of knowledge.
          </blockquote>

          {/* Author block */}
          <div className="mb-8">
            <p className="font-sans text-[16px] font-semibold text-ink dark:text-white leading-tight">
              Dr. Jitendra Singh
            </p>
            <p className="font-sans text-[13px] text-ink-muted dark:text-white/60 leading-snug mt-1.5 max-w-md">
              Union Minister of State (Independent Charge),
              <br className="max-sm:hidden" /> Ministry of Science &amp;
              Technology, Government of India
            </p>
          </div>

          {/* CTA */}
          <div>
            <Button
              asChild
              variant="outline"
              className="border border-[#d0d0d0] dark:border-white/20 text-ink dark:text-white rounded-cta px-6 py-3 h-auto text-[14px] font-semibold hover:bg-linen-dark dark:hover:bg-white/10 transition-colors gap-2 w-fit"
            >
              <Link href={POST_URL} target="_blank" rel="noopener noreferrer">
                Read on LinkedIn <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
