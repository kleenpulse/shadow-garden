"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// An undo history you can scrub, and that does not throw the future away.
//
// Every undo stack in every application destroys the redo branch the moment you
// act from a past state. It is the correct engineering trade and it is a lie
// about what happened: the work existed, you were standing in front of it, and
// it vanished with no record. This draws it instead — the abandoned future stays
// on the rail as a dimmer branch you can walk back onto.
//
// The component is **controlled**, in the same shape as `ledger` and
// `diff-review`: it owns the rail, the gesture, the spring and the branch graph,
// and the caller owns the states. That split is deliberate. A version with the
// demo baked in would hand every buyer a board they have to delete before they
// can wire it to their own reducer, and the reusable part — the scrubbing and
// the branch model — is the part that is actually hard.
//
// Two details carry the interaction.
//
// **The head is a motion value, not React state.** A drag writes it on every
// pointer event; only the caller's index, which changes at most once per state,
// goes through React. Mirroring the spring into state instead would re-render
// the whole rail sixty times a second to move one marker.
//
// **The rail is measured per gesture, never cached and never observed.** A fresh
// getBoundingClientRect on pointerdown is one call, is correct across a resize
// or a scroll that happened in between, and needs no ResizeObserver at all.
export type RewindOrientation = "horizontal" | "vertical";
export type RewindTicks = "sparse" | "even" | "all";

export interface RewindNode {
  id: string;
  label: string;
}

export interface RewindBranch {
  /** Index on the trunk this future was abandoned at. */
  at: number;
  nodes: RewindNode[];
}

interface RewindProps {
  /** The trunk, oldest first. */
  nodes?: RewindNode[];
  /** Abandoned futures, newest first. */
  branches?: RewindBranch[];
  /** Where the head is. */
  index?: number;
  /** The head moved. Fires continuously through a drag, not on release. */
  onScrub?: (index: number) => void;
  /** A branch was chosen. */
  onEnterBranch?: (branch: number) => void;
  /** Which axis the rail runs on. */
  orientation?: RewindOrientation;
  /** Lock the head to the nearest recorded state while dragging. */
  scrubSnap?: boolean;
  /** Draw abandoned futures instead of discarding them. */
  branching?: boolean;
  /** How many branches stay drawn before the oldest is folded away. */
  branchDepth?: number;
  /** Spring tension on the head. */
  stiffness?: number;
  /** Spring friction on the head. */
  damping?: number;
  /** How many states the rail actually draws. */
  tickDensity?: RewindTicks;
  /** Show the action name and position under the rail. */
  showLabels?: boolean;
  /** Thickness of the rail. */
  railHeight?: number;
  /** The trunk, the head, and the travelled portion. */
  accentColor?: string;
  /** Abandoned branches. */
  branchColor?: string;
  /** No spring and no travel. Every position is still reachable. */
  reducedMotion?: boolean;
  className?: string;
}

const EMPTY: RewindNode[] = [];
const NO_BRANCHES: RewindBranch[] = [];

