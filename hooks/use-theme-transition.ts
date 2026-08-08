"use client";

import { useCallback } from "react";
import { useTheme } from "next-themes";

import { runThemeTransition, type TransitionVariant } from "@/lib/theme-transition";

interface UseThemeTransitionOptions {
  variant?: TransitionVariant;
  duration?: number;
}

/**
 * Wraps next-themes' `useTheme` with the View-Transitions reveal
 * (`runThemeTransition`). Exposes `pickTheme(themeOption, triggerEl?)` which
 * resolves `system` to the effective theme, skips the animation when nothing
 * visibly changes or the user prefers reduced motion, and otherwise runs the
 * clip-path reveal expanding from `triggerEl`. Persists via next-themes' own
 * localStorage cache only.
 */
export function useThemeTransition({
  variant = "circle",
  duration = 400,
}: UseThemeTransitionOptions = {}) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const pickTheme = useCallback(
    (themeOption: string, triggerEl?: HTMLElement | null) => {
      // Effective (visible) theme the pick resolves to.
      const effectiveTarget =
        themeOption === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : themeOption;

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // No visible change, or reduced motion: switch silently. Toggle the class
      // synchronously so the swap is immediate rather than a tick behind
      // next-themes' effect.
      if (prefersReduced || resolvedTheme === effectiveTarget) {
        setTheme(themeOption);
        document.documentElement.classList.toggle("dark", effectiveTarget === "dark");
        return;
      }

      runThemeTransition({
        triggerEl,
        variant,
        duration,
        applyTheme: () => {
          setTheme(themeOption);
          // next-themes applies the class in an effect that may not run before the
          // VT snapshot; toggle it synchronously so the snapshot is correct.
          document.documentElement.classList.toggle("dark", effectiveTarget === "dark");
        },
      });
    },
    [setTheme, resolvedTheme, variant, duration],
  );

  return { theme, resolvedTheme, pickTheme };
}
