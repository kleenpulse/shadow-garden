"use client";

import { useEffect } from "react";
import { useUIStore } from "@/lib/store";

// The slug the current pause applies to, tracked module-wide (both hosts import
// this one module). A pause survives moving between a component's workspace and
// its fullscreen view (same slug) but clears when you navigate to a different
// component — matching the "opens alive" expectation without wiping same-slug pauses.
let lastPauseSlug: string | null = null;

/** Reads the global pause flag and resets it to playing on real navigation. */
export function usePauseState(slug: string): boolean {
  const paused = useUIStore((s) => s.paused);
  const setPaused = useUIStore((s) => s.setPaused);
  useEffect(() => {
    if (lastPauseSlug !== slug) {
      lastPauseSlug = slug;
      setPaused(false);
    }
  }, [slug, setPaused]);
  return paused;
}
