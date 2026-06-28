"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useMotionValue } from "motion/react";

/* ── Language nodes — two-ring radial layout around center ── */
const LANGUAGES = [
  // Inner ring — 10 slots (9 active, 1 reserved for Manipuri)
  // Spaced evenly by 36 degrees
  { label: "অসমীয়া", angle: 0, ring: 1 },
  { label: "बड़ो", angle: 36, ring: 1 },
  { label: "ગુજરાતી", angle: 72, ring: 1 },
  { label: "ಕನ್ನಡ", angle: 108, ring: 1 },
  { label: "मैथिली", angle: 144, ring: 1 },
  { label: "नेपाली", angle: 180, ring: 1 },
  { label: "মণিপুরী", angle: 216, ring: 1 }, // Manipuri properly aligned placeholder
  { label: "ଓଡ଼ିଆ", angle: 252, ring: 1 },
  { label: "संस्कृत", angle: 288, ring: 1 },
  { label: "తెలుగు", angle: 324, ring: 1 },

  // Outer ring — 10 languages
  // Spaced evenly by 36 degrees, offset by 18 degrees to sit between inner nodes
  { label: "বাংলা", angle: 18, ring: 2 },
  { label: "डोगरी", angle: 54, ring: 2 },
  { label: "हिन्दी", angle: 90, ring: 2 },
  { label: "कोंकणी", angle: 126, ring: 2 },
  { label: "മലയാളം", angle: 162, ring: 2 },
  { label: "मराठी", angle: 198, ring: 2 }, // Fixed from 190 to maintain the 36° offset
  { label: "ਪੰਜਾਬੀ", angle: 234, ring: 2 },
  { label: "संताली", angle: 270, ring: 2 },
  { label: "தமிழ்", angle: 306, ring: 2 },
  { label: "اردو", angle: 342, ring: 2 },
];

// Center position (percentage)
const CX = 50;
const CY = 50;
const INNER_RADIUS = 25; // % from center — inner ring
const OUTER_RADIUS = 41; // % from center — outer ring

function getNodePos(angle: number, ring: number = 1) {
  const rad = (angle * Math.PI) / 180;
  const r = ring === 1 ? INNER_RADIUS : OUTER_RADIUS;
  return {
    x: CX + r * Math.cos(rad),
    y: CY + r * Math.sin(rad),
  };
}

// Keep coordinate precision stable so server/client hydration matches exactly.
function formatCoord(value: number) {
  return value.toFixed(4);
}

function formatPercent(value: number) {
  return `${formatCoord(value)}%`;
}

