"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// A confirm you have to earn. The track fills at a constant rate while the pointer
// is down, and the commit fires on a timer — not on the tween finishing.
// `transitionend` and `animationComplete` do not fire for a cancelled animation, so
// a latch that waits on one strands the control half-armed the first time someone
// lets go early (§V25). The tween is the picture; the timer is the truth.
//
// Letting go rewinds on a different curve AND at a different rate than it filled.
// That asymmetry is the whole idea: filling is work the user is doing, so it is
// linear and honest about how much is left. Releasing is the control giving up,
// so it eases out fast. Same distance, two completely different readings.
//
// Press, not drag — so no `touch-action` here. But the pointer is captured on
// press, which is what lets a finger slide off the control and still cancel
// cleanly instead of leaving the fill stuck at 60%.
export interface HoldProps {
  /** Resting label. */
  label?: ReactNode;
  /** Label shown while the confirmed state is on screen. */
  confirmLabel?: ReactNode;
  /** Total press time before the control commits, in ms. */
  duration?: number;
  /** Where the progress lives: a ring on the glyph, a bar beneath, or the face itself. */
  indicator?: "ring" | "bar" | "fill";
  /** Fraction of the track that counts as committed. */
  threshold?: number;
  /** How much faster a cancelled hold empties than it filled. */
  rewindRate?: number;
  /** Weight of the progress track, in px. */
  strokeWidth?: number;
  /** How far the control sinks under the finger. */
  holdScale?: number;
  /** Overshoot at the instant of commit. */
  commitScale?: number;
  /** Seconds the confirmed state stays on screen before re-arming. */
  successHold?: number;
  /** Filling track and confirmed state. */
  accentColor?: string;
  /** The unfilled remainder. */
  trackColor?: string;
  /** Fired once per commit. */
  onCommit?: () => void;
  /** Drops the commit overshoot, the glow and the success flourish. Never shortens the hold. */
  reducedMotion?: boolean;
  className?: string;
}

