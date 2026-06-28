import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Saral AI — our mission to democratise research by turning academic papers into accessible videos, podcasts, slides, and reels.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Saral AI",
    description:
      "Learn about Saral AI — our mission to democratise research by turning academic papers into accessible videos, podcasts, slides, and reels.",
    url: "/about",
  },
};

// Inline LinkedIn icon (lucide-react v1 doesn't export Linkedin)
function LinkedinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
import Navbar from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ── TEAM DATA ────────────────────────────────────────────────────────────────

interface TeamMember {
  name: string;
  role: string;
  img: string;
  linkedin?: string;
}

const stackTamers: TeamMember[] = [
  {
    name: "Arkaprava Gaine",
    role: "Developer",
    img: "/assets/arka.jpeg",
    linkedin: "https://www.linkedin.com/in/arkagme/",
  },
  {
    name: "Sahas Vivek",
    role: "Developer",
    img: "/assets/sahas.jpeg",
    linkedin: "https://www.linkedin.com/in/sahas-vivek-9217801a0/",
  },
  {
    name: "Bhoomika",
    role: "Developer",
    img: "/assets/bhoomika.jpeg",
    linkedin: "https://www.linkedin.com/in/bhoomikasingh7/",
  },
  {
    name: "Tejas Agarwal",
    role: "Developer",
    img: "/assets/tejas.jpg",
    linkedin: "https://www.linkedin.com/in/tejasag0/",
  },
  {
    name: "Samah Syed",
    role: "Developer",
    img: "/assets/samah.jpeg",
    linkedin: "https://www.linkedin.com/in/samah-syed/",
  },
  {
    name: "Siddhant Kaushik",
    role: "Developer",
    img: "/assets/siddanth.jpeg",
    linkedin: "https://www.linkedin.com/in/siddhantcookie/",
  },
];

const projectManagers: TeamMember[] = [
  {
    name: "Dr. Lakshmanan Nataraj",
    role: "Project Manager",
    img: "/assets/lakshmanan-nataraj.jpg",
    linkedin: "https://www.linkedin.com/in/lakshmanannataraj/",
  },
  {
    name: "Rahul Sundar",
    role: "Project Manager",
    img: "/assets/rahul-sundar.jpg",
    linkedin: "https://www.linkedin.com/in/rahul-sundar-311a6977/",
  },
];

const principalInvestigator: TeamMember[] = [
  {
    name: "Prof. Ponnurangam Kumaraguru",
    role: "Principal Investigator",
    img: "/assets/pk.jpg",
    linkedin: "https://www.linkedin.com/in/ponguru/",
  },
];

