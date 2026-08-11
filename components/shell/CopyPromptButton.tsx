"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Stars } from "lucide-react";
import { toast } from "sonner";
import { useBorderGlow } from "@/components/registry/border-glow/border-glow";
import { trackEvent } from "@/lib/stats/track";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import SparkleBurst, { useSparkleBurst } from "./SparkleBurst";

// The Copy Prompt control.
//
// The border, background and radius live on the SHELL, not the button: the glow
// overlays paint above the shell's own background layer but below its children,
// which is the only stacking order where the ring is visible. A border on the
// button would sit on top of the ring and hide it.
const SHELL =
  "relative isolate inline-flex shrink-0 rounded-md border border-hairline bg-panel";

// `relative` anchors the sparks; `z-10` keeps the label above the outer glow
// layer. No `overflow-hidden` — the burst is meant to leave the box.
const CHROME =
  "relative z-10 inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md px-3 font-display text-[11px] uppercase tracking-[0.15em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Holds the row steady while the label swaps between the two words. */
const LABEL = "min-w-[5.75rem] text-left";

const RESET_MS = 1400;

// Amethyst, tuned down for chrome duty exactly as CatalogCard does — this is a
// control, not a demo. Pointer handlers are deliberately NOT attached: the button
// already has its own hover state, so the glow belongs to the sweep alone.
const GLOW = {
  glowColor: "271 91 65", // #a855f7 as the "H S L" triplet BorderGlow expects
  backgroundColor: "var(--color-panel)",
  colors: ["#a855f7", "#6d28d9", "#22d3ee"],
  glowRadius: 10,
  glowIntensity: 0.55,
  fillOpacity: 0.25,
};

// BorderGlow's autoplay turns the cone at 2200ms per revolution, so this is how
// far around the perimeter the sweep travels before it lets go: ~230°. Its own
// 0.75s fade-out then runs on top, for ~2.15s of total presence.
const SWEEP_MS = 1400;

/**
 * True for one sweep each time the workspace switches TO the Code tab. Reading
 * the store directly beats threading a prop down: the button arrives as an opaque
 * server node, so the tab row has nothing to hand it.
 */
function useCodeTabSweep(): boolean {
  const [sweeping, setSweeping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Zustand's subscribe is an external-store subscription, so this setState
    // lands in a change callback rather than synchronously in an effect body.
    const unsubscribe = useUIStore.subscribe((state, prev) => {
      // Only the free→code transition. Re-clicking an already-active tab, or any
      // unrelated store write (sidebar width, search), must not re-trigger.
      if (state.activeTab !== "code" || prev.activeTab === "code") return;
      setSweeping(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSweeping(false), SWEEP_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return sweeping;
}

function PromptButtonShell({ children }: { children: ReactNode }) {
  const sweeping = useCodeTabSweep();
  const reducedMotion = usePrefersReducedMotion();
  // Gated here rather than inside the hook: BorderGlow's reduced-motion branch
  // still parks a static ring on screen, and a control shouldn't light up at all.
  const { cardRef, overlays } = useBorderGlow({
    ...GLOW,
    autoplay: sweeping && !reducedMotion,
  });

  return (
    <div ref={cardRef} className={SHELL}>
      {overlays}
      {children}
    </div>
  );
}

export default function CopyPromptButton({
  text,
  slug,
  name,
}: {
  text: string;
  slug: string;
  /** Component name — used for the accessible label and the live announcement. */
  name: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sparks, burst, settle } = useSparkleBurst();

  // A pending reset must not fire into an unmounted tree, and a second click
  // must not inherit the first click's deadline.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    // Absent on insecure origins. Fail loudly here — silence would read as a
    // successful copy that simply produced nothing.
    if (!navigator.clipboard) {
      toast("Clipboard unavailable on this connection");
      return;
    }

    try {
      // The only await in the handler: `text` is already a prop, never fetched on
      // click. Anything awaited before the write costs the user-gesture in Safari
      // and the copy silently fails.
      await navigator.clipboard.writeText(text);
    } catch {
      toast("Couldn't copy the prompt");
      return;
    }

    // Everything below is the success path — a failed copy never celebrates.
    burst();
    setCopied(true);
    trackEvent(slug, "prompt");

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  };

  return (
    <>
      <PromptButtonShell>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy the AI integration prompt for ${name}`}
          className={cn(
            CHROME,
            copied ? "text-accent" : "text-ink-dim hover:text-ink",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Stars className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className={LABEL}>{copied ? "Copied" : "Copy Prompt"}</span>
          <SparkleBurst sparks={sparks} onSettle={settle} />
        </button>
      </PromptButtonShell>
      {/* The burst says nothing to a screen reader; this does. Kept OUTSIDE the
          button: a button takes its accessible name from its contents, so a live
          region nested inside one announces inconsistently across screen readers.
          `sr-only` is out of flow, so it costs the flex row nothing. */}
      <span role="status" className="sr-only">
        {copied ? `Prompt for ${name} copied to clipboard` : ""}
      </span>
    </>
  );
}
