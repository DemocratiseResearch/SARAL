import { Button } from "@/components/ui/button";
import { PlayCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import HeroCTA from "./hero-cta";
import FeaturePill from "./feature-pill";

export default function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 pt-20 pb-16 max-sm:pt-12 max-sm:pb-10">
      {/* Animated feature pill */}
      <FeaturePill />

      {/* Headline */}
      <h1
        className="
          animate-fade-up [animation-delay:100ms]
          font-serif leading-[1.1] mb-7
          text-[72px] max-lg:text-[52px] max-md:text-[44px] max-sm:text-[36px]
        "
      >
        <span className="text-ink dark:text-white">
          Transform complex research into
        </span>
        <br />
        <span
          className="text-italic-text italic"
          style={{
            backgroundImage:
              "linear-gradient(to top, transparent 10%, rgba(215, 193, 168, 0.35) 40%, transparent 10%)",
            borderRadius: "4px",
            padding: "2px 8px",
          }}
        >
          engaging content
        </span>
      </h1>

      {/* Subheadline */}
      <p
        className="
          animate-fade-up [animation-delay:220ms]
          text-[17px] max-sm:text-[15px] text-ink-muted dark:text-white/70 leading-[1.65]
          max-w-145 mb-12
        "
      >
        Saral AI turns your research papers into reels, threads, podcasts,
        posters, and slides - ready to share anywhere.
      </p>

      {/* CTA buttons */}
      <div className="animate-fade-up [animation-delay:360ms] flex flex-row max-sm:flex-col gap-4 justify-center">
        <HeroCTA />

        {/* <Button
          variant="outline"
          size="lg"
          className="
            bg-white border border-[#d0d0d0] text-ink dark:text-white rounded-cta px-8 py-4 h-auto
            text-base font-semibold gap-2
            hover:bg-[#f5f5f5] transition-colors duration-200 cursor-pointer
          "
        >
          <PlayCircle size={18} /> See Demo
        </Button> */}
      </div>
    </section>
  );
}
