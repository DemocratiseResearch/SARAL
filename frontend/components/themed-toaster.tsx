"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/context/ThemeContext";

export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      offset={20}
      gap={10}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}
