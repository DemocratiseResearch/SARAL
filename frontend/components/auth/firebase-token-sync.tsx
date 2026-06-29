"use client";

import { useEffect } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Keeps the persisted `saral-auth` localStorage entry in sync with Firebase's
 * auto-rotated ID token.
 *
 * Why this exists:
 *   The Firebase SDK silently rotates the ID token every ~hour. Internal site
 *   API calls don't notice because they always go through
 *   `useAuthStore.getToken()` → `currentUser.getIdToken()` (which is fresh).
 *   BUT the `token` field stored inside the Zustand persist envelope
 *   (localStorage key `saral-auth`) is set ONCE at login and never updated.
 *   That stale stored token is what the Chrome extension reads via its
 *   content script — so within an hour of login the extension's "Session
 *   expired" error starts firing despite the user being signed in on the
 *   website. This component closes that loop by re-calling setAuth() with
 *   the freshly rotated token on every onIdTokenChanged fire.
 *
 * Only relevant for Firebase-provider sessions. Email/password sessions
 * don't have a Firebase client session to rotate; their token is server-
 * issued and stable until the user re-logs in.
 */
export function FirebaseTokenSync() {
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) return; // sign-out is handled by onAuthStateChanged elsewhere
      try {
        const freshToken = await user.getIdToken();
        const storedUser = useAuthStore.getState().user;
        // Preserve the existing AuthUser shape (which carries backend `id`,
        // potentially different from Firebase's `uid`). Fall back to
        // Firebase profile fields only when the store is unexpectedly empty.
        setAuth(
          freshToken,
          storedUser ?? {
            id: user.uid,
            email: user.email ?? "",
            name: user.displayName ?? "",
            picture: user.photoURL ?? "",
          },
          "firebase",
        );
      } catch {
        // Refresh failed (network/revoked). Let onAuthStateChanged in the
        // dashboard layout decide whether to log the user out — don't
        // double-handle the same signal here.
      }
    });
    return () => unsubscribe();
  }, [setAuth]);

  return null;
}
