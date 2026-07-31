"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
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
// Throw it past `throwThreshold` and it leaves instead of returning: the deck rotates
// on the spot, the next face springs forward out of the stack, and the card you threw
// arcs out and back down into the last slot. The queue is every face, so a five-card
// deck showing three cycles all five.
//
// Drag-driven, so `touch-none` is set inline on the card. Motion sets touch-action
// itself, but the customer copies this file, not the library's internals.
//
// `select-none` on the deck is load-bearing, not tidiness. The faces hold text, and a
// drag across text starts a native selection — then a press that begins on selected
// text starts a native drag-and-drop, and the browser answers with `pointercancel`.
// Motion treats that as the gesture being taken away and abandons it mid-throw, so the
// card stops dead under a cursor that is still moving. Measured: every flick after the
// first accidental text selection cancels this way.

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Seconds of release velocity folded into the throw/return decision, so a fast flick
 *  off a short drag still counts as a throw. Same projection a momentum scroll uses. */
const PROJECTION = 0.16;

/** The thrown card's whole arc: out, then back down into the last slot. */
const FLIGHT = 0.6;

/** Slot geometry. Depth 0 is the card in your hand. */
const slotOf = (depth: number) => ({
  scale: 1 - depth * 0.05,
  y: depth * 14,
  opacity: 1 - depth * 0.22,
});

