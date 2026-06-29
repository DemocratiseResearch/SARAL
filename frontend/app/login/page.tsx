"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  type AuthProvider,
  type AuthError,
  type OAuthCredential,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GoogleIcon,
  GitHubIcon,
  MicrosoftIcon,
  ZohoIcon,
} from "@/components/auth/auth-icons";
import AuthCardShell, {
  AuthCardInner,
} from "@/components/auth/auth-card-shell";
import {
  Loader2,
  Info,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";

const BASE_URL =
  process.env.NEXT_PUBLIC_GATEWAY ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080";

// ── Provider instances (unchanged) ─────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
const microsoftProvider = new OAuthProvider("microsoft.com");
const zohoProvider = new OAuthProvider("oidc.zoho");

type ProviderConfig = {
  id: string;
  label: string;
  provider: AuthProvider;
  icon: React.ReactNode;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "google",
    label: "Continue with Google",
    provider: googleProvider,
    icon: <GoogleIcon />,
  },
  {
    id: "github",
    label: "Continue with GitHub",
    provider: githubProvider,
    icon: <GitHubIcon />,
  },
  {
    id: "microsoft",
    label: "Continue with Microsoft",
    provider: microsoftProvider,
    icon: <MicrosoftIcon />,
  },
  {
    id: "zoho",
    label: "Continue with Zoho",
    provider: zohoProvider,
    icon: <ZohoIcon />,
  },
];

const OAUTH_BUTTON_CLASS =
  "flex h-12 w-full min-w-0 items-center cursor-pointer justify-center gap-2 rounded-[13px] border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-white dark:bg-white/5 px-1.5 font-sans text-[12px] font-bold text-ink dark:text-white transition-colors hover:bg-[#F2F1EE] dark:hover:bg-white/10 sm:px-2 sm:text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

const INPUT_CLASS =
  "h-[50px] rounded-[13px] border border-[rgba(209,207,201,0.9)] dark:border-darkcardborder bg-[#F2F1EE] dark:bg-white/5 px-4 font-sans font-medium text-[14px] text-ink dark:text-white shadow-none focus-visible:ring-2 focus-visible:ring-saral-forest/30 focus-visible:border-saral-forest placeholder:text-ink-faint dark:placeholder:text-white/40";

