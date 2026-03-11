import { create } from "zustand"

type Theme = "light" | "dark" | "system"

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const isBrowser = typeof window !== "undefined"

function getStoredTheme(): Theme {
  if (!isBrowser) return "system"
  return (localStorage.getItem("theme") as Theme) ?? "system"
}

function applyTheme(theme: Theme) {
  if (!isBrowser) return
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  document.documentElement.classList.toggle("dark", isDark)
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    if (isBrowser) localStorage.setItem("theme", theme)
    applyTheme(theme)
    set({ theme })
  },
}))

/** Call once at app startup (e.g. in RootComponent) to apply the saved
 *  theme and listen for OS preference changes. */
export function initTheme() {
  if (!isBrowser) return () => {}

  // Re-read from localStorage in case the store was created on the server
  const stored = getStoredTheme()
  useThemeStore.setState({ theme: stored })
  applyTheme(stored)

  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  const handler = () => {
    if (useThemeStore.getState().theme === "system") {
      applyTheme("system")
    }
  }
  mq.addEventListener("change", handler)
  return () => mq.removeEventListener("change", handler)
}
