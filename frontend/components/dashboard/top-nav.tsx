"use client";

import { LogOut, KeyRound, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { usePaperStore } from "@/lib/paper-store";
import { logoutEverywhere } from "@/lib/logout";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LogoutConfirmDialog from "@/components/auth/logout-confirm-dialog";
import NeedsInputBell from "@/components/notifications/needs-input-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import ApiKeysDialog from "./api-keys-dialog";

export default function TopNav() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = async () => {
    await logoutEverywhere();
    router.push("/login");
  };

  const requestLogout = () => {
    const hasCreations = usePaperStore.getState().papers.length > 0;
    if (hasCreations) {
      setLogoutOpen(true);
    } else {
      void handleLogout();
    }
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "User";

  return (
    <>
      <nav className="sticky top-0 z-40 w-full min-w-0 border-b border-[rgba(209,207,201,0.6)] bg-white dark:bg-navbg dark:border-white/10">
        <div className="mx-auto flex h-14 min-h-14 max-w-400 min-w-0 items-center justify-between gap-2 px-3 sm:h-16 sm:min-h-16 sm:gap-3 sm:px-7 md:px-20">
          {/* Left — brand (may shrink / truncate on narrow viewports) */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Link
              href="/"
              className="flex min-w-0 max-w-full items-center gap-2 hover:opacity-90 sm:gap-2.5"
            >
              <Image
                src="/light/Logo-Sqaure-light.svg"
                alt="Saral AI"
                width={28}
                height={28}
                className="block sm:hidden dark:hidden h-7 w-auto object-contain"
                priority
              />
              <Image
                src="/dark/Logo-Sqaure-dark.svg"
                alt="Saral AI"
                width={28}
                height={28}
                className="hidden dark:block sm:dark:hidden h-7 w-auto object-contain"
                priority
              />
              <Image
                src="/light/Logo-Full-light.svg"
                alt="Saral AI"
                width={105}
                height={28}
                className="hidden sm:block dark:hidden h-7 w-auto object-contain"
                priority
              />
              <Image
                src="/dark/Logo-Full-dark.svg"
                alt="Saral AI"
                width={105}
                height={28}
                className="hidden sm:dark:block h-7 w-auto object-contain"
                priority
              />
            </Link>
            <div className="h-4 w-px shrink-0 bg-ink/15 dark:bg-white/20" />

            <span className="hidden sm:inline font-sans text-xs font-medium text-ink-muted dark:text-white/60">
              Supported by
            </span>
            <Link
              href="https://anrfonline.in/ANRF/HomePage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-1 group shrink-0"
            >
              <span className="font-sans text-xs font-bold text-ink-muted dark:text-white/50 group-hover:text-saral-forest dark:group-hover:text-white transition-colors">
                ANRF
              </span>
            </Link>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NeedsInputBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  aria-label="Account menu"
                  className="flex cursor-pointer h-auto min-w-0 max-w-[min(100%,10.5rem)] shrink items-center gap-1.5 rounded-lg px-1.5 py-1 font-sans text-[13px] font-semibold text-ink dark:text-white hover:bg-[#f5f5f5] dark:hover:bg-carddarkbg data-[state=open]:bg-[#f5f5f5] data-[state=open]:dark:bg-carddarkbg sm:max-w-none sm:shrink-0 sm:gap-2.5 sm:px-2 sm:py-1.5 sm:text-[15px]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-saral-forest sm:size-9">
                    <span className="text-[11px] font-bold text-white sm:text-[12px]">
                      {userInitials}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate sm:max-w-40">
                    {displayName}
                  </span>
                  <ChevronDown
                    className="size-3.5 shrink-0 text-ink-muted dark:text-white/70 sm:size-4"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="min-w-50 rounded-cta border border-pill-border bg-white dark:bg-carddarkbg dark:border-darkcardborder p-1.5 shadow-lg"
              >
                {user?.email ? (
                  <>
                    <div className="px-2.5 py-2">
                      <p className="truncate font-sans text-[12px] font-semibold text-ink dark:text-white">
                        {user.name || displayName}
                      </p>
                      <p className="mt-0.5 truncate font-sans text-[11px] text-ink-muted dark:text-white/70">
                        {user.email}
                      </p>
                    </div>
                    <DropdownMenuSeparator className="bg-[#f0ece4] dark:bg-darkcardborder" />
                  </>
                ) : null}
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 rounded-[8px] px-2.5 py-2 font-sans text-[13px] font-medium"
                  onSelect={() => setApiKeysOpen(true)}
                >
                  <KeyRound
                    size={14}
                    className="text-ink-muted dark:text-white/70"
                  />
                  Config API keys
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer gap-2.5 rounded-[8px] px-2.5 py-2 font-sans text-[13px] font-medium"
                  onSelect={(e: Event) => {
                    e.preventDefault();
                    requestLogout();
                  }}
                >
                  <LogOut size={14} />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      <ApiKeysDialog open={apiKeysOpen} onOpenChange={setApiKeysOpen} />
      <LogoutConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={handleLogout}
      />
    </>
  );
}
