"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/auth-store";
import { logoutEverywhere } from "@/lib/logout";
import DashboardArtifactModals from "@/components/dashboard/dashboard-artifact-modals";
//import DisclaimerFooter from "@/components/disclaimer-footer";
/**
 * Dashboard layout — wraps all /dashboard/** pages.
 *
 * Responsibilities:
 *  1. Auth guard: redirects to /signup when unauthenticated.
 *  2. Listens to Firebase onAuthStateChanged for real-time token refresh.
 *  3. Shows a loading spinner while auth state is being resolved.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    // Track whether Firebase has ever reported an active user in this layout
    // instance. We only call logoutEverywhere() on a User→null *transition*,
    // never on the first fire when user is null (which is the normal state for
    // email/password backend users who have no Firebase client session).
    let hadFirebaseUser = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        hadFirebaseUser = true;
      } else if (hadFirebaseUser) {
        // A real Firebase session that was active just ended — wipe everything.
        void logoutEverywhere();
      }
      // If user is null and hadFirebaseUser is false, this is the first fire
      // with no Firebase session (email/password user) — do nothing.
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authReady && !token) {
      router.replace("/signup");
    }
  }, [authReady, token, router]);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-saral-warm-neutral dark:bg-saral-dark">
        <div
          className="w-8 h-8 rounded-full border-[3px] border-saral-forest/20 border-t-saral-forest"
          style={{ animation: "spin 0.75s linear infinite" }}
        />
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="min-h-screen bg-saral-warm-neutral dark:bg-saral-dark">
      <DashboardArtifactModals />
      {children}
      {/* <DisclaimerFooter /> */}
    </div>
  );
}
