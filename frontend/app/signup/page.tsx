"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import AuthShell from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { BASE_URL } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
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

export default function SignupPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Per-field and general error states
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // ── Live password rules ──────────────────────────────────────────────────────
  const emailLocalPart = email.split("@")[0] ?? "";
  const rules = useMemo(() => {
    const pw = password;
    const lp = emailLocalPart.toLowerCase();
    const emailRelevant = lp.length >= 4;
    const containsEmail =
      emailRelevant && pw.length > 0 && pw.toLowerCase().includes(lp);
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
        show: pw.length > 128, // only surfaced when actually violated
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
      {
        id: "no_email",
        label: "Not similar to your email",
        ok: !containsEmail,
        show: emailRelevant, // only shown once email has a meaningful local part
      },
    ];
  }, [password, emailLocalPart]);

  const passwordValid = rules.every((r) => r.ok);
  // Show checklist once touched and at least one rule is failing
  const showRequirements =
    passwordTouched && password.length > 0 && !passwordValid;

  const handlePasswordChange = (v: string) => {
    setPassword(v);
    setPasswordError(null); // clear any BE error when user edits
    if (!passwordTouched && v.length > 0) setPasswordTouched(true);
  };

  const handleEmailChange = (v: string) => {
    setEmail(v);
    setEmailError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setEmailError(null);
    setGeneralError(null);

    // Client-side gate — reveal checklist and bail before hitting the network
    if (!passwordValid) {
      setPasswordTouched(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/email/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        const code = data?.error?.code ?? data?.code;
        const message = data?.error?.message ?? data?.message;

        if (PASSWORD_CODES.has(code)) {
          // Show inline under the password field
          setPasswordError(message ?? "Invalid password.");
        } else if (code === "email_already_registered" || res.status === 409) {
          setEmailError("Account already exists — sign in instead.");
        } else if (code === "too_many_attempts" || res.status === 429) {
          setGeneralError("Too many attempts. Please try again later.");
        } else {
          setGeneralError(message ?? "Sign-up failed. Please try again.");
        }
        return;
      }

      const access_token = data.access_token ?? data.data?.access_token;
      const backendUser = data.user ?? data.data?.user;

      if (!access_token || !backendUser) {
        setGeneralError("Unexpected response from server. Please try again.");
        return;
      }

      setAuth(
        access_token,
        {
          id: backendUser.id ?? "",
          email: backendUser.email ?? email,
          name: backendUser.name ?? name,
          picture: backendUser.picture ?? "",
        },
        "email",
      );

      router.replace("/dashboard/papers");
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

  return (
    <AuthShell
      heading="Create your account"
      subheading="Start transforming your research"
      googleLoadingLabel="Signing up…"
      footer={{
        text: "Already have an account?",
        linkText: "Sign in",
        href: "/login",
      }}
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* Full name field */}
        <div className="mb-4.5">
          <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
            Full Name
          </label>
          <Input
            type="text"
            placeholder="Jane Doe"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
            disabled={loading}
          />
        </div>

        {/* Email field */}
        <div className="mb-4.5">
          <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
            Email
          </label>
          <Input
            type="email"
            placeholder="you@university.edu"
            autoComplete="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            required
            className={emailError ? INPUT_ERROR_CLASS : INPUT_CLASS}
            disabled={loading}
          />
          {emailError && (
            <p className="mt-1.5 font-sans text-[12px] text-red-500 dark:text-red-400">
              {emailError}{" "}
              <Link
                href="/login"
                className="font-bold underline underline-offset-2"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>

        {/* Password field */}
        <div className="mb-5">
          <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
            Password
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
              className={`${passwordInputClass} pr-11`}
              disabled={loading}
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

          {/* BE error (e.g. too_common — not detectable client-side) */}
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

        {/* Create account button */}
        <Button
          type="submit"
          disabled={
            loading ||
            !email ||
            !password ||
            password.length > 128 ||
            (passwordTouched && !passwordValid)
          }
          className="mb-5 h-14 w-full cursor-pointer rounded-[15px] border-0 bg-saral-forest font-sans text-[16px] font-bold text-white transition-opacity hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            "Create account →"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
