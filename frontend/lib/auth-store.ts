import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth } from "./firebase";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** Whether the session was established via Firebase OAuth or the backend email endpoint. */
  authProvider: "firebase" | "email" | null;

  setAuth: (
    token: string,
    user: AuthUser,
    provider?: "firebase" | "email",
  ) => void;
  clearAuth: () => void;
  /** Returns a fresh Firebase ID token (auto-refreshed by Firebase SDK). Falls back to stored token. */
  getToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authProvider: null,

      setAuth: (token, user, provider = "firebase") =>
        set({ token, user, authProvider: provider }),

      clearAuth: () => set({ token: null, user: null, authProvider: null }),

      getToken: async () => {
        // Email/password users have no Firebase client session — return stored token directly
        if (get().authProvider === "email") return get().token;

        const currentUser = auth?.currentUser;
        if (currentUser) {
          try {
            // Firebase auto-refreshes when within 5 minutes of expiry
            return await currentUser.getIdToken();
          } catch {
            // Token refresh failed — clear auth state
            set({ token: null, user: null, authProvider: null });
            return null;
          }
        }
        // Fall back to stored token (e.g. SSR or immediately after page load)
        return get().token;
      },
    }),
    {
      name: "saral-auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        authProvider: state.authProvider,
      }),
    },
  ),
);
