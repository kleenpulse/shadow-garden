"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

// A one-shot amethyst star burst for confirming a copy. Modelled on the ripple in
// components/registry/magnetic-button: transient elements keyed by a ref counter,
// each removing itself on animation end so the array can never grow.
//
// Split into a hook plus a renderer on purpose. The burst is fired from a click
// handler, which is where a state update belongs — driving it from an effect on a
// trigger prop would trip react-hooks/set-state-in-effect and fire a frame late.
//
// Reduced motion suppresses the sparks entirely rather than shortening them: the
// global CSS backstop in globals.css only reaches CSS animations, so a JS-driven
// burst is invisible to it and has to gate itself. The caller's label swap still
// happens, so the confirmation is never lost — only the decoration.

const COUNT = 12;
/** Golden angle — spreads N points around a circle without visible clumping. */
const GOLDEN = 137.5;
const TONES = [
  "text-accent",
  "text-accent",
  "text-accent-hover",
  "text-ink-mute",
];

interface Spark {
  id: number;
  dx: number;
  dy: number;
  size: number;
  spin: number;
  delay: number;
  duration: number;
  tone: string;
}

function batch(startId: number): Spark[] {
  const base = Math.random() * 360;
  return Array.from({ length: COUNT }, (_, i) => {
    const jitter = (Math.random() - 0.5) * 24;
    const angle = ((base + i * GOLDEN + jitter) * Math.PI) / 180;
    const distance = 18 + Math.random() * 16;
    return {
      id: startId + i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 6 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 180,
      delay: Math.random() * 0.06,
      duration: 0.52 + Math.random() * 0.24,
      tone: TONES[i % TONES.length] ?? "text-accent",
    };
  });
}

export function useSparkleBurst() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const nextId = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  const burst = useCallback(() => {
    if (reducedMotion) return;
    const next = batch(nextId.current);
    nextId.current += COUNT;
    // Append, don't replace: a second click mid-flight adds a burst rather than
    // yanking the first one off screen.
    setSparks((prev) => [...prev, ...next]);
  }, [reducedMotion]);

  const settle = useCallback((id: number) => {
    setSparks((prev) => prev.filter((spark) => spark.id !== id));
  }, []);

  return { sparks, burst, settle };
}

/**
 * Renders the live sparks. Sits at the centre of a `relative` parent — and that
 * parent must NOT be `overflow-hidden`, since unlike a ripple these are meant to
 * escape the box.
 */
export default function SparkleBurst({
  sparks,
  onSettle,
}: {
  sparks: Spark[];
  onSettle: (id: number) => void;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute start-1/2 top-1/2 z-20 block h-0 w-0"
    >
      <AnimatePresence>
        {sparks.map((spark) => (
          <motion.span
            key={spark.id}
            className={cn("absolute block", spark.tone)}
            style={{
              width: spark.size,
              height: spark.size,
              marginLeft: -spark.size / 2,
              marginTop: -spark.size / 2,
            }}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.2, 1, 0.3],
              x: spark.dx,
              y: spark.dy,
              rotate: spark.spin,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              ease: "easeOut",
            }}
            onAnimationComplete={() => onSettle(spark.id)}
          >
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
              <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12 6.627 0 12-5.373 12-12z" />
            </svg>
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
