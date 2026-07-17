"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useInView, useReducedMotion } from "motion/react";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const LightRays = dynamic(() => import("@/components/registry/light-rays/LightRays"), {
  ssr: false,
});

// Sealed-archive band. LightRays burns behind server-rendered content, mounts
// near the viewport, and stills (speed 0) when offscreen or reduced motion —
// with the hero Threads paused by then, at most one WebGL context animates.
export default function ProSection({
  raysColor,
  children,
}: {
  raysColor: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "300px 0px" });
  const reduce = useReducedMotion() ?? false;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (inView) setMounted(true);
  }, [inView]);

  return (
    <section ref={ref} className="exhibit-plate relative overflow-hidden">
      {mounted ? (
        <div className="absolute inset-0 opacity-60" aria-hidden>
          <PreviewBoundary slug="light-rays" label="LightRays" variant="silent">
            <LightRays
              raysColor={raysColor}
              raysSpeed={inView && !reduce ? 1 : 0}
              pulsating={false}
              followMouse={false}
              lightSpread={0.9}
              rayLength={1.8}
              noiseAmount={0.08}
              distortion={0.2}
            />
          </PreviewBoundary>
        </div>
      ) : null}
      <div className="relative z-10">{children}</div>
    </section>
  );
}