/* ── Interactive Language Graph ── */
function LanguageGraph() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    // Container is forced SQUARE via aspect-square so the radial geometry
    // works at any width — at narrow widths it shrinks proportionally
    // instead of pills overlapping. Pill text + padding scale down at
    // smaller widths so 21 nodes fit without collisions at every size.
    <div className="relative w-full aspect-square max-w-160 mx-auto">
      {/* SVG lines layer */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {LANGUAGES.map((lang, i) => {
          const pos = getNodePos(lang.angle, lang.ring);
          const isActive = hoveredIdx === i || activeIdx === i;
          return (
            <motion.line
              key={`line-${i}`}
              x1={CX}
              y1={CY}
              x2={formatCoord(pos.x)}
              y2={formatCoord(pos.y)}
              stroke={
                isActive ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)"
              }
              strokeWidth={isActive ? "0.5" : "0.2"}
              strokeDasharray={isActive ? "none" : "1.2,1.2"}
              style={{ transition: "all 0.4s ease" }}
            />
          );
        })}
      </svg>

      {/* Center "English" node */}
      <motion.div
        className="absolute z-20"
        style={{
          left: `${CX}%`,
          top: `${CY}%`,
          x: "-50%",
          y: "-50%",
        }}
        animate={{ scale: hoveredIdx !== null ? 0.95 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <div className="bg-white dark:bg-carddarkbg! text-ink dark:text-white font-sans font-bold text-[14px] sm:text-[15px] md:text-base px-5 sm:px-7 md:px-8 py-2.5 sm:py-3 md:py-3.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] whitespace-nowrap select-none">
          English
        </div>
      </motion.div>

      {/* Language nodes */}
      {LANGUAGES.map((lang, i) => {
        const pos = getNodePos(lang.angle, lang.ring);
        const isActive = hoveredIdx === i || activeIdx === i;
        return (
          <motion.div
            key={i}
            className="absolute z-10 cursor-pointer select-none"
            style={{
              left: formatPercent(pos.x),
              top: formatPercent(pos.y),
              x: "-50%",
              y: "-50%",
            }}
            animate={{
              scale: isActive ? 1.15 : 1,
            }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => setActiveIdx(activeIdx === i ? null : i)}
          >
            <div
              className={`
                font-sans text-[10px] sm:text-[12px] md:text-[13px] lg:text-[15px]
                px-2 sm:px-3 md:px-4 lg:px-5
                py-1 sm:py-1.5 md:py-2 lg:py-2.5
                rounded-full whitespace-nowrap
                transition-all duration-300
                ${
                  isActive
                    ? "bg-white dark:bg-darkcardborder text-ink dark:text-white shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
                    : "bg-white/85 dark:bg-darkcardborder/80 text-ink dark:text-white/80 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-sm"
                }
              `}
            >
              {lang.label}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Geometric background placeholder ── */
function GeometricBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMinYMid slice"
    >
      <g stroke="rgba(255,255,255,0.06)" fill="none" strokeWidth="1">
        <polygon points="50,100 150,50 200,150 120,200" />
        <polygon points="80,200 180,180 220,280 100,300" />
        <polygon points="30,300 130,250 170,350 60,380" />
        <line x1="50" y1="100" x2="180" y2="180" />
        <line x1="150" y1="50" x2="220" y2="280" />
        <line x1="200" y1="150" x2="170" y2="350" />
        <line x1="120" y1="200" x2="100" y2="300" />
        <line x1="80" y1="200" x2="30" y2="300" />
        <polygon points="20,150 100,80 160,160 90,230" />
        <line x1="20" y1="150" x2="80" y2="200" />
        <line x1="100" y1="80" x2="150" y2="50" />
        <polygon points="60,350 140,320 180,420 80,450" />
        <line x1="60" y1="350" x2="30" y2="300" />
        <circle cx="150" cy="50" r="3" fill="rgba(255,255,255,0.08)" />
        <circle cx="80" cy="200" r="2" fill="rgba(255,255,255,0.06)" />
        <circle cx="170" cy="350" r="2" fill="rgba(255,255,255,0.06)" />
      </g>
    </svg>
  );
}

/* ── Main Section ── */
export default function LanguagesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start 0.15"],
  });

  // On mobile: no shrink (always 0). On desktop: shrink from 0.5→0.85.
  const insetX = useTransform(
    scrollYProgress,
    [0.5, 0.85],
    isMobile ? [0, 0] : [0, 40],
  );
  const insetY = useTransform(
    scrollYProgress,
    [0.5, 0.85],
    isMobile ? [0, 0] : [0, 24],
  );
  const borderRadius = useTransform(
    scrollYProgress,
    [0.5, 0.85],
    isMobile ? [0, 0] : [0, 24],
  );

  return (
    <div
      ref={sectionRef}
      className="relative w-screen -ml-[calc((100vw-100%)/2)] min-h-screen"
    >
      <motion.section
        style={{
          position: "absolute",
          top: insetY,
          bottom: insetY,
          left: insetX,
          right: insetX,
          borderRadius,
        }}
        className="bg-saral-forest overflow-hidden flex items-center"
      >
        {/* Geometric background placeholder */}
        <GeometricBg />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-12 py-20 max-lg:px-8 max-sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Left — Text */}
          <div>
            <h2 className="font-serif text-[60px] max-lg:text-[48px] max-sm:text-[36px] leading-[1.1] mb-6">
              <span className="text-white block">Research in</span>
              <span
                className="text-saral-gold italic"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, color-mix(in srgb, var(--color-saral-gold) 20%, transparent) 20%, transparent 20%)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                21 languages
              </span>
            </h2>
            <p className="text-white/70 text-[19px] max-sm:text-[16px] leading-[1.65] max-w-120 font-sans">
              Break barriers with summarization in 21 Indian Languages. Research
              speaks to everyone.
            </p>
          </div>

          {/* Right — Interactive Graph */}
          <LanguageGraph />
        </div>
      </motion.section>
    </div>
  );
}
