"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Press and hold anywhere on the surface and the options fan out from the point
// you pressed. Keep dragging and the fan tracks you; release on one and it
// commits; release in the middle and nothing happens.
//
// The selection is resolved from the pointer's ANGLE, not by hit-testing the
// items. That is the whole design: a radial menu's advantage over a list is that
// every target is an infinite wedge rather than a small rectangle, so once you
// have committed to a direction you can throw the pointer as far and as fast as
// you like and still land. Hit-testing the DOM gives that up and turns the fan
// back into seven small buttons arranged in a circle — which is strictly worse
// than a list, because at least a list is aligned.
//
// The dead zone at the centre is not a nicety either. Without it, a press that
// never really moves still resolves to whichever item happens to sit nearest the
// jitter, and the menu commits to something you never chose. Below
// `centerCancel` px there is no selection at all.
//
// Keyboard is a first-class path, not a fallback: a keyboard has no "hold", so
// Enter opens immediately, the arrows walk the fan, and Escape closes. The
// commit runs through the same function the pointer uses.

export interface RadialMenuItem {
  key: string;
  label: string;
  /** Any icon node. Falls back to the label's first character. */
  icon?: ReactNode;
  onSelect?: () => void;
}

export interface RadialMenuProps {
  /** Options to fan out, in order. */
  items?: RadialMenuItem[];
  /** What sits under the press surface. */
  children?: ReactNode;
  className?: string;
  /** Distance from the press point to each option, in px. */
  radius?: number;
  /** Angle of the first option in degrees. 0 is right, 90 is down. */
  startAngle?: number;
  /** Total arc the options are spread across, in degrees. */
  sweep?: number;
  /** How many of `items` to show. */
  itemCount?: number;
  /** How long the press has to be held before the fan opens, in ms. */
  holdDelay?: number;
  /** Delay between one option arriving and the next, in seconds. */
  stagger?: number;
  /** Spring stiffness of the fan-out. */
  stiffness?: number;
  /** Spring damping of the fan-out. */
  damping?: number;
  /** Radius of the central dead zone, in px. Release inside it cancels. */
  centerCancel?: number;
  /** Highlight colour of the option the pointer is aimed at. */
  accent?: string;
  /** Skip the fan-out spring and the stagger — options simply appear in place. */
  reducedMotion?: boolean;
}

const TO_RAD = Math.PI / 180;

/** Edge length of one option, in px. Needed as a number, not a class, because
 *  each option is centred on its own angle by pulling half of it back. */
const OPTION_SIZE = 44;

