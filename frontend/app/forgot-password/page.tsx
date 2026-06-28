"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AuthCardShell, {
  AuthCardInner,
} from "@/components/auth/auth-card-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";

const BASE_URL =
  process.env.NEXT_PUBLIC_GATEWAY ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

const INPUT_CLASS =
  "h-[50px] rounded-[13px] border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5 px-4 font-sans font-medium text-[14px] text-ink dark:text-white shadow-none focus-visible:ring-2 focus-visible:ring-saral-forest/30 focus-visible:border-saral-forest placeholder:text-ink-faint dark:placeholder:text-white/40";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/auth/email/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Always show success regardless of whether email exists (privacy best practice)
      // Only surface genuine server errors (5xx)
      if (res.status >= 500) {
        setError("Something went wrong on our end. Please try again shortly.");
        return;
      }

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error?.message ??
            data?.message ??
            "Too many attempts. Please try again later.",
        );
        return;
      }

      setSent(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCardShell>
      <AuthCardInner>
        {/* Logo row */}
        <div className="mb-6 flex items-center">
          <Image
            src="/light/Logo-Sqaure-light.svg"
            alt="Saral AI"
            width={32}
            height={32}
            className="block h-8 w-auto object-contain dark:hidden sm:hidden"
            priority
          />
          <Image
            src="/dark/Logo-Sqaure-dark.svg"
            alt="Saral AI"
            width={32}
            height={32}
            className="hidden h-8 w-auto object-contain dark:block sm:dark:hidden"
            priority
          />
          <Image
            src="/light/Logo-Full-light.svg"
            alt="Saral AI"
            width={120}
            height={32}
            className="hidden h-8 w-auto object-contain dark:hidden sm:block"
            priority
          />
          <Image
            src="/dark/Logo-Full-dark.svg"
            alt="Saral AI"
            width={120}
            height={32}
            className="hidden h-8 w-auto object-contain sm:dark:block"
            priority
          />
        </div>

        {sent ? (
          /* ── Success state ─────────────────────────────────────── */
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-saral-forest/10 dark:bg-saral-forest/20">
              <CheckCircle2 className="h-7 w-7 text-saral-forest" />
            </div>
            <h1 className="mb-2 font-sans text-[22px] font-extrabold text-ink dark:text-white">
              Check your inbox
            </h1>
            <p className="mb-6 font-sans text-[14px] text-[rgb(107,107,102)] dark:text-white/60">
              If{" "}
              <span className="font-semibold text-ink dark:text-white">
                {email}
              </span>{" "}
              is registered, a password-reset link is on its way. Check your
              spam folder if it doesn&apos;t arrive within a minute.
            </p>
            <Button
              type="button"
              onClick={() => router.replace("/login")}
              className="h-12 w-full cursor-pointer rounded-[13px] border-0 bg-saral-forest font-sans text-[15px] font-bold text-white transition-opacity hover:opacity-[0.88]"
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          /* ── Form state ────────────────────────────────────────── */
          <>
            <h1 className="mb-1.5 font-sans text-[24px] font-extrabold text-ink dark:text-white max-sm:text-[22px]">
              Reset your password
            </h1>
            <p className="mb-6 font-sans text-[14px] font-normal text-[rgb(107,107,102)] dark:text-white/60">
              Enter your email and we&apos;ll send a reset link.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-5">
                <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="you@university.edu"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className={INPUT_CLASS}
                />
              </div>

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loading || !email}
                className="mb-4 h-14 w-full cursor-pointer rounded-[15px] border-0 bg-saral-forest font-sans text-[16px] font-bold text-white transition-opacity hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link →"
                )}
              </Button>
            </form>

            <p className="m-0 text-center font-sans text-[13px] font-bold text-[rgb(130,128,122)] dark:text-white/60">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-saral-forest no-underline transition-opacity hover:opacity-80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </AuthCardInner>
    </AuthCardShell>
  );
}
