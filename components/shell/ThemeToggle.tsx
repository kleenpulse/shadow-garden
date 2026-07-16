"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useThemeTransition } from "@/hooks/use-theme-transition";
import { cn } from "@/lib/utils";

// Bench-style theme control. The clip-path reveal (diamond) expands from the
// button itself, matching the instrument's geometric language.
export default function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, pickTheme } = useThemeTransition({ variant: "diamond", duration: 480 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light"; // dark is the default identity
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => pickTheme(isDark ? "light" : "dark", event.currentTarget)}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-md border border-hairline text-ink-dim transition-colors hover:text-accent focus-visible:text-accent",
        className,
      )}
    >
      {/* Hold a neutral slot until mounted so SSR (theme unknown) matches the client. */}
      {mounted ? (
        isDark ? <SunIcon className="h-4 w-4" aria-hidden /> : <MoonIcon className="h-4 w-4" aria-hidden />
      ) : (
        <span className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
