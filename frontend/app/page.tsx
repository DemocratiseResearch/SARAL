import Navbar from "@/components/landing/navbar";
import Hero from "@/components/landing/hero";
import LogosStrip from "@/components/landing/logos-strip";
import InTheNews from "@/components/landing/in-the-news";
import FeaturesGrid from "@/components/landing/features";
import LanguagesSection from "@/components/dashboard/languages-section";
import TestimonialsSection from "@/components/landing/testimonials-section";
import PartnersSection from "@/components/landing/partners-section";
import Footer from "@/components/landing/footer";
import ExtensionBanner from "@/components/landing/extension-banner";

export default function Home() {
  return (
    <>
      <ExtensionBanner />
      <main className="max-w-7xl mx-auto">
        <Navbar />
        <Hero />
        <LogosStrip />
        <InTheNews />
        <FeaturesGrid />
      </main>

      {/* Full-bleed section */}
      <LanguagesSection />

      <main className="max-w-7xl mx-auto">
        <TestimonialsSection />
        <PartnersSection />
        <Footer />
      </main>
    </>
  );
}
