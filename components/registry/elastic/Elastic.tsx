"use client";

import { useRef, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { cn } from "@/lib/utils";

// Grab the top card and throw it. It does not stop where you let go — the speed you
// released it at is handed straight to the spring, so a flick overshoots and settles
// while a slow drag just eases home. Catch it mid-flight and it redirects from
// wherever it currently is, at whatever speed it currently has.
//
// The cards behind it lag slightly and settle late: follow-through, which is what
// makes a stack feel like it has weight rather than being three divs.
//
// Drag-driven, so `touch-none` is set inline on the card. Motion sets touch-action
// itself, but the customer copies this file, not the library's internals.
export interface ElasticProps {
  /** Card faces, front first. */
  items?: ReactNode[];
  className?: string;
  /** How strongly the spring pulls home. Higher is snappier. */
  stiffness?: number;
  /** How fast it settles. Lower overshoots and oscillates. */
  damping?: number;
  /** How heavy the card feels. More mass is slower and more sluggish. */
  mass?: number;
  /** How far the card may travel from home, in px. */
  bounds?: number;
  /** Give past the bounds, 0 (hard wall) → 1 (loose). */
  rubberBand?: number;
  /** Multiplier on the release velocity handed to the spring. */
  flickPower?: number;
  /** How many cards in the stack. */
  cards?: number;
  /** When true, the card returns on a short tween with no overshoot or rotation. */
  reducedMotion?: boolean;
}

export default function Elastic({
  items = [],
  className,
  stiffness = 320,
  damping = 22,
  mass = 1,
  bounds = 140,
  rubberBand = 0.45,
  flickPower = 1,
  cards = 3,
  reducedMotion = false,
}: ElasticProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rotation is derived from displacement rather than animated separately, so it
  // stays in lockstep with the card no matter how the motion is interrupted.
  const rotate = useTransform(x, [-bounds, bounds], [-9, 9], { clamp: true });
  // The stack behind moves a fraction as far — parallax within the component.
  const trail = useTransform(x, [-bounds, bounds], [-10, 10], { clamp: true });

  const settle = (info: PanInfo) => {
    const spring = reducedMotion
      ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
      : { type: "spring" as const, stiffness, damping, mass };

    // The whole point: carry the release velocity into the spring instead of
    // starting it from rest. Without this the card decelerates to a stop and then
    // begins a separate, unrelated-looking animation home.
    animate(x, 0, {
      ...spring,
      ...(reducedMotion ? {} : { velocity: info.velocity.x * flickPower }),
    });
    animate(y, 0, {
      ...spring,
      ...(reducedMotion ? {} : { velocity: info.velocity.y * flickPower }),
    });
  };

  const stack = items.slice(0, Math.max(1, cards));
  const behind = stack.slice(1);

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      ref={dragRef}
    >
      {/* Back of the stack, furthest first so the front one paints on top. */}
      {behind
        .map((face, i) => ({ face, depth: behind.length - i }))
        .reverse()
        .map(({ face, depth }) => (
          <BackCard
            key={`behind-${depth}`}
            trail={trail}
            depth={depth}
            total={behind.length}
            still={reducedMotion}
          >
            {face}
          </BackCard>
        ))}

      {/* The card you actually throw. */}
      <motion.div
        drag
        dragConstraints={{
          left: -bounds,
          right: bounds,
          top: -bounds,
          bottom: bounds,
        }}
        dragElastic={rubberBand}
        dragMomentum={false}
        onDragEnd={(_, info) => settle(info)}
        whileDrag={{ cursor: "grabbing" }}
        style={{ x, y, rotate: reducedMotion ? 0 : rotate }}
        className="relative z-10 cursor-grab touch-none will-change-transform"
      >
        {stack[0]}
      </motion.div>
    </div>
  );
}

// One component per card back so each owns its own useTransform — deriving them in
// the parent's map would call a hook inside a loop.
//
// The deeper a card sits, the less of the front card's trail it inherits, which is
// what reads as follow-through rather than a rigid stack sliding as one block.
function BackCard({
  children,
  trail,
  depth,
  total,
  still,
}: {
  children: ReactNode;
  trail: MotionValue<number>;
  depth: number;
  total: number;
  still: boolean;
}) {
  const x = useTransform(trail, (t) => t * (1 - depth / (total + 1)));

  return (
    <motion.div
      aria-hidden
      className="absolute will-change-transform"
      style={{
        x: still ? 0 : x,
        scale: 1 - depth * 0.05,
        y: depth * 14,
        opacity: 1 - depth * 0.22,
      }}
    >
      {children}
    </motion.div>
  );
}
