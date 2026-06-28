"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

const REDIRECT_DELAY = 5000; // ms before auto-redirect to home

export default function NotFound() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY / 1000);

  useEffect(() => {
    const redirect = setTimeout(() => router.push("/"), REDIRECT_DELAY);
    const tick = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => {
      clearTimeout(redirect);
      clearInterval(tick);
    };
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center bg-saral-warm-neutral dark:bg-saral-dark">
      {/* SARAL full logo — light / dark swap */}
      <Link href="/" className="cursor-pointer">
        <Image
          src="/light/Logo-Full-light.svg"
          alt="Saral AI"
          width={200}
          height={100}
          className="block dark:hidden h-16 w-auto object-contain"
          priority
        />
        <Image
          src="/dark/Logo-Full-dark.svg"
          alt="Saral AI"
          width={200}
          height={100}
          className="hidden dark:block h-16 w-auto object-contain"
          priority
        />
      </Link>

      <p className="text-[72px] max-sm:text-[52px] font-semibold leading-none text-saral-forest dark:text-white">
        404
      </p>

      <div className="flex flex-col gap-3 max-w-xl">
        <h1 className="text-[24px] max-sm:text-[20px] font-semibold text-ink dark:text-white">
          This page doesn&apos;t exist
        </h1>
        <p className="text-[16px] max-sm:text-[14px] text-ink-muted dark:text-white/70">
          Redirecting you to the home page in{" "}
          <span className="font-semibold text-saral-forest dark:text-white">
            {secondsLeft}
          </span>{" "}
          second{secondsLeft === 1 ? "" : "s"}…
        </p>
      </div>

      <Button
        asChild
        className="px-8 py-6 rounded-cta font-sans font-semibold text-base max-sm:text-[14px] cursor-pointer transition-all bg-saral-forest hover:bg-[#3d4b45] text-white"
      >
        <Link href="/">Go to home now</Link>
      </Button>
    </main>
  );
}