export default function Hold({
  label = "Hold to confirm",
  confirmLabel = "Confirmed",
  duration = 1200,
  indicator = "ring",
  threshold = 0.92,
  rewindRate = 2.4,
  strokeWidth = 3,
  holdScale = 0.96,
  commitScale = 1.06,
  successHold = 1.4,
  accentColor = "#a855f7",
  trackColor = "#2a2136",
  onCommit,
  reducedMotion = false,
  className,
}: HoldProps) {
  const [phase, setPhase] = useState<"idle" | "holding" | "committed">("idle");

  const progress = useMotionValue(0);
  const scale = useMotionValue(1);

  // Held separately from `phase` because the pointer stays down through the commit,
  // and a re-press must not restart a hold that is already running. Keyboard repeat
  // fires keydown continuously, which would otherwise re-arm the timer every ~30ms.
  const heldRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillRef = useRef<{ stop: () => void } | null>(null);

  // Every tunable the async paths read is mirrored, so a control dragged mid-hold
  // takes effect on the next transition instead of being captured in a stale closure.
  const live = useRef({ duration, threshold, rewindRate, commitScale, successHold, reducedMotion, onCommit });
  live.current = { duration, threshold, rewindRate, commitScale, successHold, reducedMotion, onCommit };

  const clearTimers = useCallback(() => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  }, []);

  const commit = useCallback(() => {
    clearTimers();
    fillRef.current?.stop();
    setPhase("committed");
    // The last sliver closes itself. Committing a beat before the track visually
    // completes is what makes the press land decisive rather than punctual.
    fillRef.current = animate(progress, 1, { duration: 0.12, ease: [0.16, 1, 0.3, 1] });
    if (!live.current.reducedMotion) {
      animate(scale, live.current.commitScale, { type: "spring", stiffness: 700, damping: 14 }).then(
        () => animate(scale, 1, { type: "spring", stiffness: 320, damping: 24 }),
      );
    }
    live.current.onCommit?.();
    resetTimer.current = setTimeout(() => {
      setPhase("idle");
      progress.set(0);
      scale.set(1);
    }, live.current.successHold * 1000);
  }, [clearTimers, progress, scale]);

  const start = useCallback(() => {
    if (heldRef.current || phase === "committed") return;
    heldRef.current = true;
    setPhase("holding");
    clearTimers();
    fillRef.current?.stop();

    const from = progress.get();
    const { duration: ms, threshold: at } = live.current;
    // Resuming from a partial rewind keeps the same fill *rate*, so a second press
    // is never secretly faster than the first.
    fillRef.current = animate(progress, 1, { duration: ((1 - from) * ms) / 1000, ease: "linear" });
    commitTimer.current = setTimeout(commit, Math.max(0, (at - from) * ms));

    animate(scale, holdScale, { type: "spring", stiffness: 520, damping: 30 });
  }, [clearTimers, commit, holdScale, phase, progress, scale]);

  const release = useCallback(() => {
    heldRef.current = false;
    animate(scale, 1, { type: "spring", stiffness: 420, damping: 26 });
    if (phase !== "holding") return;
    clearTimers();
    fillRef.current?.stop();
    setPhase("idle");

    const from = progress.get();
    const { duration: ms, rewindRate: rate } = live.current;
    fillRef.current = animate(progress, 0, {
      duration: (from * ms) / rate / 1000,
      ease: [0.22, 1, 0.36, 1],
    });
  }, [clearTimers, phase, progress, scale]);

  useEffect(
    () => () => {
      if (commitTimer.current !== null) clearTimeout(commitTimer.current);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      fillRef.current?.stop();
    },
    [],
  );

  const dashOffset = useTransform(progress, (p) => 1 - p);
  const glow = useTransform(progress, (p) => p * 0.55);

  const committed = phase === "committed";
  const ringRadius = 12 - strokeWidth / 2 - 1;

  return (
    <div className={cn("inline-flex flex-col items-stretch gap-2", className)}>
      <motion.button
        type="button"
        style={{ scale }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          if (e.repeat) return;
          start();
        }}
        onKeyUp={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          release();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative isolate flex items-center gap-3 overflow-hidden rounded-full",
          "border border-hairline bg-raised px-5 py-2.5 select-none",
          "font-display text-[11px] tracking-[0.22em] text-ink uppercase",
          "transition-colors duration-200 outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        {/* Face flood. Sits behind the label and clips to the pill. */}
        {indicator === "fill" ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 -z-10 origin-left"
            style={{ scaleX: progress, backgroundColor: accentColor, opacity: 0.22 }}
          />
        ) : null}

        {/* Progress glow. Pure decoration, so it is the first thing reduced motion loses. */}
        {reducedMotion ? null : (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ opacity: glow, boxShadow: `inset 0 0 24px ${accentColor}` }}
          />
        )}

        <span className="relative grid size-6 shrink-0 place-items-center">
          <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
            {/* The track is chrome, so it has to recede on whatever surface the
                control is dropped on. One hex cannot sit close to both a light
                and a dark panel — drawn at full strength this default is subtle
                on graphite and a hard bullseye on white. Holding it back to 45%
                costs nothing in the dark and fixes the light case. */}
            <circle
              cx="12"
              cy="12"
              r={ringRadius}
              fill="none"
              stroke={indicator === "ring" ? trackColor : "transparent"}
              strokeOpacity={0.45}
              strokeWidth={strokeWidth}
            />
            {indicator === "ring" ? (
              <motion.circle
                cx="12"
                cy="12"
                r={ringRadius}
                fill="none"
                stroke={accentColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                style={{ strokeDashoffset: dashOffset }}
              />
            ) : null}
          </svg>
          {/* Check mark, drawn only once committed so nothing hints at the outcome early. */}
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "absolute size-3.5 transition-opacity duration-200",
              committed ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          >
            <path
              d="M4 12.5 9.5 18 20 6"
              fill="none"
              stroke={accentColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span className="relative">{committed ? confirmLabel : label}</span>
      </motion.button>

      {/* Track beneath the control. Rendered at zero height when unused so the
          control never changes size as the indicator is swapped. */}
      <span
        aria-hidden
        className="relative w-full overflow-hidden rounded-full"
        style={{ height: indicator === "bar" ? strokeWidth : 0 }}
      >
        {/* Held back on its own layer, not on the wrapper — dimming the parent
            would take the accent fill down with it. */}
        <span
          className="absolute inset-0"
          style={{
            backgroundColor: indicator === "bar" ? trackColor : "transparent",
            opacity: 0.45,
          }}
        />
        <motion.span
          className="absolute inset-0 origin-left rounded-full"
          style={{ scaleX: progress, backgroundColor: accentColor }}
        />
      </span>

      <span className="sr-only" role="status" aria-live="polite">
        {committed ? "Confirmed" : ""}
      </span>
    </div>
  );
}
