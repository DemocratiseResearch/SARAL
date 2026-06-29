"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, KeyRound } from "lucide-react";
import {
  Navbar as NavbarWrapper,
  NavBody,
  NavItems,
  MobileNav,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
  NavbarButton,
} from "@/components/ui/resizable-navbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthStore } from "@/lib/auth-store";
import { usePaperStore } from "@/lib/paper-store";
import { logoutEverywhere } from "@/lib/logout";
import ApiKeysDialog from "@/components/dashboard/api-keys-dialog";
import LogoutConfirmDialog from "@/components/auth/logout-confirm-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import Image from "next/image";

const NAV_LINKS = [
  { name: "Media", link: "/#media" },
  { name: "Features", link: "/#features" },
  { name: "Testimonials", link: "/#testimonials" },
  { name: "About", link: "/about" },
];

function SaralLogo() {
  return (
    <div className="relative z-20 mr-4 flex items-center gap-2.5">
      <Link
        href="/"
        className="flex items-center px-2 py-1 no-underline cursor-pointer"
      >
        <Image
          src="/light/Logo-Sqaure-light.svg"
          alt="Saral AI"
          width={20}
          height={20}
          className="block sm:hidden dark:hidden h-6 w-auto object-contain"
          priority
        />
        <Image
          src="/dark/Logo-Sqaure-dark.svg"
          alt="Saral AI"
          width={20}
          height={20}
          className="hidden dark:block sm:dark:hidden h-6 w-auto object-contain"
          priority
        />
        <Image
          src="/light/Logo-Full-light.svg"
          alt="Saral AI"
          width={50}
          height={25}
          className="hidden sm:block dark:hidden h-8 w-auto object-contain"
          priority
        />
        <Image
          src="/dark/Logo-Full-dark.svg"
          alt="Saral AI"
          width={50}
          height={25}
          className="hidden sm:dark:block h-8 w-auto object-contain"
          priority
        />
      </Link>
      <div className="h-4 w-px bg-ink/15 dark:bg-white/20 shrink-0" />
      <Link
        href="https://anrfonline.in/ANRF/HomePage"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-baseline gap-1 group"
      >
        <span className="inline font-sans text-[10px] font-medium text-ink-faint dark:text-white/30">
          Supported by
        </span>
        <span className="font-sans text-[11px] font-bold text-ink-muted dark:text-white/50 group-hover:text-saral-forest dark:group-hover:text-white transition-colors">
          ANRF
        </span>
      </Link>
    </div>
  );
}

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [avatarPopoverOpen, setAvatarPopoverOpen] = useState(false);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    await logoutEverywhere();
    router.replace("/login");
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
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <>
      <div className="relative w-full pt-6">
        <NavbarWrapper>
          {/* Desktop Navigation */}
          <NavBody className="bg-linen dark:bg-saral-dark/80 dark:bg-linen dark:bg-saral-dark/80">
            <SaralLogo />
            <NavItems
              items={NAV_LINKS}
              className="text-[15px] text-[#333333]"
            />
            <div className="relative z-10 flex items-center gap-4">
              <ThemeToggle />
              {user ? (
                <>
                  {/* Avatar with Popover */}
                  <Popover
                    open={avatarPopoverOpen}
                    onOpenChange={setAvatarPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="w-9 h-9 rounded-full bg-[#4a5d55] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#4a5d55]/30"
                        aria-label="User menu"
                      >
                        <span className="font-bold text-xs text-white">
                          {userInitials}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      sideOffset={8}
                      className="w-52 p-2 bg-white border border-pill-border rounded-[12px] shadow-lg"
                    >
                      <div className="px-3 py-2 mb-1 border-b border-[#f0ece4]">
                        <p className="font-sans font-semibold text-[13px] text-ink dark:text-white truncate">
                          {user.name || "User"}
                        </p>
                        <p className="font-sans text-[11px] text-ink-muted dark:text-white/70 truncate mt-0.5">
                          {user.email}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setAvatarPopoverOpen(false);
                          setApiKeysOpen(true);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[8px] text-[13px] font-medium font-sans text-ink dark:text-white hover:bg-linen-dark transition-colors cursor-pointer"
                      >
                        <KeyRound
                          size={14}
                          className="text-ink-muted dark:text-white/70 shrink-0"
                        />
                        Configure API Keys
                      </button>
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => {
                      setAvatarPopoverOpen(false);
                      requestLogout();
                    }}
                    className="flex items-center cursor-pointer gap-1.5 bg-ink text-white hover:bg-[#333333] rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    <LogOut size={14} /> Logout
                  </button>
                </>
              ) : (
                <NavbarButton
                  href="/login"
                  variant="dark"
                  className="cursor-pointer bg-ink dark:bg-saral-forest text-white hover:bg-[#333333] dark:hover:bg-saral-forest/90 rounded-[10px] px-6 py-2.5 text-sm font-semibold"
                >
                  Login
                </NavbarButton>
              )}
            </div>
          </NavBody>

          {/* Mobile Navigation */}
          <MobileNav className="bg-linen dark:bg-transparent">
            <MobileNavHeader>
              <SaralLogo />
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <MobileNavToggle
                  isOpen={isMobileMenuOpen}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                />
              </div>
            </MobileNavHeader>

            <MobileNavMenu
              isOpen={isMobileMenuOpen}
              onClose={() => setIsMobileMenuOpen(false)}
              className="bg-linen dark:bg-carddarkbg rounded-xl border border-pill-border dark:border-saral-dark shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              {NAV_LINKS.map((item, idx) => (
                <Link
                  key={`mobile-link-${idx}`}
                  href={item.link}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="relative w-full text-[15px] font-medium text-ink hover:text-ink-muted dark:text-white/70 dark:hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-linen-dark dark:hover:bg-saral-dark/50"
                >
                  <span className="block">{item.name}</span>
                </Link>
              ))}
              <div className="w-full border-t dark:border-darkcardborder border-pill-border my-1" />
              <div className="flex w-full flex-col gap-3">
                {user ? (
                  <>
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setApiKeysOpen(true);
                      }}
                      className="flex cursor-pointer items-center justify-center gap-2 w-full border border-pill-border rounded-[10px] text-sm font-semibold py-2.5 text-ink dark:text-white hover:bg-linen-dark transition-colors"
                    >
                      <KeyRound size={14} /> Configure API Keys
                    </button>
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        requestLogout();
                      }}
                      className="flex cursor-pointer items-center justify-center gap-2 w-full bg-ink text-white rounded-[10px] text-sm font-semibold py-3"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </>
                ) : (
                  <NavbarButton
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    variant="dark"
                    className="w-full bg-ink dark:bg-saral-forest text-white rounded-[10px] text-sm font-semibold py-3"
                  >
                    Login
                  </NavbarButton>
                )}
              </div>
            </MobileNavMenu>
          </MobileNav>
        </NavbarWrapper>
      </div>
      {/* API Keys Dialog */}
      <ApiKeysDialog open={apiKeysOpen} onOpenChange={setApiKeysOpen} />
      <LogoutConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={handleLogout}
      />
    </>
  );
}
