"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// A pinned section: the page keeps scrolling down while the content inside travels
// sideways, layered across depth planes that move at different rates.
//
// `layers` runs back → front. Only the front rail is measured; the planes behind it
// derive their travel from that same overflow, scaled down by depth. They are
// decorative strata, and the edge mask hides the couple of pixels that costs — a
// per-layer measure would be more correct and not more convincing.
//
// The ResizeObserver here measures geometry; it does not drive a loop. The scrub
// itself is scroll-driven, which is why the slug sits in NOT_A_LOOP rather than on
// the animation runtime host.
export interface ParallaxRailProps {
  /** Depth planes, backmost first. The last entry is the front rail. */
  layers?: ReactNode[];
  className?: string;
  /** How many of the supplied layers to render. */
  planes?: number;
  /** Multiplier on the front rail's travel across the pin. */
  travel?: number;
  /** How much slower the backmost plane moves than the front, 0 → 1. */
  depthSpread?: number;
  /** Spring damping on the scrub. Lower drifts, higher tracks the scroll exactly. */
  damping?: number;
  /** Width of the soft mask at each rail edge, as a fraction of the viewport. */
  fadeEdges?: number;
  /** Vertical gap between planes, in px. */
  railGap?: number;
  /** Height of the pinned viewport. Defaults to the scroll container, else 100svh. */
  pinHeight?: string;
  /** Scrollable ancestor to track; window when omitted. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** When true, the rails sit still at their start position. */
  reducedMotion?: boolean;
}

export default function ParallaxRail({
  layers = [],
  className,
  planes = 3,
  travel = 1,
  depthSpread = 0.45,
  damping = 30,
  fadeEdges = 0.12,
  railGap = 24,
  pinHeight,
  scrollContainerRef,
  reducedMotion = false,
}: ParallaxRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const portRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const [overflow, setOverflow] = useState(0);
  const [measuredPin, setMeasuredPin] = useState<number | null>(null);

  useEffect(() => {
    const port = portRef.current;
    const rail = railRef.current;
    const scroller = scrollContainerRef?.current ?? null;
    if (!port || !rail) return;

    const measure = () => {
      setOverflow(Math.max(0, rail.scrollWidth - port.clientWidth));
      // Pinning to a bench panel means the sticky child has to match the scroll
      // port in pixels; on a real page CSS handles it and this stays null.
      setMeasuredPin(scroller ? scroller.clientHeight : null);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(port);
    observer.observe(rail);
    if (scroller) observer.observe(scroller);
    measure();
    return () => observer.disconnect();
  }, [scrollContainerRef, planes]);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    ...(scrollContainerRef ? { container: scrollContainerRef } : {}),
    offset: ["start start", "end end"],
  });

  const smooth = useSpring(scrollYProgress, {
    damping,
    stiffness: 220,
    restDelta: 0.0005,
  });

  const visible = layers.slice(0, Math.max(1, planes));
  const depth = Math.max(1, visible.length - 1);

  const mask = `linear-gradient(to right, transparent, #000 ${(fadeEdges * 100).toFixed(1)}%, #000 ${(100 - fadeEdges * 100).toFixed(1)}%, transparent)`;

  return (
    <div ref={trackRef} className={cn("relative", className)}>
      <div
        ref={portRef}
        className="sticky top-0 flex flex-col justify-center overflow-hidden"
        style={{
          height: measuredPin ? `${measuredPin}px` : (pinHeight ?? "100svh"),
          gap: `${railGap}px`,
          ...(fadeEdges > 0
            ? { maskImage: mask, WebkitMaskImage: mask }
            : {}),
        }}
      >
        {visible.map((layer, i) => (
          <Plane
            key={i}
            progress={smooth}
            // Backmost plane is index 0 and travels least.
            factor={1 - depthSpread * ((visible.length - 1 - i) / depth)}
            overflow={overflow}
            travel={travel}
            still={reducedMotion}
            innerRef={i === visible.length - 1 ? railRef : undefined}
          >
            {layer}
          </Plane>
        ))}
      </div>
    </div>
  );
}

function Plane({
  children,
  progress,
  factor,
  overflow,
  travel,
  still,
  innerRef,
}: {
  children: ReactNode;
  progress: ReturnType<typeof useSpring>;
  factor: number;
  overflow: number;
  travel: number;
  still: boolean;
  innerRef?: RefObject<HTMLDivElement | null>;
}) {
  const x = useTransform(progress, [0, 1], [0, -overflow * travel * factor]);

  return (
    <motion.div
      ref={innerRef}
      className="flex w-max shrink-0 items-center will-change-transform"
      style={still ? undefined : { x }}
    >
      {children}
    </motion.div>
  );
}
