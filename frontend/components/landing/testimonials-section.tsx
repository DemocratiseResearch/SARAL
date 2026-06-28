import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import TestimonialCard from "@/components/landing/testimonial-card";

// ── LANDING TESTIMONIALS (featured 3) ────────────────────────────────────────
// For the full list, see app/testimonials/page.tsx
const featured = [
  {
    id: "yt-harbola",
    name: "Video Testimonial",
    meta: "@harbola",
    metaUrl: "https://www.youtube.com/@harbola",
    type: "video" as const,
    videoId: "Sy3L8EvYymg",
  },
  {
    id: "yt-wcs",
    name: "IIT Indore",
    meta: "@WaterClimateSustainabilityLab",
    metaUrl: "https://www.youtube.com/channel/UCRUR2bFwd_KGBOhveB4SH5g",
    type: "video" as const,
    videoId: "RDeXvp7ikec",
  },
  {
    id: "abhishek",
    name: "Abhishek Verma",
    meta: "IIT Roorkee",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7411699547602759680/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/Abhishek.png",
    linkLabel: "LinkedIn",
  },
];

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="px-6 py-20 max-sm:py-12">
      {/* Header */}
      <div className="mb-14 text-center max-sm:mb-12">
        <h2 className="mb-4 font-serif text-[44px] font-bold leading-[1.12] tracking-tight text-ink dark:text-white max-lg:text-[36px] max-sm:text-[28px]">
          What Researchers Say
        </h2>
        <p className="mx-auto max-w-140 text-[17px] font-medium leading-relaxed text-[#454545] dark:text-white/80 max-sm:text-[16px]">
          Join researchers and academics who trust Saral AI to make their work
          more accessible and engaging.
        </p>
      </div>

      {/* Cards grid */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-8 md:grid-cols-3 md:gap-6">
        {featured.map((item, i) => (
          <TestimonialCard
            key={item.id}
            item={item}
            animationDelayMs={i * 80}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="flex justify-center mt-12">
        <Button
          asChild
          variant="outline"
          className="border border-[#d0d0d0] text-ink dark:text-white rounded-cta px-8 py-3 h-auto text-[15px] font-semibold hover:bg-linen-dark transition-colors gap-2"
        >
          <Link href="/testimonials">
            View all testimonials <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    </section>
  );
}