const pastDevelopers: TeamMember[] = [
  {
    name: "Imandi Sai Ganesh",
    role: "Developer",
    img: "/assets/sai-ganesh.jpg",
    linkedin: "https://www.linkedin.com/in/sai-ganesh-91505a261/",
  },
  {
    name: "Arihant Rastogi",
    role: "Developer",
    img: "/assets/arihant.jpg",
    linkedin: "https://www.linkedin.com/in/arihant-rastogi-7605942aa/",
  },
  {
    name: "Vishnu Sathwik",
    role: "Developer",
    img: "/assets/vishnu.jpg",
    linkedin: "https://www.linkedin.com/in/vishnu-sathwik-14117a257/",
  },
  {
    name: "Ram",
    role: "Developer",
    img: "/assets/ram.png",
    linkedin: "https://www.linkedin.com/in/ram-from-tvl/",
  },
  {
    name: "Akhila Sri Manasa Venigalla",
    role: "Technical Lead",
    img: "/assets/akhila.jpg",
    linkedin: "https://www.linkedin.com/in/akhila-sri-manasa7896/",
  },
  {
    name: "Meghana Tatavolu",
    role: "Developer",
    img: "/assets/meghana.jpg",
    linkedin: "https://www.linkedin.com/in/meghana-tatavolu/",
  },
  {
    name: "Sairam Bonu",
    role: "Developer",
    img: "/assets/sairam.jpg",
    linkedin: "https://www.linkedin.com/in/sairam-bonu-779804238/",
  },
];

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function MemberCard({ member }: { member: TeamMember }) {
  return (
    <Card className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-linen-dark dark:bg-carddarkbg dark:border-darkcardborder mb-4 shrink-0">
          <Image
            src={member.img}
            alt={member.name}
            width={80}
            height={80}
            className="w-full h-full object-cover"
          />
        </div>
        <p className="font-sans font-semibold text-[15px] text-ink dark:text-white mb-1 leading-snug">
          {member.name}
        </p>
        <p className="font-sans text-[13px] text-ink-muted dark:text-white/70 mb-4">
          {member.role}
        </p>
        {member.linkedin && (
          <Link
            href={member.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted dark:text-white/70 hover:text-ink dark:hover:text-white transition-colors"
          >
            <LinkedinIcon size={15} /> LinkedIn
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSection({
  title,
  members,
}: {
  title: string;
  members: TeamMember[];
}) {
  return (
    <div className="mb-14">
      <h3 className="font-serif text-[22px] text-ink dark:text-white font-bold text-center mb-8">
        {title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {members.map((m) => (
          <MemberCard key={m.name} member={m} />
        ))}
      </div>
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <>
      <main className="max-w-7xl mx-auto">
        <Navbar />

        <div className="px-6 pt-10 pb-4">
          <Button
            asChild
            variant="ghost"
            className="text-ink-muted hover:text-ink dark:text-white gap-1.5 px-0 h-auto font-normal"
          >
            <Link href="/">
              <ArrowLeft size={15} /> Back to home
            </Link>
          </Button>
        </div>

        <div className="max-w-5xl mx-auto px-6 pb-20">
          {/* Hero */}
          <section className="text-center py-14">
            <h1 className="font-serif text-[52px] max-lg:text-[38px] max-sm:text-[30px] text-ink dark:text-white font-bold leading-tight mb-5">
              About SARAL AI
            </h1>
            <p className="text-[17px] text-ink-muted dark:text-white/70 max-w-150 mx-auto leading-relaxed">
              We democratize research by making academic workflows smoother,
              faster, and more accessible — transforming complex papers into
              engaging educational artifacts.
            </p>
          </section>

          {/* Mission */}
          <Card className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder mb-16">
            <CardContent className="p-8">
              <h2 className="font-serif text-[26px] text-ink dark:text-white font-bold mb-4">
                Our Mission
              </h2>
              <p className="text-[16px] text-ink-muted dark:text-white/70 leading-relaxed">
                Research papers contain valuable insights that often remain
                locked behind technical jargon and complex formatting. Saral AI
                bridges this gap by automatically converting academic papers
                into accessible, engaging video presentations that reach broader
                audiences and facilitate better knowledge transfer.
              </p>
            </CardContent>
          </Card>

          {/* Team */}
          <section className="mb-14">
            <h2 className="font-serif text-[36px] max-sm:text-[28px] text-ink dark:text-white font-bold text-center mb-14">
              Our Team
            </h2>
            <TeamSection title="Stack Tamers" members={stackTamers} />
            <TeamSection title="Project Managers" members={projectManagers} />
            <TeamSection
              title="Principal Investigator"
              members={principalInvestigator}
            />
            <TeamSection title="Past Developers" members={pastDevelopers} />
          </section>

          {/* Contact */}
          <Card
            id="contact"
            className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder mb-8"
          >
            <CardContent className="p-8 text-center">
              <h2 className="font-serif text-[26px] text-ink dark:text-white font-bold mb-3">
                Get in Touch
              </h2>
              <p className="text-[16px] text-ink-muted dark:text-white/70 mb-7">
                Have questions about Saral AI or want to collaborate with us?
              </p>
              <Button
                asChild
                className="bg-ink text-white rounded-cta px-8 py-3 h-auto font-semibold hover:bg-[#333] transition-colors gap-2"
              >
                <Link href="mailto:pk.guru@iiit.ac.in">
                  <Mail size={16} /> Contact Us
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* LinkedIn */}
          <Card className="border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder">
            <CardContent className="p-8 text-center">
              <h2 className="font-serif text-[26px] text-ink dark:text-white font-bold mb-3">
                Connect With Us
              </h2>
              <p className="text-[16px] text-ink-muted dark:text-white/70 mb-7">
                Follow us on LinkedIn to stay updated with our latest
                developments.
              </p>
              <Button
                asChild
                className="bg-ink text-white rounded-cta px-8 py-3 h-auto font-semibold hover:bg-[#333] transition-colors gap-2"
              >
                <Link
                  href="https://www.linkedin.com/company/saralai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LinkedinIcon size={16} /> Follow on LinkedIn
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <main className="max-w-7xl mx-auto">
        <Footer />
      </main>
    </>
  );
}
