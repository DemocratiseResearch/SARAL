"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className="rounded-[10px]"
      >
        <div className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="cursor-pointer rounded-[10px] text-ink dark:text-white hover:bg-linen-dark dark:hover:bg-white/10"
    >
      <Sun className="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
