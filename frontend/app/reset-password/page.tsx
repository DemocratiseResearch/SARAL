"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCardShell, {
  AuthCardInner,
} from "@/components/auth/auth-card-shell";
import { BASE_URL } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  XCircle,
} from "lucide-react";

const INPUT_CLASS =
  "h-[50px] rounded-[13px] border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5 px-4 font-sans font-medium text-[14px] text-ink dark:text-white shadow-none focus-visible:ring-2 focus-visible:ring-saral-forest/30 focus-visible:border-saral-forest placeholder:text-ink-faint dark:placeholder:text-white/40";

const INPUT_ERROR_CLASS =
  "h-[50px] rounded-[13px] border border-red-400 dark:border-red-500 bg-[#F2F1EE] dark:bg-white/5 px-4 font-sans font-medium text-[14px] text-ink dark:text-white shadow-none focus-visible:ring-2 focus-visible:ring-red-400/30 focus-visible:border-red-400 placeholder:text-ink-faint dark:placeholder:text-white/40";

const PASSWORD_CODES = new Set([
  "password_too_short",
  "password_too_long",
  "password_too_common",
  "password_contains_email",
  "password_repeated_chars",
  "password_no_letter",
  "password_no_digit_or_symbol",
]);

// ── Shared logo row ───────────────────────────────────────────────────────────
function LogoRow() {
  return (
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
  );
}