/** Shortest signed distance between two angles, in degrees. */
function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export default function RadialMenu({
  items = [],
  children,
  className,
  radius = 96,
  startAngle = 180,
  sweep = 180,
  itemCount = 6,
  holdDelay = 220,
  stagger = 0.03,
  stiffness = 380,
  damping = 26,
  centerCancel = 28,
  accent = "#a855f7",
  reducedMotion = false,
}: RadialMenuProps) {
  const surface = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [hot, setHot] = useState<number | null>(null);

  const visible = items.slice(0, Math.max(1, itemCount));
  const count = visible.length;

  // A full turn has no gap to bridge, so the last option must not land on top of
  // the first. Anything short of one is an arc with two open ends and wants an
  // option at each of them.
  const step = sweep >= 359 ? sweep / count : sweep / Math.max(1, count - 1);

  const angleOf = useCallback(
    (index: number) => startAngle + step * index,
    [startAngle, step],
  );

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // A hold timer that outlives the component would open a menu on a surface that
  // no longer exists.
  useEffect(() => clearHold, [clearHold]);

  const close = useCallback(() => {
    clearHold();
    setOrigin(null);
    setHot(null);
  }, [clearHold]);

  const commit = useCallback(
    (index: number | null) => {
      if (index !== null) visible[index]?.onSelect?.();
      close();
    },
    [visible, close],
  );

  /** Which option the pointer is aimed at, or null for "none of them". */
  const resolve = useCallback(
    (dx: number, dy: number): number | null => {
      if (Math.hypot(dx, dy) < centerCancel) return null;
      const pointing = Math.atan2(dy, dx) / TO_RAD;

      let best: number | null = null;
      let bestDelta = Infinity;
      for (let index = 0; index < count; index++) {
        const delta = Math.abs(angleDelta(pointing, angleOf(index)));
        if (delta < bestDelta) {
          bestDelta = delta;
          best = index;
        }
      }
      // A whole step of tolerance rather than half. Half is the geometrically
      // "correct" wedge and it makes the two options at the ends of an arc feel
      // like they have half the target the middle ones do — aim slightly past
      // the last one and the menu cancels instead of committing to the thing you
      // were obviously pointing at.
      return best !== null && bestDelta <= step ? best : null;
    },
    [angleOf, centerCancel, count, step],
  );

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div
      ref={surface}
      tabIndex={0}
      role="button"
      aria-haspopup="menu"
      aria-expanded={origin !== null}
      // `touch-none` only while the menu is armed would be a race — the browser
      // decides whether a gesture is a scroll within the first few frames, which
      // is well inside `holdDelay`. The surface owns its gestures outright.
      className={cn(
        "relative touch-none overflow-hidden rounded-2xl border border-hairline bg-panel outline-none select-none",
        "focus-visible:border-accent",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        const point = localPoint(event);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        clearHold();
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          setOrigin(point);
          setHot(null);
        }, holdDelay);
      }}
      onPointerMove={(event) => {
        if (!origin) return;
        const point = localPoint(event);
        if (!point) return;
        setHot(resolve(point.x - origin.x, point.y - origin.y));
      }}
      onPointerUp={() => {
        // The timer still pending means the press was shorter than `holdDelay`
        // — a plain click on whatever is underneath, not an aborted menu.
        if (holdTimer.current !== null) {
          clearHold();
          return;
        }
        if (origin) commit(hot);
      }}
      onPointerCancel={close}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          close();
          return;
        }
        const commitKey = event.key === "Enter" || event.key === " ";
        if (!origin) {
          if (!commitKey) return;
          // Space scrolls the page by default, and the surface is focusable.
          event.preventDefault();
          const rect = surface.current?.getBoundingClientRect();
          if (!rect) return;
          setOrigin({ x: rect.width / 2, y: rect.height / 2 });
          setHot(0);
          return;
        }
        if (commitKey) {
          event.preventDefault();
          commit(hot);
          return;
        }
        const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
        const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
        if (!forward && !back) return;
        event.preventDefault();
        setHot((current) => {
          const from = current ?? 0;
          return (from + (forward ? 1 : -1) + count) % count;
        });
      }}
    >
      {children}

      <AnimatePresence>
        {origin ? (
          <motion.div
            key="fan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.12 }}
            className="absolute inset-0 z-10 bg-surface/50 backdrop-blur-[2px]"
          >
            {/* The dead zone, drawn. An invisible cancel region is a cancel
                region people trip over — showing it makes "release here for
                nothing" a rule you can see rather than one you discover. */}
            <span
              aria-hidden
              className="absolute rounded-full border border-dashed border-hairline"
              style={{
                left: origin.x - centerCancel,
                top: origin.y - centerCancel,
                width: centerCancel * 2,
                height: centerCancel * 2,
              }}
            />

            <div
              role="menu"
              aria-orientation="horizontal"
              className="absolute"
              style={{ left: origin.x, top: origin.y }}
            >
              {visible.map((item, index) => {
                const radians = angleOf(index) * TO_RAD;
                const active = hot === index;
                return (
                  <motion.button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-label={item.label}
                    aria-current={active ? "true" : undefined}
                    // Everything animates from the press point, so the fan reads
                    // as coming out of your own finger rather than as a panel
                    // that happens to be centred there.
                    initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                    animate={{
                      x: Math.cos(radians) * radius,
                      y: Math.sin(radians) * radius,
                      scale: active ? 1.18 : 1,
                      opacity: 1,
                    }}
                    exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness,
                            damping,
                            delay: index * stagger,
                          }
                    }
                    style={{
                      width: OPTION_SIZE,
                      height: OPTION_SIZE,
                      // Half its own size back on each axis, so the option is
                      // centred on its angle instead of hanging off it.
                      marginLeft: -OPTION_SIZE / 2,
                      marginTop: -OPTION_SIZE / 2,
                      borderColor: active ? accent : undefined,
                      color: active ? accent : undefined,
                    }}
                    className={cn(
                      "absolute flex items-center justify-center rounded-full border bg-raised text-ink-dim",
                      "[&_svg]:h-4 [&_svg]:w-4",
                      active ? "shadow-lg" : "border-hairline",
                    )}
                  >
                    {item.icon ?? (
                      <span className="font-display text-xs leading-none">
                        {item.label.charAt(0)}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* The label of the aimed-at option, parked at the press point. It
                sits in the dead zone because that is the one place on the
                surface the pointer is guaranteed not to be. */}
            <span
              aria-live="polite"
              className="absolute -translate-x-1/2 -translate-y-1/2 font-display text-[10px] tracking-[0.2em] uppercase"
              style={{
                left: origin.x,
                top: origin.y,
                color: hot === null ? undefined : accent,
              }}
            >
              {hot === null ? "" : visible[hot]?.label}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
