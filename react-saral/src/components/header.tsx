import { Link } from "@tanstack/react-router"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-xl font-bold text-[#084898]"
        >
          SARAL
        </Link>

        <nav className="flex items-center gap-4">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="text-base font-semibold text-black dark:text-white hover:text-[#084898]"
              >
                Dashboard
              </Link>
              <div className="flex items-center gap-3">
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <Button variant="ghost" size="sm" onClick={logout}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm text-[#084898] transition-colors hover:text-[#084898]"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
