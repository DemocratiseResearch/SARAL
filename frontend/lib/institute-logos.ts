// ── INSTITUTE LOGOS CONFIG ──────────────────────────────────────────────────
// Add/remove entries here — the carousel will pick them up automatically.
// Place image files in /public/assets/.
// ───────────────────────────────────────────────────────────────────────────

export interface InstituteLogo {
  id: string;
  src: string;
  alt: string;
  /** Override rendered size in px (desktop). Default: 90. Use to visually equalise logos with different internal padding. */
  size?: number;
}

export const instituteLogos: InstituteLogo[] = [
  { id: "iit-bombay", src: "/assets/iit_bombay.png", alt: "IIT Bombay" },
  { id: "iit-roorkee", src: "/assets/iit_roorkee.png", alt: "IIT Roorkee" },
  { id: "iisc", src: "/assets/iisc.png", alt: "IISc Bangalore" },
  { id: "iit-madras", src: "/assets/iit_madras.png", alt: "IIT Madras" },
  {
    id: "uoh",
    src: "/assets/university-of-hyderabad.png",
    alt: "University of Hyderabad",
    size: 100,
  },
];