// ── Inner content (needs useSearchParams — must be inside Suspense) ───────────
function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // page-level state after submit
  type PageState = "form" | "expired" | "invalid" | "success";
  const [pageState, setPageState] = useState<PageState>("form");
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  // ── Live password rules (same as signup, without email-similarity check) ──
  const rules = useMemo(() => {
    const pw = password;
    return [
      {
        id: "length",
        label: "At least 8 characters",
        ok: pw.length >= 8,
        show: true,
      },
      {
        id: "max_length",
        label: "Under 128 characters",
        ok: pw.length <= 128,
        show: pw.length > 128,
      },
      {
        id: "letter",
        label: "At least one letter",
        ok: pw.length === 0 || /[a-zA-Z]/.test(pw),
        show: true,
      },
      {
        id: "digit_symbol",
        label: "At least one digit or symbol",
        ok: pw.length === 0 || /[^a-zA-Z\s]/.test(pw),
        show: true,
      },
      {
        id: "no_repeat",
        label: "No 4+ identical characters in a row",
        ok: pw.length === 0 || !/(.)\1{3,}/.test(pw),
        show: true,
      },
    ];
  }, [password]);

  const passwordValid = rules.every((r) => r.ok);
  const showRequirements =
    passwordTouched && password.length > 0 && !passwordValid;

  const handlePasswordChange = (v: string) => {
    setPassword(v);
    setPasswordError(null);
    if (!passwordTouched && v.length > 0) setPasswordTouched(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setGeneralError(null);

    if (!passwordValid) {
      setPasswordTouched(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/email/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oob_code: oobCode, new_password: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const code = data?.error?.code ?? data?.code;
        const message = data?.error?.message ?? data?.message;

        if (code === "reset_link_expired") {
          setPageState("expired");
        } else if (code === "reset_link_invalid") {
          setPageState("invalid");
        } else if (PASSWORD_CODES.has(code)) {
          setPasswordError(message ?? "Invalid password.");
        } else if (code === "too_many_attempts" || res.status === 429) {
          setGeneralError("Too many attempts. Please try again later.");
        } else {
          setGeneralError(message ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Success — response includes the email to prefill sign-in
      const email = data.email ?? data.data?.email ?? null;
      setSuccessEmail(email);
      setPageState("success");
    } catch {
      setGeneralError(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordInputClass =
    passwordError || (passwordTouched && !passwordValid)
      ? INPUT_ERROR_CLASS
      : INPUT_CLASS;

  // ── No oobCode in URL ─────────────────────────────────────────────────────
  if (!oobCode) {
    return (
      <AuthCardShell>
        <AuthCardInner>
          <LogoRow />
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="mb-2 font-sans text-[22px] font-extrabold text-ink dark:text-white">
              Invalid reset link
            </h1>
            <p className="mb-6 font-sans text-[14px] text-[rgb(107,107,102)] dark:text-white/60">
              This password-reset link is missing required parameters. It may
              have been copied incorrectly.
            </p>
            <Link
              href="/forgot-password"
              className="mb-3 inline-flex h-12 w-full items-center justify-center rounded-[13px] border-0 bg-saral-forest font-sans text-[15px] font-bold text-white no-underline transition-opacity hover:opacity-[0.88]"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-sans text-[13px] font-bold text-saral-forest no-underline transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </AuthCardInner>
      </AuthCardShell>
    );
  }

  // ── Expired state ─────────────────────────────────────────────────────────
  if (pageState === "expired") {
    return (
      <AuthCardShell>
        <AuthCardInner>
          <LogoRow />
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
              <Clock className="h-7 w-7 text-amber-500" />
            </div>
            <h1 className="mb-2 font-sans text-[22px] font-extrabold text-ink dark:text-white">
              Link expired
            </h1>
            <p className="mb-6 font-sans text-[14px] text-[rgb(107,107,102)] dark:text-white/60">
              Password-reset links expire after a short time for security.
              Request a fresh one and use it within the next few minutes.
            </p>
            <Link
              href="/forgot-password"
              className="mb-3 inline-flex h-12 w-full items-center justify-center rounded-[13px] border-0 bg-saral-forest font-sans text-[15px] font-bold text-white no-underline transition-opacity hover:opacity-[0.88]"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-sans text-[13px] font-bold text-saral-forest no-underline transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </AuthCardInner>
      </AuthCardShell>
    );
  }

  // ── Invalid / used state ──────────────────────────────────────────────────
  if (pageState === "invalid") {
    return (
      <AuthCardShell>
        <AuthCardInner>
          <LogoRow />
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="mb-2 font-sans text-[22px] font-extrabold text-ink dark:text-white">
              Link already used
            </h1>
            <p className="mb-6 font-sans text-[14px] text-[rgb(107,107,102)] dark:text-white/60">
              This reset link has already been used or is invalid. Each link can
              only be used once.
            </p>
            <Link
              href="/forgot-password"
              className="mb-3 inline-flex h-12 w-full items-center justify-center rounded-[13px] border-0 bg-saral-forest font-sans text-[15px] font-bold text-white no-underline transition-opacity hover:opacity-[0.88]"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-sans text-[13px] font-bold text-saral-forest no-underline transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </AuthCardInner>
      </AuthCardShell>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <AuthCardShell>
        <AuthCardInner>
          <LogoRow />
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-saral-forest/10 dark:bg-saral-forest/20">
              <CheckCircle2 className="h-7 w-7 text-saral-forest" />
            </div>
            <h1 className="mb-2 font-sans text-[22px] font-extrabold text-ink dark:text-white">
              Password updated
            </h1>
            <p className="mb-6 font-sans text-[14px] text-[rgb(107,107,102)] dark:text-white/60">
              Your password has been reset successfully.
              {successEmail && (
                <>
                  {" "}
                  Sign in as{" "}
                  <span className="font-semibold text-ink dark:text-white">
                    {successEmail}
                  </span>
                  .
                </>
              )}
            </p>
            <Button
              type="button"
              onClick={() =>
                router.replace(
                  successEmail
                    ? `/login?email=${encodeURIComponent(successEmail)}`
                    : "/login",
                )
              }
              className="h-12 w-full cursor-pointer rounded-[13px] border-0 bg-saral-forest font-sans text-[15px] font-bold text-white transition-opacity hover:opacity-[0.88]"
            >
              Sign in now
            </Button>
          </div>
        </AuthCardInner>
      </AuthCardShell>
    );
  }

  // ── Form state ────────────────────────────────────────────────────────────
  return (
    <AuthCardShell>
      <AuthCardInner>
        <LogoRow />

        <h1 className="mb-1.5 font-sans text-[24px] font-extrabold text-ink dark:text-white max-sm:text-[22px]">
          Set a new password
        </h1>
        <p className="mb-6 font-sans text-[14px] font-normal text-[rgb(107,107,102)] dark:text-white/60">
          Choose a strong password for your account.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-5">
            <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
              New Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={() => password.length > 0 && setPasswordTouched(true)}
                required
                disabled={loading}
                className={`${passwordInputClass} pr-11`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 text-ink-faint hover:bg-transparent hover:text-ink dark:text-white/40 dark:hover:bg-transparent dark:hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* BE password quality error (e.g. too_common) */}
            {passwordError ? (
              <p className="mt-1.5 font-sans text-[12px] text-red-500 dark:text-red-400">
                {passwordError}
              </p>
            ) : showRequirements ? (
              /* Live requirements checklist */
              <ul className="mt-2 space-y-1">
                {rules
                  .filter((r) => r.show)
                  .map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center gap-1.5 font-sans text-[12px]"
                    >
                      {rule.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-saral-forest" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      )}
                      <span
                        className={
                          rule.ok
                            ? "text-saral-forest"
                            : "text-red-500 dark:text-red-400"
                        }
                      >
                        {rule.label}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>

          {/* General error (rate-limit, network, etc.) */}
          {generalError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {generalError}
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={
              loading ||
              !password ||
              password.length > 128 ||
              (passwordTouched && !passwordValid)
            }
            className="mb-4 h-14 w-full cursor-pointer rounded-[15px] border-0 bg-saral-forest font-sans text-[16px] font-bold text-white transition-opacity hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating password…
              </>
            ) : (
              "Update password →"
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
      </AuthCardInner>
    </AuthCardShell>
  );
}

// ── Page export — Suspense required by Next.js for useSearchParams ────────────
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-saral-warm-neutral dark:bg-saral-dark">
          <div
            className="h-8 w-8 rounded-full border-[3px] border-saral-forest/20 border-t-saral-forest"
            style={{ animation: "spin 0.75s linear infinite" }}
          />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
