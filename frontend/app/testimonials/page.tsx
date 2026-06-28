import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/landing/navbar";

export const metadata: Metadata = {
  title: "Testimonials",
  description:
    "See what researchers, educators, and students say about Saral AI — real stories of turning dense papers into engaging videos, podcasts, and slides.",
  alternates: { canonical: "/testimonials" },
  openGraph: {
    title: "Testimonials - Saral AI",
    description:
      "See what researchers, educators, and students say about Saral AI — real stories of turning dense papers into engaging videos, podcasts, and slides.",
    url: "/testimonials",
  },
};
import Footer from "@/components/landing/footer";
import TestimonialCard from "@/components/landing/testimonial-card";
import { Button } from "@/components/ui/button";

// ── TESTIMONIALS LIST ────────────────────────────────────────────────────────
// Add new testimonials here. type: "video" needs videoId; type: "image" needs imageSrc.
const testimonials = [
  {
    id: "yt-wcs",
    name: "IIT Indore",
    meta: "@WaterClimateSustainabilityLab",
    metaUrl: "https://www.youtube.com/channel/UCRUR2bFwd_KGBOhveB4SH5g",
    type: "video" as const,
    videoId: "RDeXvp7ikec",
  },
  {
    id: "yt-harbola",
    name: "Video Testimonial",
    meta: "@harbola",
    metaUrl: "https://www.youtube.com/@harbola",
    type: "video" as const,
    videoId: "Sy3L8EvYymg",
  },
  {
    id: "iitr",
    name: "Indian Institute of Technology, Roorkee",
    meta: "LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7414543292480159744/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/iitr.png",
  },
  {
    id: "abhishek",
    name: "Abhishek Verma",
    meta: "IIT Roorkee · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7411699547602759680/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/Abhishek.png",
  },
  {
    id: "rashmi",
    name: "Rashmi Choudhary",
    meta: "IIT Roorkee · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7412113890169430017/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/Rashmi.png",
  },
  {
    id: "prem",
    name: "Prem Kumar Sharma",
    meta: "IIT Bombay · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7409835343283294208/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/prem.png",
  },
  {
    id: "seetha",
    name: "Seethalakshmi B R",
    meta: "CSIR-SERC · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7400437344828420097/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/seetha.png",
  },
  {
    id: "anupam",
    name: "Anupam Sobti",
    meta: "Plaksha University · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7413272457983389696/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/anupam.png",
  },
  {
    id: "aaditya",
    name: "Aaditya Pandey",
    meta: "IIT Roorkee · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7409226873274171392/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/aaditya_pandey.png",
  },
  {
    id: "chittaranjan",
    name: "Chitranshu Harbola",
    meta: "IIT Madras · LinkedIn",
    metaUrl:
      "https://www.linkedin.com/feed/update/urn:li:activity:7364500174263554048/",
    type: "image" as const,
    imageSrc: "/assets/testimonial_images/chittaranjan.png",
  },
];

export default function TestimonialsPage() {
  return (
    <>
      <main className="max-w-7xl mx-auto">
        <Navbar />

        <div className="px-6 pt-10 pb-4">
          <Button
            asChild
            variant="ghost"
            className="text-ink-muted dark:text-white/70 hover:text-ink gap-1.5 px-0 h-auto font-normal"
          >
            <Link href="/">
              <ArrowLeft size={15} /> Back to home
            </Link>
          </Button>
        </div>

        {/* Hero */}
        <section className="px-6 pb-14 pt-6 text-center">
          <h1 className="mb-4 font-serif text-[52px] font-bold leading-[1.12] tracking-tight text-ink dark:text-white max-lg:text-[40px] max-sm:text-[32px]">
            What Researchers Say
          </h1>
          <p className="mx-auto max-w-140 text-[17px] font-medium leading-relaxed text-[#454545] dark:text-white/80 max-sm:text-[16px]">
            Join researchers and academics who trust Saral AI to transform their
            papers into engaging educational content.
          </p>
        </section>

        {/* Grid */}
        <section className="px-6 pb-20">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-8 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {testimonials.map((item, index) => (
              <TestimonialCard
                key={item.id}
                item={item}
                animationDelayMs={Math.min(index * 45, 720)}
                imageSizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            ))}
          </div>
        </section>
      </main>

      <main className="max-w-7xl mx-auto">
        <Footer />
      </main>
    </>
  );
}
