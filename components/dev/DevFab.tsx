"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Dev-only floating test controls. Mounted in app/layout.tsx behind a
 * NODE_ENV check, so it is dead-code-eliminated from production bundles.
 * Add future session/chrome test hooks as entries in ACTIONS.
 */

const INTRO_KEY = "sg-intro-v1";

const ACTIONS: { label: string; run: () => void }[] = [
  {
    // Reload on purpose: exercises the real pre-paint script path in layout.
    label: "Replay intro",
    run: () => {
      try {
        sessionStorage.removeItem(INTRO_KEY);
      } catch {}
      location.reload();
    },
  },
  {
    label: "Replay intro (forced)",
    run: () => {
      location.href = `${location.pathname}?sg-intro`;
    },
  },
  {
    label: "Clear session flags",
    run: () => {
      try {
        sessionStorage.removeItem(INTRO_KEY);
      } catch {}
    },
  },
];

export function DevFab() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="fixed bottom-4 left-4"
      // Above the intro overlay (z-10000) so it stays clickable mid-test.
      style={{ zIndex: 10001 }}
    >
      {open && (
        <div className="absolute bottom-12 left-0 w-52 rounded-md border border-hairline bg-panel p-1 shadow-lg">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className="block w-full rounded-sm px-2.5 py-1.5 text-left font-mono text-xs text-ink-dim hover:bg-accent/15 hover:text-ink"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Dev test controls"
        className={cn(
          "grid size-10 place-items-center rounded-full border border-hairline bg-panel font-mono text-[10px] font-bold text-ink-dim shadow-md transition-colors select-none hover:border-accent hover:text-accent",
          open && "border-accent text-accent",
        )}
      >
        DEV
      </button>
    </div>
  );
}
