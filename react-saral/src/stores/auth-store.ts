import { create } from "zustand"
import {
  signInWithGoogle,
  signOut as fbSignOut,
  onAuthChange,
  type User,
} from "@/lib/firebase"
import { authApi } from "@/lib/api"

interface AuthState {
  user: User | null
  loading: boolean
  init: () => () => void
  login: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  init: () => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken()
        try {
          await authApi.googleLogin(token)
        } catch {
          // Backend may be unavailable during dev; continue anyway
        }
        set({ user: firebaseUser, loading: false })
      } else {
        set({ user: null, loading: false })
      }
    })
    return unsub
  },

  login: async () => {
    const firebaseUser = await signInWithGoogle()
    const token = await firebaseUser.getIdToken()
    await authApi.googleLogin(token)
    set({ user: firebaseUser })
  },

  logout: async () => {
    await fbSignOut()
    set({ user: null })
  },
}))
