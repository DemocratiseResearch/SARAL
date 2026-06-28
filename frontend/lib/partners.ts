// ── PARTNERS CONFIG ─────────────────────────────────────────────────
// Add/remove entries here. Place logo files in /public/assets/.
// ────────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;
  name: string;
  src: string;
  href?: string;
}

export const partners: Partner[] = [
  {
    id: "anrf",
    name: "Anusandhan National Research Foundation",
    src: "/assets/anrf.jpg",
    href: "https://www.anrfonline.in/",
  },
  {
    id: "sarvam",
    name: "Sarvam",
    src: "/assets/sarvam_logo.jpeg",
    href: "https://www.sarvam.ai/",
  },
  {
    id: "google",
    name: "Google",
    src: "/assets/google.jpg",
    href: "https://cloud.google.com/edu/researchers",
  },
];
