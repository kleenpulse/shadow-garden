"use client";

import { useCallback, useEffect, useState } from "react";

// Dark mode without a theme library.
//
// The template used to read `next-themes`, which meant it only worked inside a
// ThemeProvider — a provider a buyer may not have, and one that conflicts with
// whichever theme system they already run. What the canvases actually need is one
// boolean, and the source of truth for that is already in the DOM: the `dark`
// class on <html>, which every theme library on earth writes.
//
// So this observes the class instead of owning it. Drop the template into a
// next-themes app, a CSS-only app, or nothing at all, and it reads correctly in
// all three.

const STORAGE_KEY = "vellum-theme";

function readDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function useIsDark(): [boolean, (dark: boolean) => void] {
  // false on the server and on the first client render: the class is not readable
  // during SSR, and guessing would trade a hydration mismatch for a flash.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(readDark());
    const observer = new MutationObserver(() => setIsDark(readDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const setDark = useCallback((dark: boolean) => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // Private mode, blocked storage — the class is still applied, which is the
      // part that matters this session.
    }
  }, []);

  return [isDark, setDark];
}
