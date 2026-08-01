"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { trackEvent } from "@/lib/stats/track";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

// The collapsed height itself (14 lines) lives in the `.shiki-wrap[data-collapsed]`
// max-height calc in globals.css — the clamp has to be CSS because the Code panel
// sits under `hidden` (display:none) while the Preview tab is active, so nothing
// here can measure it. Below this threshold the pill isn't worth its own chrome:
// a 20-line file would grow a whole control to reveal six lines.
const COLLAPSE_MIN_LINES = 22;

// Where the block's top comes to rest after a collapse. 6rem, the same stop the
// cookbook anchors use (§V28) — enough that the header row isn't flush with the
// viewport edge.
const REST_OFFSET = 96;
// Only the last half-screen is animated. Collapsing from deep inside a 30,000px
// file is an 8,000px+ journey, and a smooth scroll that long is the §V35 lurch:
// the browser allots ~1.1s regardless of distance, so one slow frame swallows
// hundreds of pixels. Stage the gap instantly, animate the approach.
const APPROACH = 0.5;
// Ceiling on the wait for the approach scroll to land before folding anyway.
const SETTLE_MS = 700;

export default function CodeBlock({
  html,
  raw,
  filename,
  slug,
  lineCount,
}: {
  html: string;
  raw: string;
  filename?: string;
  /** Registry slug of the source's component — used to count copy-source events. */
  slug?: string;
  /** Source line count from the server read; absent means never collapse. */
  lineCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelFold = useRef<(() => void) | undefined>(undefined);
  const panelId = useId();
  const reducedMotion = usePrefersReducedMotion();

  const collapsible = (lineCount ?? 0) > COLLAPSE_MIN_LINES;
  const collapsed = collapsible && !expanded;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      // Copying the raw source is the highest-intent "I'm taking this" signal.
      if (slug) trackEvent(slug, "copy");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  };

  const toggle = () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }

    // Collapsing removes up to ~30,000px of document. The block's own top never
    // moves — only what sits below it rises — so parking the viewport at that top
    // BEFORE the fold leaves nothing to jump. Scroll first, collapse on arrival.
    const root = rootRef.current;
    const top = root?.getBoundingClientRect().top;
    // Already resting at or above the block's top: nothing to recover.
    if (top === undefined || top >= 0) {
      setExpanded(false);
      return;
    }

    const target = Math.max(0, window.scrollY + top - REST_OFFSET);

    if (reducedMotion) {
      window.scrollTo({ top: target, behavior: "auto" });
      setExpanded(false);
      return;
    }

    // Stage the long gap instantly (§V35 — a smooth scroll across thousands of
    // pixels is the lurch, and the browser allots ~1.1s no matter the distance),
    // then animate only the approach.
    const stage = target + window.innerHeight * APPROACH;
    if (window.scrollY > stage) window.scrollTo({ top: stage, behavior: "auto" });
    window.scrollTo({ top: target, behavior: "smooth" });

    // The fold waits for the scroll to land. `scrollend` is the real signal; the
    // timer is the floor for browsers that don't fire it, and for the case where
    // the browser treats the remaining distance as a no-op and stays silent.
    const fold = () => {
      cancelFold.current?.();
      setExpanded(false);
    };
    window.addEventListener("scrollend", fold);
    const timer = window.setTimeout(fold, SETTLE_MS);
    cancelFold.current = () => {
      window.removeEventListener("scrollend", fold);
      clearTimeout(timer);
      cancelFold.current = undefined;
    };
  };

  // A pending fold outlives the click by up to SETTLE_MS. CodeTabs remounts this
  // component on a file switch, so without this the listener and its closure leak.
  useEffect(() => () => cancelFold.current?.(), []);

  return (
    // `overflow-clip`, not `overflow-hidden`: hidden creates a scroll container,
    // which silently kills `position: sticky` on the collapse pill below. clip
    // rounds the corners the same way without becoming a scrollport.
    <div
      ref={rootRef}
      className="overflow-clip rounded-lg border border-hairline bg-panel"
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
        <span className="font-mono text-[11px] text-ink-mute">{filename ?? "source"}</span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] text-ink-dim transition-colors hover:text-accent"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {/* The highlighted div owns its children via innerHTML, so the fade and the
          pill are siblings in this wrapper rather than inside it. */}
      <div className="relative">
        <div
          id={panelId}
          data-collapsed={collapsed || undefined}
          className="shiki-wrap overflow-x-auto"
          // Highlighted server-side by Shiki; raw source never re-parsed on the client.
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {collapsible && (
          <>
            {/* Graphite, not a semantic token: the code surface stays dark in both
                themes, so `bg-panel` would wash it white under the light theme. */}
            <div
              aria-hidden
              className={cn(
                "shiki-code-fade pointer-events-none absolute inset-x-0 bottom-0 h-24",
                "bg-linear-to-t from-bench-950 via-bench-950/85 to-transparent",
                collapsed ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              className={
                collapsed
                  ? "absolute inset-x-0 bottom-3 flex justify-center"
                  : "sticky bottom-4 flex justify-center pb-3"
              }
            >
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="flex items-center gap-1.5 rounded-full border border-bench-700 bg-bench-850 px-3 py-1.5 font-mono text-[11px] text-bench-100 transition-colors hover:border-amethyst hover:text-amethyst"
              >
                {collapsed ? `show all ${lineCount} lines` : "collapse"}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    !collapsed && "rotate-180",
                  )}
                />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
