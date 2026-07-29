"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useAuthStore } from "@/lib/auth-store";
import { BASE_URL } from "@/lib/api/client";
import {
  GoogleIcon,
  MicrosoftIcon,
  GitHubIcon,
  ZohoIcon,
} from "@/components/auth/auth-icons";
import { Button } from "../ui/button";
import AuthCardShell, { AuthCardInner } from "./auth-card-shell";

const provider = new GoogleAuthProvider();

interface AuthShellProps {
  /** "Welcome back" / "Create your account" */
  heading: string;
  /** "Sign in to your workspace" / "Start transforming your research" */
  subheading: string;
  /** Google button loading label — "Signing in…" / "Signing up…" */
  googleLoadingLabel?: string;
  /** Form fields + submit button rendered between the divider and the footer */
  children: ReactNode;
  /** Footer link — e.g. { text: "No account?", linkText: "Sign up free", href: "/signup" } */
  footer: { text: string; linkText: string; href: string };
}

/**
 * Shared auth page shell used by both `/login` and `/signup`.
 *
 * Renders: AuthCardShell → card → logo row → heading/subheading →
 *          OAuth stack → "or" divider → {children} → error display → footer link
 */
export default function AuthShell({
  heading,
  subheading,
  googleLoadingLabel = "Signing in…",
  children,
  footer,
}: AuthShellProps) {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error(
          "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* environment variables and restart the dev server.",
        );
      }
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      const res = await fetch(
        `${BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );

      if (!res.ok) {
        throw new Error("Authentication failed. Please try again.");
      }

      const data = await res.json();
      const backendUser = data.data?.user ?? data.user;

      setAuth(token, {
        id: backendUser?.id ?? result.user.uid,
        email: backendUser?.email ?? result.user.email ?? "",
        name: backendUser?.name ?? result.user.displayName ?? "",
        picture: backendUser?.picture ?? result.user.photoURL ?? "",
      });

      router.replace("/dashboard/papers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setLoading(false);
    }
  };

  const handleOAuthStub = () => {
    router.push("/dashboard/papers");
  };

  const oAuthButtonClass =
    "flex h-12 w-full min-w-0 items-center cursor-pointer justify-center gap-2 rounded-[13px] border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-white dark:bg-white/5 px-1.5 font-sans text-[12px] font-bold text-ink dark:text-white transition-colors hover:bg-[#F2F1EE] dark:hover:bg-white/10 sm:px-2 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

  const OAuthButton = ({
    label,
    icon,
    onClick,
    disabled,
  }: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={oAuthButtonClass}
    >
      {icon}
      <span className="min-w-0 text-center leading-tight">{label}</span>
    </Button>
  );

  return (
    <AuthCardShell>
      <AuthCardInner>
        {/* Logo row */}
        <div className="flex items-center mb-6">
          <Image src="/light/Logo-Sqaure-light.svg" alt="Saral AI" width={32} height={32} className="block sm:hidden dark:hidden h-8 w-auto object-contain" priority />
          <Image src="/dark/Logo-Sqaure-dark.svg" alt="Saral AI" width={32} height={32} className="hidden dark:block sm:dark:hidden h-8 w-auto object-contain" priority />
          <Image src="/light/Logo-Full-light.svg" alt="Saral AI" width={120} height={32} className="hidden sm:block dark:hidden h-8 w-auto object-contain" priority />
          <Image src="/dark/Logo-Full-dark.svg" alt="Saral AI" width={120} height={32} className="hidden sm:dark:block h-8 w-auto object-contain" priority />
        </div>

        {/* Heading */}
        <h1 className="font-sans font-extrabold text-[24px] max-sm:text-[22px] text-ink dark:text-white mb-1.5">
          {heading}
        </h1>

        {/* Subheading */}
        <p className="font-sans font-normal text-[14px] text-[rgb(107,107,102)] dark:text-white/60 mb-6">
          {subheading}
        </p>

        {/* OAuth — single column on mobile, 2×2 grid on sm+ */}
        <div className="mb-6 grid max-sm:grid-cols-1 sm:grid-cols-2 gap-2.5">
          <OAuthButton
            label={loading ? googleLoadingLabel : "Continue with Google"}
            icon={<GoogleIcon />}
            onClick={handleGoogleSignIn}
            disabled={loading || !isFirebaseConfigured}
          />
          <OAuthButton
            label="Continue with GitHub"
            icon={<GitHubIcon />}
            onClick={handleOAuthStub}
            disabled={loading}
          />
          <div
            className="max-sm:col-span-1 sm:col-span-2 my-0.5 h-px bg-[rgba(0,0,0,0.08)] dark:bg-white/10"
            role="separator"
            aria-hidden="true"
          />
          <OAuthButton
            label="Continue with Microsoft"
            icon={<MicrosoftIcon />}
            onClick={handleOAuthStub}
            disabled={loading}
          />
          <OAuthButton
            label="Continue with Zoho"
            icon={<ZohoIcon />}
            onClick={handleOAuthStub}
            disabled={loading}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="h-px flex-1 bg-[rgba(0,0,0,0.1)] dark:bg-white/10" />
          <span className="select-none font-sans font-bold text-[12px] text-[rgb(158,158,153)] dark:text-white/50">
            or
          </span>
          <div className="h-px flex-1 bg-[rgba(0,0,0,0.1)] dark:bg-white/10" />
        </div>

        {/* Page-specific form fields + submit button */}
        {children}

        {/* Error messages */}
        {error && (
          <p className="mb-3 text-center font-sans text-[13px] text-red-500">
            {error}
          </p>
        )}

        {!isFirebaseConfigured && (
          <p className="mb-3 text-center font-sans text-[12px] text-red-500">
            Firebase is not configured for this environment.
          </p>
        )}

        {/* Footer link */}
        <p className="m-0 text-center font-sans font-bold text-[13px] text-[rgb(130,128,122)] dark:text-white/60">
          {footer.text}{" "}
          <Link
            href={footer.href}
            className="text-saral-forest no-underline transition-opacity hover:opacity-80"
          >
            {footer.linkText}
          </Link>
        </p>
      </AuthCardInner>
    </AuthCardShell>
  );
}
