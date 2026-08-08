"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A wrapping marquee whose drift speed — and direction — follow scroll
 * velocity: scroll velocity springs into a multiplier on the base drift, so a
 * fast scroll whips the row along and scrolling upward reverses it.
 *
 * The row drifts at `velocity` while the page is still. Scrolling adds a
 * multiplier on top, smoothed by a spring so the row eases in and out of speed
 * instead of snapping to raw scroll deltas.
 */

export interface VelocityMapping {
  /**
   * Downward scroll speed in px/s, as `[slow, fast]`. Defaults to
   * `[0, 1000]`.
   */
  input: [number, number];
  /**
   * Drift multipliers the input range maps onto, as `[atSlow, atFast]`.
   * Defaults to `[0, 5]` — a 1000px/s scroll runs the row at 6x `velocity`,
   * since the resting drift is the 1 this adds to. Only the magnitude is used;
   * scroll *direction* is read off the raw scroll, not off this.
   *
   * Unclamped on purpose, so a harder flick overshoots the top of the range
   * rather than flattening out at it.
   */
  output: [number, number];
}

export interface MarqueeVelocityProps {
  /**
   * One cycle of row content, tiled edge to edge to fill the loop. Give it its
   * own trailing spacing — the seam between copies is not gapped for you.
   */
  children: ReactNode;
  /**
   * Resting drift in px/s, before scroll multiplies it. Positive starts the row
   * moving right, negative moves it left, `0` leaves it still until a scroll
   * pushes it. Sign sets the *starting* direction only — an upward scroll
   * inverts it and the row keeps drifting that way until you scroll down
   * again.
   */
  velocity?: number;
  /**
   * Friction on the velocity spring. Low overshoots and rebounds after the
   * scroll stops; high settles dead but reacts lazily. Critical damping is
   * `2 * sqrt(stiffness)` — at or just above it, the row never wobbles. Only
   * the drift speed rides this spring, so an underdamped value ripples the
   * speed without ever throwing the direction.
   */
  damping?: number;
  /**
   * How hard the velocity spring pulls toward the current scroll speed. High
   * tracks the scroll almost instantly; low lags behind it and keeps coasting
   * after the scroll stops, which reads as weight.
   */
  stiffness?: number;
  /**
   * Minimum copies tiled into the loop. Treated as a floor — narrow content
   * gets more copies so the wrap never sweeps a gap through the container.
   */
  numCopies?: number;
  /** Scroll-to-drift mapping; see {@link VelocityMapping}. */
  velocityMapping?: VelocityMapping;
  /**
   * Scrollable ancestor whose scrolling drives the drift. Tracks the window
   * when omitted.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /**
   * Parks the row regardless of OS setting. The OS reduced-motion preference
   * is already honored on its own; this only forces it on.
   */
  reducedMotion?: boolean;
  /** Classes on the moving row — set type, color and copy spacing here. */
  className?: string;
  /**
   * Classes on the clipping wrapper — sizing, masks and edge fades go here,
   * not on the row.
   */
  containerClassName?: string;
  /** Inline styles on the clipping wrapper. */
  style?: CSSProperties;
}

// Fractional width — offsetWidth rounds to integers, and the rounding error
// would show as a per-wrap jump at the loop seam.
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// px/s of scroll below which the direction latch ignores the signal — floating
// point noise around a stopped scroll, never a real gesture.
const DIRECTION_DEADZONE = 1;

function wrap(min: number, max: number, v: number): number {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
}

export default function MarqueeVelocity({
  children,
  velocity = 50,
  damping = 50,
  stiffness = 400,
  numCopies = 6,
  velocityMapping = { input: [0, 1000], output: [0, 5] },
  scrollContainerRef,
  reducedMotion = false,
  className,
  containerClassName,
  style,
}: MarqueeVelocityProps) {
  const [osReduced, setOsReduced] = useState(false);

  // Computed in an effect so the pre-render never touches `window`.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const reduce = osReduced || reducedMotion;

  const baseX = useMotionValue(0);
  const { scrollY } = useScroll(
    scrollContainerRef ? { container: scrollContainerRef } : {},
  );
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping, stiffness });
  const velocityFactor = useTransform(
    smoothVelocity,
    velocityMapping.input,
    velocityMapping.output,
    { clamp: false },
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const wrapperWidth = useElementWidth(wrapperRef);
  const copyRef = useRef<HTMLSpanElement>(null);
  const copyWidth = useElementWidth(copyRef);

  // `numCopies` is a floor: with narrow content the wrap extreme (x at
  // -copyWidth) would pull the row's tail inside the container and sweep a
  // gap through every cycle, so tile however many copies coverage needs.
  const effectiveCopies =
    copyWidth > 0 && wrapperWidth > 0
      ? Math.max(numCopies, Math.ceil(wrapperWidth / copyWidth) + 2)
      : numCopies;

  const x = useTransform(baseX, (v) =>
    copyWidth === 0 ? "0px" : `${wrap(-copyWidth, 0, v)}px`,
  );

  // Direction latches off the raw scroll velocity; speed comes from the
  // spring. Taking the sign from the spring instead is what caused the row to
  // reverse on its own: a spring overshoots as it settles, so the tail of a
  // *downward* scroll dips the smoothed value below zero for a fraction of a
  // second and a `< 0` test reads that as a full reversal. Raw velocity is a
  // finite difference of scroll position — it cannot ring, and it reads 0 the
  // instant scrolling stops, which is what leaves the last direction latched
  // while the row drifts at rest.
  const directionFactor = useRef(1);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const raw = scrollVelocity.get();
    if (raw > DIRECTION_DEADZONE) directionFactor.current = 1;
    else if (raw < -DIRECTION_DEADZONE) directionFactor.current = -1;
    const boost = 1 + Math.abs(velocityFactor.get());
    const step = directionFactor.current * velocity * (delta / 1000) * boost;
    baseX.set(baseX.get() + step);
  });

  const copies = [];
  for (let i = 0; i < effectiveCopies; i++) {
    copies.push(
      <span
        key={i}
        ref={i === 0 ? copyRef : null}
        className="flex shrink-0 items-center"
      >
        {children}
      </span>,
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative overflow-hidden", containerClassName)}
      style={style}
    >
      <motion.div
        className={cn("flex items-center whitespace-nowrap", className)}
        style={{ x }}
      >
        {copies}
      </motion.div>
    </div>
  );
}
