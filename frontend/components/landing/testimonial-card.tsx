import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";

export type TestimonialItem = {
  id: string;
  name: string;
  meta: string;
  metaUrl: string;
} & (
  | { type: "video"; videoId: string; imageSrc?: never }
  | { type: "image"; imageSrc: string; videoId?: never }
);

export default function TestimonialCard({
  item,
  animationDelayMs,
  imageSizes = "(max-width: 768px) 100vw, 32vw",
}: {
  item: TestimonialItem;
  animationDelayMs: number;
  imageSizes?: string;
}) {
  return (
    <Card
      className="
        group flex h-full min-h-0 flex-col gap-0 overflow-hidden border border-pill-border bg-linen dark:bg-carddarkbg dark:border-darkcardborder py-0 shadow-sm
        transition-all duration-200 hover:bg-saral-forest/20 hover:shadow-md
        animate-fade-up
      "
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <CardHeader className="flex min-h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-[#e8e2d8] dark:border-darkcardborder bg-linen dark:bg-carddarkbg px-4 py-3 group-hover:bg-transparent">
        <span className="truncate font-sans text-[15px] font-bold tracking-tight text-ink dark:text-white max-lg:text-[14px]">
          {item.name}
        </span>
        {item.metaUrl && (
          <Link
            href={item.metaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex max-w-[45%] items-center gap-1.5 truncate font-sans text-[13px] font-semibold text-[#3a3a3a] transition-colors hover:text-ink dark:text-white max-sm:text-[12px] sm:max-w-[55%]"
          >
            {item.meta}
            <ExternalLink size={13} className="shrink-0 opacity-80" />
          </Link>
        )}
      </CardHeader>

      <div className="relative min-h-[400px] w-full flex-1 overflow-hidden bg-black/6 max-md:min-h-[360px]">
        {item.type === "video" ? (
          <iframe
            className="absolute inset-0 h-full w-full border-0"
            src={`https://www.youtube.com/embed/${item.videoId}`}
            title={`${item.name} testimonial`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <Link
            href={item.metaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 block"
          >
            <Image
              src={item.imageSrc}
              alt={`${item.name} testimonial`}
              fill
              sizes={imageSizes}
              className="object-cover object-top"
            />
          </Link>
        )}
      </div>
    </Card>
  );
}