export default function Rewind({
  nodes = EMPTY,
  branches = NO_BRANCHES,
  index = 0,
  onScrub,
  onEnterBranch,
  orientation = "horizontal",
  scrubSnap = true,
  branching = true,
  branchDepth = 3,
  stiffness = 420,
  damping = 34,
  tickDensity = "even",
  showLabels = true,
  railHeight = 4,
  accentColor = "#a855f7",
  branchColor = "#f0a830",
  reducedMotion = false,
  className,
}: RewindProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const vertical = orientation === "vertical";
  const last = Math.max(0, nodes.length - 1);
  const clamped = Math.max(0, Math.min(last, index));

  const raw = useMotionValue(last === 0 ? 0 : clamped / last);
  const sprung = useSpring(raw, { stiffness, damping, mass: 0.6 });
  // Every hook above runs unconditionally; only which value is *read* depends on
  // the prop. Choosing between them with a hook call inside a branch is how a
  // component acquires a hook-order crash the first time a control is toggled.
  const head = reducedMotion ? raw : sprung;
  const offset = useTransform(head, (v) => `${(v * 100).toFixed(3)}%`);

  useEffect(() => {
    if (dragging) return;
    raw.set(last === 0 ? 0 : clamped / last);
  }, [clamped, last, dragging, raw]);

  const fractionFrom = (event: React.PointerEvent<HTMLDivElement>): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const box = rail.getBoundingClientRect();
    const span = vertical ? box.height : box.width;
    if (span <= 0) return 0;
    const along = vertical ? event.clientY - box.top : event.clientX - box.left;
    return Math.max(0, Math.min(1, along / span));
  };

  const apply = (fraction: number) => {
    const next = Math.max(0, Math.min(last, Math.round(fraction * last)));
    raw.set(scrubSnap ? (last === 0 ? 0 : next / last) : fraction);
    if (next !== clamped) onScrub?.(next);
  };

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (nodes.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    apply(fractionFrom(event));
  };
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) apply(fractionFrom(event));
  };
  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Settle onto a real state. Without this a non-snapping scrub leaves the
    // head between two entries, pointing at a moment that never existed.
    raw.set(last === 0 ? 0 : clamped / last);
  };

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const back = vertical ? "ArrowUp" : "ArrowLeft";
    const forward = vertical ? "ArrowDown" : "ArrowRight";
    const go = (to: number) => {
      event.preventDefault();
      onScrub?.(Math.max(0, Math.min(last, to)));
    };
    if (event.key === back) go(clamped - 1);
    else if (event.key === forward) go(clamped + 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(last);
  };

  // `all` is truthful and unreadable past about sixty entries, so the default
  // samples the rail at a fixed pitch and leaves the true count in the label.
  const stride =
    tickDensity === "all"
      ? 1
      : Math.max(1, Math.ceil(nodes.length / (tickDensity === "even" ? 24 : 10)));

  const shown = branching ? branches.slice(0, Math.max(1, branchDepth)) : [];
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100);

  /** A branch is drawn on the trunk's scale, but a branch longer than what is
   *  left of the trunk would run off the end of the rail and read as a second
   *  timeline rather than a discarded piece of this one. Clamped to the rail:
   *  it under-states a very long abandoned future, and the step count is on the
   *  hover title for anyone who needs the real number. */
  const branchSpan = (branch: RewindBranch) =>
    Math.max(5, Math.min(100 - pct(branch.at), (branch.nodes.length / Math.max(1, last)) * 100));

  return (
    <div
      className={cn(
        "flex select-none",
        vertical ? "h-full flex-row gap-5" : "w-full flex-col gap-3",
        className,
      )}
    >
      <div className={cn("relative", vertical ? "h-full" : "w-full")}>
        <div
          ref={railRef}
          role="slider"
          tabIndex={0}
          aria-label="History position"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={clamped}
          aria-valuetext={nodes[clamped]?.label ?? "empty"}
          aria-orientation={orientation}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          // touch-none because the drag IS the component: without it a finger
          // scrolls the page instead of scrubbing, and the gesture never starts.
          className={cn(
            "relative cursor-pointer touch-none rounded-full bg-raised outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            vertical ? "mx-auto h-full" : "w-full",
          )}
          style={vertical ? { width: railHeight } : { height: railHeight }}
        >
          {vertical ? (
            <motion.span
              aria-hidden
              className="absolute top-0 left-0 block w-full rounded-full"
              style={{ backgroundColor: accentColor, height: offset }}
            />
          ) : (
            <motion.span
              aria-hidden
              className="absolute top-0 left-0 block h-full rounded-full"
              style={{ backgroundColor: accentColor, width: offset }}
            />
          )}

          {nodes.map((node, i) =>
            i % stride === 0 || i === last ? (
              <span
                key={node.id}
                aria-hidden
                className="absolute block rounded-full bg-ink-mute"
                style={{
                  width: 3,
                  height: 3,
                  opacity: i <= clamped ? 0 : 0.8,
                  transform: "translate(-50%, -50%)",
                  ...(vertical
                    ? { top: `${pct(i)}%`, left: "50%" }
                    : { left: `${pct(i)}%`, top: "50%" }),
                }}
              />
            ) : null,
          )}

          <motion.span
            aria-hidden
            className="absolute block rounded-full border-2 bg-surface shadow-lg"
            style={{
              width: 14,
              height: 14,
              borderColor: accentColor,
              transform: "translate(-50%, -50%)",
              ...(vertical ? { top: offset, left: "50%" } : { left: offset, top: "50%" }),
            }}
          />
        </div>

        {/* Abandoned futures. Each starts where it was left and runs its own
            length, so one glance says both when you turned away and how much you
            turned away from. */}
        {shown.map((branch, b) => (
          <button
            key={`${branch.at}-${b}-${branch.nodes.length}`}
            type="button"
            onClick={() => onEnterBranch?.(b)}
            title={`Abandoned future · ${branch.nodes.length} step${branch.nodes.length === 1 ? "" : "s"}`}
            aria-label={`Return to an abandoned future of ${branch.nodes.length} steps`}
            className="absolute rounded-full opacity-50 transition-opacity hover:opacity-100"
            style={{
              backgroundColor: branchColor,
              ...(vertical
                ? {
                    width: railHeight,
                    left: `calc(50% + ${(b + 1) * 11}px)`,
                    top: `${pct(branch.at)}%`,
                    height: `${branchSpan(branch)}%`,
                  }
                : {
                    height: railHeight,
                    top: `calc(50% + ${(b + 1) * 10}px)`,
                    left: `${pct(branch.at)}%`,
                    width: `${branchSpan(branch)}%`,
                  }),
            }}
          />
        ))}
      </div>

      {showLabels ? (
        <div
          className={cn(
            "flex gap-2 font-display text-[10px] tracking-[0.18em] uppercase",
            vertical ? "flex-col" : "items-baseline justify-between",
            shown.length > 0 && !vertical ? "pt-3" : "",
          )}
        >
          <span className="text-ink-dim">{nodes[clamped]?.label ?? "—"}</span>
          <span className="tabular-nums text-ink-mute">
            {nodes.length === 0 ? "0 / 0" : `${clamped + 1} / ${nodes.length}`}
            {clamped < last ? " · in the past" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}
