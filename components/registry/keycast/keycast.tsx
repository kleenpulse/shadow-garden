"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// A streamer-style keyboard HUD: every chord you press appears as a row of
// keycaps and ages away. The listener is display-only by contract — it never
// calls preventDefault or stopPropagation, bails inside editable targets and
// mid-IME composition, and ignores lone modifiers — so the page underneath
// keeps every shortcut it had, and the HUD merely reports what the hands did.
// The reverse also holds: a handler that preventDefaults still shows up here,
// because a HUD's job is physical input, not the app's opinion of it.
//
// Entry timestamps ride the loop clock, not Date.now(). Pause the bench for
// ten seconds and a wall-clock HUD would evict its whole stack the instant
// you resume; the loop clock simply stops aging anything while frozen.

export type KeycastCorner = "bottom-left" | "bottom-center" | "bottom-right";
export type KeycastPlatform = "mac" | "pc";

export interface KeycastProps {
  /** How long a chord stays on the HUD before it fades out. */
  lifetime?: number;
  /** History depth; older entries are evicted early. */
  maxVisible?: number;
  /** Where the stack anchors in its pane. */
  corner?: KeycastCorner;
  /** Fold a hammered key into one cap with a ×n badge. */
  combineRepeats?: boolean;
  /** ⌘⌥⇧⌃ glyphs or Ctrl / Alt / Shift words. */
  platform?: KeycastPlatform;
  /** Replay a scripted set of chords whenever the keyboard goes quiet. */
  demo?: boolean;
  /** Keycap height; legends scale with it. */
  capSize?: number;
  /** Modifier caps and the ring on the newest chord. */
  accent?: string;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

type Mod = "ctrl" | "alt" | "shift" | "meta";

interface Entry {
  id: number;
  mods: Mod[];
  key: string;
  count: number;
  born: number; // loop-clock seconds
}

const MOD_ORDER: Mod[] = ["ctrl", "alt", "shift", "meta"];
const MOD_GLYPHS: Record<KeycastPlatform, Record<Mod, string>> = {
  mac: { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" },
  pc: { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" },
};

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  Escape: "Esc",
  Enter: "⏎",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  CapsLock: "⇪",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

/** The idle reel: what plays when nobody is typing. Doubles as the motion
 *  source the loop-verification harness watches. */
const DEMO: Array<{ mods: Mod[]; key: string }> = [
  { mods: ["meta"], key: "K" },
  { mods: ["shift", "meta"], key: "P" },
  { mods: [], key: "G" },
  { mods: [], key: "G" },
  { mods: [], key: "D" },
  { mods: [], key: "D" },
  { mods: ["alt"], key: "⇥" },
  { mods: ["meta"], key: "Z" },
];

/** Seconds of real-keyboard silence before the demo reel starts. */
const DEMO_AFTER = 3.5;

const signature = (mods: Mod[], key: string) => `${mods.join("+")}·${key}`;

const Keycast = ({
  lifetime = 2.4,
  maxVisible = 5,
  corner = "bottom-center",
  combineRepeats = true,
  platform = "mac",
  demo = true,
  capSize = 34,
  accent = "#c4b5fd",
  paused = false,
  reducedMotion = false,
  className = "",
}: KeycastProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const live = useRef({ lifetime, maxVisible, combineRepeats, demo, paused, reducedMotion });
  live.current = { lifetime, maxVisible, combineRepeats, demo, paused, reducedMotion };

  const clock = useRef({ t: 0, quiet: 0, demoIdx: 0, demoWait: 1.2, nextId: 1 });

  const addChord = (mods: Mod[], key: string) => {
    const c = clock.current;
    const cfg = live.current;
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      if (cfg.combineRepeats && last && signature(last.mods, last.key) === signature(mods, key)) {
        // Same chord again: fold into a ×n badge and refresh its clock —
        // a hammered key stays one cap instead of flooding the stack.
        return [...prev.slice(0, -1), { ...last, count: last.count + 1, born: c.t }];
      }
      const next = [...prev, { id: c.nextId++, mods, key, count: 1, born: c.t }];
      return next.length > cfg.maxVisible ? next.slice(next.length - cfg.maxVisible) : next;
    });
    loop.start();
  };

  const loop = useAnimationLoop({
    target: containerRef,
    halted: paused,
    onFrame: ({ dt }) => {
      const c = clock.current;
      const cfg = live.current;
      c.t += dt;
      c.quiet += dt;

      // The demo reel keeps a keyboard HUD from being a blank pane in a docs
      // preview nobody is typing into.
      if (cfg.demo && c.quiet > DEMO_AFTER) {
        c.demoWait -= dt;
        if (c.demoWait <= 0) {
          const chord = DEMO[c.demoIdx % DEMO.length];
          c.demoIdx++;
          // Deterministic cadence variety — no Math.random in the frame body.
          c.demoWait = 0.85 + (c.demoIdx % 3) * 0.4;
          addChord(chord.mods, chord.key);
        }
      }

      const list = entriesRef.current;
      let expired = false;
      for (const entry of list) {
        const el = rowRefs.current.get(entry.id);
        const age = c.t - entry.born;
        if (age > cfg.lifetime) {
          expired = true;
          continue;
        }
        if (!el) continue;
        if (cfg.reducedMotion) {
          // Appearance and removal only — no pop, no slide, no fade ramp.
          if (el.style.opacity !== "1") {
            el.style.opacity = "1";
            el.style.transform = "none";
          }
          continue;
        }
        const enter = Math.min(age / 0.16, 1);
        const exit = Math.min(Math.max((cfg.lifetime - age) / 0.45, 0), 1);
        const opacity = Math.min(enter, exit);
        const scale = 0.85 + 0.15 * (1 - (1 - enter) * (1 - enter));
        const rise = (1 - exit) * -6;
        const o = opacity.toFixed(3);
        if (el.style.opacity !== o) {
          el.style.opacity = o;
          el.style.transform = `translateY(${rise.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        }
      }

      if (expired) {
        setEntries((prev) => prev.filter((entry) => c.t - entry.born <= cfg.lifetime));
      }

      // Empty stack and no reel to feed: nothing left to age — self-halt.
      if (list.length === 0 && !cfg.demo) return false;
    },
  });

  // The window listener mounts once and reads everything live through refs —
  // rebinding per render would churn the subscription on every keystroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (MODIFIER_KEYS.has(e.key)) return;
      if (e.repeat && !live.current.combineRepeats) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable)
          return;
      }
      const mods = MOD_ORDER.filter((m) =>
        m === "ctrl" ? e.ctrlKey : m === "alt" ? e.altKey : m === "shift" ? e.shiftKey : e.metaKey,
      );
      const label =
        KEY_LABELS[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      clock.current.quiet = 0;
      addChord(mods, label);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // addChord is stable in behaviour: it reads state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-arm the self-halted loop when the pause lifts or the reel switches on.
  useEffect(() => {
    loop.start();
  }, [paused, demo, loop]);

  const align =
    corner === "bottom-left"
      ? "items-start"
      : corner === "bottom-right"
        ? "items-end"
        : "items-center";

  const cap = (text: string, isMod: boolean, key: string) => (
    <span
      key={key}
      className="inline-flex items-center justify-center rounded-md border font-mono"
      style={{
        height: capSize,
        minWidth: capSize * 0.92,
        paddingInline: capSize * 0.22,
        fontSize: capSize * 0.4,
        color: isMod ? accent : "#d6d3e4",
        borderColor: isMod ? `color-mix(in oklab, ${accent} 45%, transparent)` : "#3a3a46",
        background: "linear-gradient(180deg, #26262f 0%, #1a1a21 100%)",
        borderBottomWidth: 3,
        boxShadow: "0 2px 0 rgba(0,0,0,0.4)",
      }}
    >
      {text}
    </span>
  );

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className}`.trim()}>
      {/* A live transcript of every keystroke is exactly the noise a screen
          reader does not need twice — the HUD is decoration over real input. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-6 bottom-6 flex flex-col justify-end gap-2 ${align}`}
      >
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            ref={(el) => {
              if (el) rowRefs.current.set(entry.id, el);
              else rowRefs.current.delete(entry.id);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
            style={{
              opacity: reducedMotion ? 1 : 0,
              background: "rgba(10,10,14,0.55)",
              boxShadow:
                i === entries.length - 1
                  ? `0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent)`
                  : "0 0 0 1px rgba(58,58,70,0.5)",
            }}
          >
            {entry.mods.map((m) => cap(MOD_GLYPHS[platform][m], true, `${entry.id}-${m}`))}
            {cap(entry.key, false, `${entry.id}-key`)}
            {entry.count > 1 && (
              <span
                className="ml-0.5 font-mono text-[11px] tabular-nums"
                style={{ color: accent }}
              >
                ×{entry.count}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Keycast;
