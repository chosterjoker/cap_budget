"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* The `class` strategy is what drives both the `dark:` variant and the
          `.dark` custom-property block in globals.css. Transitions are
          suppressed during a switch so the page doesn't cross-fade every
          colour at once. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