// ── Page ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [linkingMsg, setLinkingMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email / password sign-in state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Pre-fill email + show success banner when redirected from /reset-password
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
      setResetSuccess(decodeURIComponent(emailParam));
    }
  }, []);

  const providerMap: Record<string, AuthProvider> = {
    "google.com": googleProvider,
    "github.com": githubProvider,
    "microsoft.com": microsoftProvider,
    "oidc.zoho": zohoProvider,
  };

  const finishLogin = async (user: import("firebase/auth").User) => {
    const token = await user.getIdToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    if (!res.ok) throw new Error("Authentication failed. Please try again.");
    const data = await res.json();
    const backendUser = data.data?.user ?? data.user;
    setAuth(token, {
      id: backendUser?.id ?? user.uid,
      email: backendUser?.email ?? user.email ?? "",
      name: backendUser?.name ?? user.displayName ?? "",
      picture: backendUser?.picture ?? user.photoURL ?? "",
    });
    router.replace("/dashboard/papers");
  };

  const handleSignIn = async (config: ProviderConfig) => {
    if (!auth) {
      setError(
        "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* environment variables and restart the dev server.",
      );
      return;
    }
    setLoadingId(config.id);
    setLinkingMsg(null);
    setError(null);

    try {
      const result = await signInWithPopup(auth, config.provider);
      await finishLogin(result.user);
    } catch (err: unknown) {
      const authErr = err as AuthError;

      if (authErr.code === "auth/popup-closed-by-user") {
        setLoadingId(null);
        return;
      }

      if (authErr.code === "auth/account-exists-with-different-credential") {
        const pendingCredential =
          (OAuthProvider.credentialFromError(
            authErr,
          ) as OAuthCredential | null) ??
          GithubAuthProvider.credentialFromError(authErr) ??
          GoogleAuthProvider.credentialFromError(authErr);

        const email = authErr.customData?.email as string | undefined;

        if (!email || !pendingCredential) {
          setError(
            "Account conflict detected but could not resolve automatically. Please sign in with your original provider.",
          );
          setLoadingId(null);
          return;
        }

        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          const existingProviderId = methods[0];
          const existingProvider = existingProviderId
            ? providerMap[existingProviderId]
            : undefined;

          if (!existingProviderId || !existingProvider) {
            setError(
              "This email is already registered with a different sign-in method. " +
                "Try Google, GitHub, or Microsoft — whichever you used first.",
            );
            setLoadingId(null);
            return;
          }

          const providerLabel =
            PROVIDERS.find(
              (p) => p.id === existingProviderId.replace(".com", ""),
            )?.label ?? existingProviderId;
          setLinkingMsg(
            `This email already has an account. Sign in with ${providerLabel} to link both providers.`,
          );

          const existingResult = await signInWithPopup(auth, existingProvider);

          await linkWithCredential(existingResult.user, pendingCredential);

          setLinkingMsg(null);
          await finishLogin(existingResult.user);
        } catch (linkErr: unknown) {
          const le = linkErr as AuthError;
          if (le.code === "auth/popup-closed-by-user") {
            setLinkingMsg(null);
            setLoadingId(null);
            return;
          }
          setLinkingMsg(null);
          setError("Could not link accounts. Please try again.");
        }

        setLoadingId(null);
        return;
      }

      setError(authErr.message ?? "Sign-in failed.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/auth/email/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const code = data?.error?.code ?? data?.code;
        if (
          res.status === 401 ||
          code === "invalid_password" ||
          code === "email_not_found"
        ) {
          setEmailError("Invalid email or password.");
        } else if (res.status === 429 || code === "too_many_attempts") {
          setEmailError("Too many attempts. Please try again later.");
        } else {
          setEmailError(
            data?.error?.message ??
              data?.message ??
              "Sign-in failed. Please try again.",
          );
        }
        return;
      }

      const access_token = data.access_token ?? data.data?.access_token;
      const backendUser = data.user ?? data.data?.user;

      if (!access_token || !backendUser) {
        setEmailError("Unexpected response from server. Please try again.");
        return;
      }

      setAuth(
        access_token,
        {
          id: backendUser.id ?? "",
          email: backendUser.email ?? email,
          name: backendUser.name ?? "",
          picture: backendUser.picture ?? "",
        },
        "email",
      );

      router.replace("/dashboard/papers");
    } catch {
      setEmailError(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setEmailLoading(false);
    }
  };

  const isAnyLoading = loadingId !== null || emailLoading;

  return (
    <>
      <Link
        href="/"
        className="fixed top-4 left-4 sm:top-6 sm:left-6 z-50 inline-flex items-center gap-1.5 font-sans text-[13px] font-medium text-ink-muted dark:text-white/60 no-underline transition-opacity hover:opacity-70"
      >
        ← Back to home
      </Link>
      <AuthCardShell>
        <AuthCardInner>
          <div className="mb-6 flex items-center">
            <Image
              src="/light/Logo-Sqaure-light.svg"
              alt="Saral AI"
              width={32}
              height={32}
              className="block sm:hidden dark:hidden h-8 w-auto object-contain"
              priority
            />
            <Image
              src="/dark/Logo-Sqaure-dark.svg"
              alt="Saral AI"
              width={32}
              height={32}
              className="hidden dark:block sm:dark:hidden h-8 w-auto object-contain"
              priority
            />
            <Image
              src="/light/Logo-Full-light.svg"
              alt="Saral AI"
              width={120}
              height={32}
              className="hidden sm:block dark:hidden h-8 w-auto object-contain"
              priority
            />
            <Image
              src="/dark/Logo-Full-dark.svg"
              alt="Saral AI"
              width={120}
              height={32}
              className="hidden sm:dark:block h-8 w-auto object-contain"
              priority
            />
          </div>

          <h1 className="mb-1.5 font-sans text-[24px] font-extrabold text-ink dark:text-white max-sm:text-[22px]">
            Welcome back
          </h1>
          <p className="mb-6 font-sans text-[14px] font-normal text-[rgb(107,107,102)] dark:text-white/60">
            Sign in to your research workspace
          </p>

          <div className="mb-6 grid max-sm:grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PROVIDERS.map((config, index) => {
              const isLoading = loadingId === config.id;
              return (
                <Fragment key={config.id}>
                  {index === 2 && (
                    <div
                      className="col-span-full my-0.5 h-px bg-[rgba(0,0,0,0.08)] dark:bg-white/10"
                      role="separator"
                      aria-hidden="true"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className={OAUTH_BUTTON_CLASS}
                    onClick={() => handleSignIn(config)}
                    disabled={isAnyLoading || !isFirebaseConfigured}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      config.icon
                    )}
                    <span className="min-w-0 text-center leading-tight">
                      {isLoading ? "Signing in…" : config.label}
                    </span>
                  </Button>
                </Fragment>
              );
            })}
          </div>

          {linkingMsg && (
            <Alert className="mb-3 border-saral-forest/20 bg-saral-forest/5">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {linkingMsg}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {!isFirebaseConfigured && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Firebase is not configured for this environment.
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-6 flex items-center gap-3.5">
            <div className="h-px flex-1 bg-[rgba(0,0,0,0.1)] dark:bg-white/10" />
            <span className="select-none font-sans text-[12px] font-bold text-[rgb(158,158,153)] dark:text-white/50">
              or
            </span>
            <div className="h-px flex-1 bg-[rgba(0,0,0,0.1)] dark:bg-white/10" />
          </div>

          <form onSubmit={handleEmailSignIn} noValidate>
            {resetSuccess && (
              <Alert className="mb-4 border-saral-forest/30 bg-saral-forest/10 dark:bg-saral-forest/15">
                <CheckCircle2 className="h-4 w-4 text-saral-forest" />
                <AlertDescription className="text-xs font-medium text-saral-forest dark:text-saral-forest">
                  Password updated — sign in as{" "}
                  <span className="font-semibold">{resetSuccess}</span>
                </AlertDescription>
              </Alert>
            )}
            <div className="mb-4">
              <label className="mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
                Email
              </label>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isAnyLoading}
                className={INPUT_CLASS}
              />
            </div>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="font-sans text-[11px] font-bold uppercase tracking-[0.05em] text-ink dark:text-white">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="font-sans text-[12px] font-bold text-saral-forest no-underline transition-opacity hover:opacity-80"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isAnyLoading}
                  className={`${INPUT_CLASS} pr-11`}
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
            </div>

            {emailError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {emailError}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={isAnyLoading || !email || !password}
              className="mb-5 h-14 w-full cursor-pointer rounded-[15px] border-0 bg-saral-forest font-sans text-[16px] font-bold text-white transition-opacity hover:opacity-[0.88] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in →"
              )}
            </Button>
          </form>

          <p className="m-0 text-center font-sans text-[13px] font-bold text-[rgb(130,128,122)] dark:text-white/60">
            No account?{" "}
            <Link
              href="/signup"
              className="text-saral-forest no-underline transition-opacity hover:opacity-80"
            >
              Sign up free
            </Link>
          </p>
        </AuthCardInner>
      </AuthCardShell>
    </>
  );
}
