"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ExhibitState {
  /** True while the frame is near the viewport and motion is allowed. */
  active: boolean;
  /**
   * Visibility alone, independent of the motion preference. `active` is already
   * false for the whole session under reduced motion, so it can't answer
   * "has this scrolled away?" — which δ needs to hand a taken-over exhibit back
   * to its reel.
   */
  inView: boolean;
  reducedMotion: boolean;
}

// Shared mount/pause gate for heavy exhibits. The child chunk mounts once when
// the frame first approaches the viewport, then its animation follows `active`
// so offscreen exhibits stop burning frames. `plate` pins the surface to
// graphite in both themes (WebGL/glow visuals are only legible on dark).
export default function ExhibitFrame({
  children,
  className,
  plate = false,
}: {
  children: (state: ExhibitState) => ReactNode;
  className?: string;
  plate?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "300px 0px" });
  const reduce = useReducedMotion() ?? false;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (inView) setMounted(true);
  }, [inView]);

  return (
    <div
      ref={ref}
      // dir="ltr": exhibits are live component demos — they render as
      // authored regardless of the page's direction.
      dir="ltr"
      className={cn(
        "relative overflow-hidden rounded-lg border border-hairline",
        plate ? "exhibit-plate" : "bg-panel",
        className,
      )}
    >
      {mounted
        ? children({ active: inView && !reduce, inView, reducedMotion: reduce })
        : null}
    </div>
  );
}
