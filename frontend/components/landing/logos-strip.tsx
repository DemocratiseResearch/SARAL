import Image from "next/image";
import { instituteLogos } from "@/lib/institute-logos";

/**
 * Continuous right-to-left marquee of institution logos.
 * To add a new logo, add an entry to lib/institute-logos.ts.
 */
export default function LogosStrip() {
  // Quadruple for seamless loop on wide screens — animation moves -50% (2 sets)
  const looped = [
    ...instituteLogos,
    ...instituteLogos,
    ...instituteLogos,
    ...instituteLogos,
  ];

  return (
    <section className="px-0 pt-8 pb-16 max-sm:pb-10 overflow-x-hidden">
      <p className="text-center text-[14px] text-ink-faint mb-8 font-sans tracking-wide px-6">
        Trusted By Researchers From
      </p>

      {/* Marquee track — CSS mask fades edges without colour mismatch */}
      <div
        className="relative w-full overflow-x-hidden py-3"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      >
        <div
          className="flex items-center gap-16"
          style={{
            width: "max-content",
            animation: "marquee 12s linear infinite",
            willChange: "transform",
            transform: "translateZ(0)",
          }}
        >
          {looped.map((logo, i) => {
            const px = logo.size ?? 90;
            const smPx = Math.round(px * 0.75);
            return (
              <div
                key={`${logo.id}-${i}`}
                className="shrink-0 flex items-center justify-center"
                style={{ width: px, height: px }}
              >
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={px}
                  height={px}
                  className="object-contain rounded-xl hover:scale-110 transition-transform duration-300"
                  style={{ width: px, height: px }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
