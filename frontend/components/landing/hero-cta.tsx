"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

export default function HeroCTA() {
  const token = useAuthStore((s) => s.token);
  const href = token ? "/dashboard/papers" : "/login";

  return (
    <Link href={href}>
      <Button
        size="lg"
        className="
          bg-ink dark:bg-saral-forest text-white rounded-cta px-8 py-4 h-auto
          text-base font-bold
          hover:scale-[1.02] hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]
          hover:bg-ink dark:hover:bg-saral-forest/90 transition-all duration-200 cursor-pointer
        "
      >
        Start Converting <ArrowRight className="ml-1" size={18} />
      </Button>
    </Link>
  );
}
