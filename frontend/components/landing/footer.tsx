import Link from "next/link";

const FOOTER_LINKS = [
  { label: "About", href: "/about" },
  { label: "Contact Us", href: "/about#contact" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

export default function Footer() {
  return (
    <footer className="px-6 py-10 border-t dark:border-darkcardborder border-pill-border">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-end gap-6 sm:gap-10">
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[14px] text-ink-muted hover:text-ink dark:text-white/80 transition-colors font-sans no-underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