type Flight = {
  item: number;
  fromX: number;
  fromY: number;
  outX: number;
  outY: number;
  tilt: number;
};

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
  /**
   * Throw distance, in px, past which the card leaves for the back of the deck
   * instead of springing home. Capped at 90% of `bounds` so it stays reachable.
   */
  throwThreshold?: number;
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
  throwThreshold = 90,
  reducedMotion = false,
}: ElasticProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const [queue, setQueue] = useState<number[]>(() => items.map((_, i) => i));
  const [size, setSize] = useState(items.length);
  if (size !== items.length) {
    setSize(items.length);
    setQueue(items.map((_, i) => i));
  }

  // The card in flight is its own element, not the front card mid-animation. That
  // separation is the whole design: the deck rotates the instant you let go, so the
  // face under your cursor is always the live one, centred and upright — it can never
  // be left stranded wherever a throw happened to end.
  const [flight, setFlight] = useState<Flight | null>(null);

  // Rotation is derived from displacement rather than animated separately, so it
  // stays in lockstep with the card no matter how the motion is interrupted.
  const rotate = useTransform(x, [-bounds, bounds], [-9, 9], { clamp: true });
  // The stack behind moves a fraction as far — parallax within the component.
  const trail = useTransform(x, [-bounds, bounds], [-10, 10], { clamp: true });

  const front = queue[0];

  // The incoming face inherits the outgoing one's motion values — both cards read the
  // same two. Resetting in a layout effect lands it after the commit that swaps the
  // face and before the browser paints it; a passive effect gives the new card one
  // painted frame sitting wherever the last throw ended.
  //
  // `jump`, not `set`: a running animation overwrites a `set` on its very next frame.
  useIsomorphicLayoutEffect(() => {
    x.jump(0);
    y.jump(0);
  }, [front, x, y]);

  // One spring for the whole component: the throw home, and the reshuffle behind it.
  // Slacken the damping and the entire stack wobbles together.
  const spring = reducedMotion
    ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
    : { type: "spring" as const, stiffness, damping, mass };

  const settle = (info: PanInfo) => {
    // The whole point: carry the release velocity into the spring instead of
    // starting it from rest. Without this the card decelerates to a stop and then
    // begins a separate, unrelated-looking animation home.
    const carry = (v: number) =>
      reducedMotion ? {} : { velocity: v * flickPower };
    animate(x, 0, { ...spring, ...carry(info.velocity.x) });
    animate(y, 0, { ...spring, ...carry(info.velocity.y) });
  };

  const visible = Math.max(1, Math.min(cards, queue.length));
  const last = slotOf(visible - 1);

  const release = (info: PanInfo) => {
    // Measured off the card, not the pointer: past the constraints `dragElastic` moves
    // the card a fraction of the finger, so `info.offset` and what you can see diverge.
    const dx = x.get() + info.velocity.x * PROJECTION;
    const dy = y.get() + info.velocity.y * PROJECTION;
    const reach = Math.hypot(dx, dy);
    const trigger = Math.min(throwThreshold, bounds * 0.9);

    if (queue.length < 2 || reach <= trigger) {
      settle(info);
      return;
    }

    const out = bounds + 200;
    // Read the live position before the rotation resets it — this is where the arc
    // has to pick the card up from, or it visibly teleports before it flies.
    if (!reducedMotion) {
      setFlight({
        item: front,
        fromX: x.get(),
        fromY: y.get(),
        outX: (dx / reach) * out,
        outY: (dy / reach) * out,
        tilt: rotate.get(),
      });
    }
    setQueue((q) => [...q.slice(1), q[0]]);
  };

  if (front === undefined) {
    return <div className={cn("relative", className)} />;
  }

  const behind = queue.slice(1, visible);

  return (
    <div
      className={cn(
        "relative flex select-none items-center justify-center",
        className,
      )}
    >
      {/* Back of the stack, furthest first so the front one paints on top. Keyed by
          face, not by depth — the key is what lets a card animate forward a slot
          instead of the slot swapping its contents underneath it. */}
      {behind
        .map((item, i) => ({ item, depth: i + 1 }))
        .reverse()
        .map(({ item, depth }) => (
          <BackCard
            key={item}
            trail={trail}
            depth={depth}
            total={behind.length}
            still={reducedMotion}
            transition={spring}
          >
            {items[item]}
          </BackCard>
        ))}

      {/* The card you actually throw. The wrapper owns the promotion out of the stack
          — it mounts wearing the slot the incoming face just left — while the inner
          element owns the drag, because `y` cannot be a spring target and a finger at
          the same time. */}
      <motion.div
        key={front}
        className="relative z-10"
        initial={slotOf(1)}
        animate={slotOf(0)}
        transition={spring}
      >
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
          onDragEnd={(_, info) => release(info)}
          whileDrag={{ cursor: "grabbing" }}
          style={{ x, y, rotate: reducedMotion ? 0 : rotate }}
          className="cursor-grab touch-none will-change-transform"
        >
          {items[front]}
        </motion.div>
      </motion.div>

      {/* The throw itself, on a card that exists only for the length of the arc: out
          along the direction you flicked, then down into the last slot, dissolving as
          it arrives — into the real back card, which is fading in at that exact spot.
          A fixed tween, not a spring: this one is choreography, and choreography that
          ends where the next thing begins cannot be allowed to overshoot past it. */}
      {flight && (
        <motion.div
          key={`flight-${flight.item}`}
          aria-hidden
          className="pointer-events-none absolute z-20 will-change-transform"
          initial={{
            x: flight.fromX,
            y: flight.fromY,
            rotate: flight.tilt,
            scale: 1,
            opacity: 1,
          }}
          animate={{
            x: [flight.fromX, flight.outX, 0],
            y: [flight.fromY, flight.outY, last.y],
            rotate: [flight.tilt, flight.tilt * 1.5, 0],
            scale: [1, 1, last.scale],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: FLIGHT, times: [0, 0.42, 1], ease: "easeInOut" }}
          onAnimationComplete={() => setFlight(null)}
        >
          {items[flight.item]}
        </motion.div>
      )}
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
  transition,
}: {
  children: ReactNode;
  trail: MotionValue<number>;
  depth: number;
  total: number;
  still: boolean;
  transition: object;
}) {
  const factor = 1 - depth / (total + 1);
  const x = useTransform(trail, (t) => t * factor);
  const slot = slotOf(depth);

  // Depth is animated, not styled: on a swap every card behind moves up one slot, and
  // a plain style write would teleport it there. It enters transparent so the card
  // arriving at the back fades in under the one still flying toward it.
  return (
    <motion.div
      aria-hidden
      className="absolute will-change-transform"
      style={{ x: still ? 0 : x }}
      initial={{ ...slot, opacity: 0 }}
      animate={slot}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
