"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// An append-only record of what an agent has been doing, arriving live.
//
// The typing is texture, not the point. The point is the stream: consecutive
// events from the same source fold into one block instead of stacking as
// identical rows, the window holds a fixed number of events and lets the rest
// fall off the top, and the scroll position is pinned to the newest line only
// until you scroll away from it — after that the log keeps running and tells
// you how far behind you are, rather than yanking you back down mid-read. A log
// that fights the reader is worse than one that does not move at all.
export type LedgerSeverity = "info" | "ok" | "warn" | "deny";

export interface LedgerEntry {
  id: string;
  /** Consecutive entries sharing a source fold into one block. */
  source: string;
  severity: LedgerSeverity;
  text: string;
}

export interface LedgerProps {
  /** Replayed in order. With `loop` on, the stream wraps and keeps going. */
  entries?: LedgerEntry[];
  /** Multiplier on the whole cadence — typing and gaps together. */
  speed?: number;
  /** Typing rate before jitter, in characters per second. */
  charsPerSecond?: number;
  /** Pause between one entry landing and the next starting, in ms. */
  entryGap?: number;
  /** Spread on the per-entry rate, 0 metronome to 1 wildly uneven. */
  jitter?: number;
  /** Events retained before the oldest falls off the top. */
  maxEntries?: number;
  /** Fold consecutive same-source events into one block. */
  group?: boolean;
  /** Elapsed stream time beside each event. */
  showTimestamps?: boolean;
  /** Blinking block caret on the line currently being written. */
  caret?: boolean;
  /** Wrap to the first entry when the source list runs out. */
  loop?: boolean;
  /** Row height and type size throughout. */
  density?: "comfortable" | "compact";
  /** Live indicator, the `ok` severity and the catch-up pill. */
  accentColor?: string;
  /** The `warn` severity. */
  warnColor?: string;
  /** The `deny` severity. */
  denyColor?: string;
  /** Freeze the stream where it stands. */
  paused?: boolean;
  /** Renders the whole window landed and never types. The stream is content,
   *  not decoration, so it is delivered rather than withheld — but no character
   *  ever animates and the live dot stops pulsing. */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * Deterministic jitter. `Math.random()` would make every mount a different
 * stream, which is exactly wrong for a component whose cadence props are meant
 * to be compared by dragging a slider: you could never tell your change apart
 * from the noise. A fixed seed makes the same run reproducible every time.
 */
function makeRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const RANK: Record<LedgerSeverity, number> = { info: 0, ok: 1, warn: 2, deny: 3 };

interface Row {
  /** Unique for the lifetime of the stream, so a wrap re-enters cleanly. */
  key: string;
  entry: LedgerEntry;
  /** Stream seconds at which this event started. */
  stamp: number;
  /**
   * Which run of same-source events this row belongs to, stamped when the row
   * is created and never recomputed. A group cannot be keyed by the row at its
   * head: the head is exactly what falls off when the window slides, so the
   * key would change under a block that has not otherwise moved and React
   * would tear it down and rebuild it — every surviving line in the group
   * blinking out and back in, once per dropped event.
   */
  run: number;
}

export default function Ledger({
  entries = [],
  speed = 1,
  charsPerSecond = 90,
  entryGap = 520,
  jitter = 0.35,
  maxEntries = 9,
  group = true,
  showTimestamps = true,
  caret = true,
  loop = true,
  density = "comfortable",
  accentColor = "#a855f7",
  warnColor = "#f0a830",
  denyColor = "#f87171",
  paused = false,
  reducedMotion = false,
  className,
}: LedgerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [chars, setChars] = useState(0);
  const [behind, setBehind] = useState(0);
  const [done, setDone] = useState(false);

  const compact = density === "compact";
  const halted = paused || reducedMotion;

  // Live mirror. The frame body runs from inside the runtime host and would
  // otherwise close over the render that installed it, so every prop it reads
  // has to come through here.
  const live = useRef({
    entries,
    speed,
    charsPerSecond,
    entryGap,
    jitter,
    maxEntries,
    loop,
    reducedMotion,
  });
  live.current = {
    entries,
    speed,
    charsPerSecond,
    entryGap,
    jitter,
    maxEntries,
    loop,
    reducedMotion,
  };

  /** True while the reader is parked at the newest line. */
  const stuck = useRef(true);

  const fresh = () => ({
    /** Monotonic count of events started, never reset — a wrap keeps counting
     *  so keys stay unique and the window scrolls instead of restarting. */
    total: 0,
    chars: 0,
    wait: 0,
    clock: 0,
    phase: "gap" as "type" | "gap",
    rate: 1,
    run: 0,
    source: "",
    random: makeRandom(0x5eed),
  });

  const stream = useRef(fresh());

  // Under reduced motion the whole window is delivered at once, landed. The
  // §V34 case: a component that hides its own content behind an animation has
  // to hand that content over when the animation is refused, not simply run the
  // animation at zero duration and hope.
  useEffect(() => {
    if (!reducedMotion) return;
    const visible = entries.slice(-maxEntries);
    let run = 0;
    let source = "";
    setRows(
      visible.map((entry, i) => {
        if (entry.source !== source) {
          run += 1;
          source = entry.source;
        }
        return { key: `r${i}`, entry, stamp: i * (entryGap / 1000), run };
      }),
    );
    setChars(visible.length ? visible[visible.length - 1].text.length : 0);
    setBehind(0);
    setDone(true);
  }, [reducedMotion, entries, maxEntries, entryGap]);

  // Restart the stream whenever its inputs change. The frame body halts itself
  // by returning false when a non-looping stream runs dry, and a self-halt is
  // invisible to the host's `halted` effect — nothing would ever re-arm it.
  useEffect(() => {
    if (reducedMotion) return;
    stream.current = fresh();
    setRows([]);
    setChars(0);
    setBehind(0);
    setDone(false);
    // `fresh` is a plain factory closing over nothing — listing it here would
    // just make this effect fire every render and restart the stream forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, reducedMotion]);

  // Turning `loop` back on after a non-looping stream has run dry has to undo
  // the completion, or the restart below is permanently blocked by it.
  useEffect(() => {
    if (loop) setDone(false);
  }, [loop]);

  const drawRef = useRef<((dt: number) => void | false) | null>(null);
  drawRef.current = (dt: number) => {
    const p = live.current;
    if (p.entries.length === 0) return false;
    // The host halts *after* drawing, so the frame already in flight when
    // reduced motion turns on still runs — and its writes land after the
    // effect that just delivered the whole window, replacing a landed log with
    // a half-typed one that nothing will ever finish. The frame body has to
    // refuse to write, not merely stop being scheduled.
    if (p.reducedMotion) return false;

    const s = stream.current;
    const step = dt * p.speed;
    s.clock += step;

    if (s.phase === "type") {
      const text = p.entries[(s.total - 1) % p.entries.length].text;
      s.chars = Math.min(text.length, s.chars + p.charsPerSecond * s.rate * step);
      if (s.chars >= text.length) {
        s.phase = "gap";
        // Jittered the other way from the typing rate, so a fast burst is
        // followed by a longer breath. Same rate on both would just scale the
        // whole entry and read as uniform again.
        s.wait = (p.entryGap / 1000) * (2 - s.rate);
      }
      setChars(Math.floor(s.chars));
      return;
    }

    s.wait -= step;
    if (s.wait > 0) return;

    if (!p.loop && s.total >= p.entries.length) {
      setDone(true);
      return false;
    }

    const entry = p.entries[s.total % p.entries.length];
    s.total += 1;
    s.chars = 0;
    s.phase = "type";
    s.rate = Math.max(0.15, 1 + (s.random() * 2 - 1) * p.jitter);
    if (entry.source !== s.source) {
      s.run += 1;
      s.source = entry.source;
    }

    const row: Row = { key: `e${s.total}`, entry, stamp: s.clock, run: s.run };
    setRows((prev) => {
      // Trimmed to the window in one slice rather than dropping a single row
      // per arrival: lowering `maxEntries` on the slider has to take effect
      // now, not one event at a time over the next twenty seconds.
      const next = prev.slice(Math.max(0, prev.length + 1 - p.maxEntries));
      next.push(row);
      return next;
    });
    setChars(0);
    if (!stuck.current) setBehind((n) => n + 1);
  };

  const runtime = useAnimationLoop({
    target: rootRef,
    halted,
    // Literal ternary, never `?? false`. `drawRef.current?.(dt) ?? false` reads
    // as a null-guard and is not one: a frame that draws successfully returns
    // undefined, `undefined ?? false` is false, and false is this host's halt
    // signal. That form froze nineteen entries after one frame each.
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  // Re-arm after a self-halt. `halted` has not changed, so the host's own
  // resume effect will not fire.
  useEffect(() => {
    if (!halted && !done) runtime.start();
  }, [halted, done, entries, loop, runtime]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stuck.current = atEnd;
    if (atEnd) setBehind(0);
  };

  // Pinned before paint, not after: doing this in a passive effect lets the
  // browser paint one frame with the new line below the fold, which reads as a
  // flicker at the bottom edge on every single event.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stuck.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, chars]);

  // Instant, deliberately. A smooth scroll here loses a race it cannot win: the
  // browser gives the whole travel one fixed time budget, so a long one moves
  // hundreds of pixels per frame, and every intermediate scroll event it emits
  // reads as "not at the end" and unsticks the pin the catch-up just set — the
  // pill reappears before its own animation has finished. Measured: scrollTop
  // reached the bottom, then drifted 673 → 300 → 0 as the log kept writing
  // underneath it. A terminal jumps you to now; so does this.
  const catchUp = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stuck.current = true;
    setBehind(0);
    el.scrollTop = el.scrollHeight;
  };

  const tone = (severity: LedgerSeverity) =>
    severity === "deny"
      ? denyColor
      : severity === "warn"
        ? warnColor
        : severity === "ok"
          ? accentColor
          : "var(--sg-ink-mute)";

  const blocks = useMemo(() => {
    const out: Array<{ key: string; source: string; severity: LedgerSeverity; rows: Row[] }> =
      [];
    for (const row of rows) {
      const head = out[out.length - 1];
      if (group && head && head.key === `g${row.run}`) {
        head.rows.push(row);
        // A group wears its worst news. Folding a denial in among four routine
        // reads and leaving the block marked "info" is how a log hides the one
        // line that mattered.
        if (RANK[row.entry.severity] > RANK[head.severity]) {
          head.severity = row.entry.severity;
        }
        continue;
      }
      out.push({
        key: group ? `g${row.run}` : row.key,
        source: row.entry.source,
        severity: row.entry.severity,
        rows: [row],
      });
    }
    return out;
  }, [rows, group]);

  const newest = rows[rows.length - 1];
  const running = !halted && !done && rows.length > 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border border-hairline bg-panel",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-3 py-2">
        <motion.span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: running ? accentColor : "var(--sg-ink-mute)" }}
          animate={running ? { opacity: [1, 0.25, 1], scale: [1, 0.72, 1] } : { opacity: 1, scale: 1 }}
          transition={
            running
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
          aria-hidden
        />
        <span className="font-display text-[10px] tracking-[0.24em] text-ink-mute uppercase">
          {running ? "live" : done ? "complete" : "held"}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-mute/70">
          {rows.length} shown
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Fades the oldest line into the top edge so the window reads as a
            view onto a longer log rather than as the whole of it. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-panel to-transparent"
          aria-hidden
        />

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className={cn(
            "h-full overflow-y-auto overscroll-contain",
            compact ? "px-3 py-2" : "px-4 py-3",
          )}
          // Scroll anchoring is the browser trying to help, and here it is
          // actively wrong: it nudges scrollTop whenever content above the
          // viewport changes, which in a window that drops its oldest event on
          // every arrival is constant. Measured it dragging a freshly pinned
          // log back up 673px over two seconds. This component decides where
          // the scroll sits; nothing else may.
          style={{ overflowAnchor: "none" }}
          // Assertive would interrupt a screen reader on every event, which for
          // a log arriving twice a second is unusable. Polite lets it finish
          // the sentence it is on.
          aria-live="polite"
          aria-label="Agent activity"
        >
          {/* No AnimatePresence, and no `layout` on these blocks. Both were
              here and both had to go: an exit keeps the departing block in flow
              while it fades, and a layout animation slides every survivor up as
              it leaves — while the pin below is simultaneously subtracting that
              same height from scrollTop. The two corrections land on different
              frames and the whole window wobbles. Measured at a fast cadence,
              content height sawtoothed between 544px and 1010px.
              The oldest event leaves under the fade mask at the top edge, where
              an animation would not have been visible anyway. */}
          {blocks.map((block) => (
            <motion.div
              key={block.key}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
              }
              className={cn("border-l-2 pl-2.5", compact ? "mb-1.5" : "mb-2.5")}
              style={{ borderColor: tone(block.severity) }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-display tracking-[0.18em] uppercase",
                    compact ? "text-[9px]" : "text-[10px]",
                  )}
                  style={{ color: tone(block.severity) }}
                >
                  {block.source}
                </span>
                {block.rows.length > 1 ? (
                  <span className="font-mono text-[10px] tabular-nums text-ink-mute/70">
                    &times;{block.rows.length}
                  </span>
                ) : null}
                {showTimestamps ? (
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-mute/60">
                    +{block.rows[0].stamp.toFixed(1)}s
                  </span>
                ) : null}
              </div>

              {block.rows.map((row) => {
                const typing = !done && row.key === newest?.key;
                const text = typing ? row.entry.text.slice(0, chars) : row.entry.text;
                return (
                  <p
                    key={row.key}
                    className={cn(
                      "font-mono leading-relaxed wrap-break-word text-ink-dim",
                      compact ? "text-[11px]" : "text-[12px]",
                    )}
                  >
                    {text}
                    {/* The full string is always in the accessibility tree even
                        while the visible slice is short — Ctrl+F and a screen
                        reader get the event immediately, and only the eye waits
                        for the typing. */}
                    {typing && text.length < row.entry.text.length ? (
                      <span className="sr-only">{row.entry.text.slice(chars)}</span>
                    ) : null}
                    {typing && caret && !halted ? (
                      <motion.span
                        className="ml-px inline-block h-[1em] w-[0.5em] translate-y-[0.15em]"
                        style={{ backgroundColor: accentColor }}
                        animate={{ opacity: [1, 1, 0, 0] }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        aria-hidden
                      />
                    ) : null}
                  </p>
                );
              })}
            </motion.div>
          ))}
        </div>

        <AnimatePresence>
          {behind > 0 ? (
            <motion.button
              type="button"
              onClick={catchUp}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
              className="absolute inset-x-0 bottom-2 z-20 mx-auto w-fit rounded-full px-3 py-1 font-display text-[10px] tracking-[0.16em] text-on-accent uppercase shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              style={{ backgroundColor: accentColor }}
            >
              {behind} new &darr;
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
