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
 */

export interface VelocityMapping {
  /** Scroll velocity range (px/s) mapped onto the multiplier range. */
  input: [number, number];
  output: [number, number];
}

export interface MarqueeVelocityProps {
  /** Row content, repeated `numCopies` times to fill the loop. */
  children: ReactNode;
  /** Base drift in px/s; negative drifts left-to-right. */
  velocity?: number;
  /** Spring damping on the scroll velocity smoothing. */
  damping?: number;
  /** Spring stiffness on the scroll velocity smoothing. */
  stiffness?: number;
  /** How many copies of the content tile the loop. */
  numCopies?: number;
  velocityMapping?: VelocityMapping;
  /** Scrollable ancestor to track; window when omitted. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Force reduced motion (OS preference is honored automatically). */
  reducedMotion?: boolean;
  /** Classes on the moving row. */
  className?: string;
  /** Classes on the clipping wrapper. */
  containerClassName?: string;
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

  const directionFactor = useRef(1);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    let moveBy = directionFactor.current * velocity * (delta / 1000);
    const factor = velocityFactor.get();
    if (factor < 0) directionFactor.current = -1;
    else if (factor > 0) directionFactor.current = 1;
    moveBy += directionFactor.current * moveBy * factor;
    baseX.set(baseX.get() + moveBy);
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
