"use client";

import * as React from "react";
import { useEffect } from "react";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
  type ThemeProviderProps,
} from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      {...props}
      attribute="class"
      enableSystem={false}
      defaultTheme="light"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export const useTheme = () => {
  const [mounted, setMounted] = React.useState(false);
  const { theme, setTheme, resolvedTheme } = useNextTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    theme: mounted ? theme : undefined,
    resolvedTheme: mounted ? resolvedTheme : "light",
    setTheme,
    mounted,
  };
};
