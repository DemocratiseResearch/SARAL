import Image from "next/image";
import { partners } from "@/lib/partners";
import Link from "next/link";

export default function PartnersSection() {
  return (
    <section className="px-6 py-20 max-sm:py-14">
      <h2 className="font-serif text-[36px] max-sm:text-[26px] text-ink dark:text-white font-bold text-center mb-14">
        Partners
      </h2>

      <div className="flex flex-wrap justify-center items-center gap-20 max-md:gap-14 max-sm:gap-10 max-w-4xl mx-auto">
        {partners.map((partner) =>
          partner.src ? (
            <Link
              key={partner.id}
              href={partner.href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-3 group"
            >
              <div className="rounded-2xl dark:bg-white/[0.06] dark:ring-1 dark:ring-white/10 dark:p-3 transition-colors">
                <Image
                  src={partner.src}
                  alt={partner.name}
                  width={240}
                  height={96}
                  className="
                    h-24 max-md:h-20 max-sm:h-16 w-auto max-w-60 max-sm:max-w-40 object-contain
                    group-hover:scale-110
                    transition-transform duration-300
                  "
                />
              </div>
              <span className="text-[13px] text-ink-faint font-sans text-center max-w-50">
                {partner.name}
              </span>
            </Link>
          ) : (
            <div
              key={partner.id}
              className="
                h-16 px-8 shrink-0
                border-2 border-dashed border-[#cccccc] rounded-lg
                flex items-center justify-center
                text-[13px] text-[#999999] font-sans select-none
                min-w-40
              "
            >
              {partner.name}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
