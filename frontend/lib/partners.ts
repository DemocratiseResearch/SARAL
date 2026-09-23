// ── PARTNERS CONFIG ─────────────────────────────────────────────────
// Add/remove entries here. Place logo files in /public/assets/.
// ────────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  href?: string;
}

export const partners: Partner[] = [
  {
    id: "anrf",
    name: "Anusandhan National Research Foundation",
    src: "/assets/anrf.jpg",
    width: 1600,
    height: 772,
    href: "https://www.anrfonline.in/",
  },
  {
    id: "sarvam",
    name: "Sarvam",
    src: "/assets/sarvam_logo.jpeg",
    width: 200,
    height: 100,
    href: "https://www.sarvam.ai/",
  },
  {
    id: "google",
    name: "Google",
    src: "/assets/google.jpg",
    width: 1066,
    height: 600,
    href: "https://cloud.google.com/edu/researchers",
  },
];
