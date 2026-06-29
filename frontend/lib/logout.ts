/**
 * logoutEverywhere — single source of truth for logout.
 *
 * Responsibilities:
 *  1. Sign out of Firebase (kills the refresh-token session in IndexedDB).
 *  2. Call the backend /auth/logout endpoint (best-effort).
 *  3. Reset all Zustand store state in memory.
 *  4. Clear every Zustand-persisted localStorage key so the next page load
 *     does not re-hydrate stale data from a previous user session.
 *
 * Why we need step 4 explicitly:
 *  Calling store.reset() writes the reset state back into localStorage via
 *  the persist middleware. clearStorage() then removes the key entirely,
 *  guaranteeing a clean slate even if the next visitor uses the same browser.
 */

import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { logout as apiLogout } from "./api";
import { useAuthStore } from "./auth-store";
import { usePaperStore } from "./paper-store";
import { useArtifactStore } from "./artifact-store";

export async function logoutEverywhere(): Promise<void> {
  // 1. Firebase sign-out — invalidates the refresh token in the browser's
  //    IndexedDB, so getIdToken() won't auto-refresh on the next load.
  if (auth) {
    try {
      await signOut(auth);
    } catch {
      // ignore — may already be signed out
    }
  }

  // 2. Backend session cookie / token revocation (best-effort).
  try {
    await apiLogout();
  } catch {
    // ignore — we still clear local state regardless
  }

  // 3. Reset in-memory store state.
  useArtifactStore.getState().reset();
  usePaperStore.getState().fullReset(); // wipes papers[] + active paper context
  useAuthStore.getState().clearAuth();

  // 4. Remove persisted localStorage keys so no stale data survives a reload.
  useArtifactStore.persist.clearStorage();
  usePaperStore.persist.clearStorage();
  useAuthStore.persist.clearStorage();
}
