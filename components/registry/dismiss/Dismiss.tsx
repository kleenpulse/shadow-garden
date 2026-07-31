"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { cn } from "@/lib/utils";

// Throw the top card away and the stack closes up behind it. Two things commit a
// dismiss: distance past the threshold, or speed past it — a fast flick from
// barely anywhere still counts, which is how the gesture reads on a phone. Short
// of both, the card rubber-bands home carrying its release velocity, so an
// aborted flick decelerates instead of snapping back from a standstill.
//
// The card flies out first and is removed only once it has left, rather than
// unmounting on commit and letting an exit animation play. The direction is
// decided at release, and an `exit` prop is read from the last render BEFORE the
// removal — so it would always animate the previous throw's direction.
//
// Two nested elements per card, and the split is load-bearing: the outer one owns
// the slot (stack offset, scale, depth fade) and the inner one owns the drag.
// Both `y` and `translateY` write the same transform channel, so a single element
// cannot hold a spring-animated stack position and a dragged offset at once —
// one silently wins.
//
// No `filter` anywhere. Dimming the stack with `brightness()` would put an
// IDENTITY filter on the top card, and an identity filter inside a rounded
// `overflow-hidden` ancestor buys a render surface for no visual and strands
// stale tiles on it (§V29/§B12). Opacity does the same job on the compositor.
//
// Every card carries a real dismiss button. A swipe-only control cannot be
// operated by keyboard, which makes it a demo rather than a component.
//
// Drag-driven, so `touch-none` is set inline on the card. Motion sets touch-action
// itself, but the customer copies this file, not the library's internals.
export interface DismissItem {
  id: string;
  title: string;
  meta?: string;
}

export interface DismissProps {
  /** Front of the stack first. */
  items?: DismissItem[];
  /** Fired once the card has left the frame. */
  onDismiss?: (id: string) => void;
  /** Which way a card can be thrown. */
  axis?: "x" | "y" | "both";
  /** Share of the card it must travel to commit, in percent. */
  threshold?: number;
  /** Release speed that commits regardless of distance, in px/s. */
  velocityThreshold?: number;
  /** Give past the drag bounds, 0 (hard wall) → 1 (loose). */
  rubberBand?: number;
  /** How many cards are visible at once. */
  stackDepth?: number;
  /** Vertical step between stacked cards, in px. */
  stackOffset?: number;
  /** Scale lost per card down the stack. */
  stackScale?: number;
  /** Degrees of lean at the far edge of the throw. */
  rotateOnDrag?: number;
  /** How strongly the stack springs into its new slot. */
  stiffness?: number;
  /** How fast that spring settles. */
  damping?: number;
  /** Drops the lean and the overshoot; cards re-slot instantly. */
  reducedMotion?: boolean;
  className?: string;
}

/** Displacement at which the lean reaches full strength. */
const TRAVEL = 220;

export default function Dismiss({
  items = [],
  onDismiss,
  axis = "x",
  threshold = 32,
  velocityThreshold = 520,
  rubberBand = 0.35,
  stackDepth = 3,
  stackOffset = 14,
  stackScale = 0.05,
  rotateOnDrag = 8,
  stiffness = 420,
  damping = 32,
  reducedMotion = false,
  className,
}: DismissProps) {
  const visible = items.slice(0, Math.max(1, stackDepth));

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ paddingBottom: Math.max(0, visible.length - 1) * stackOffset }}
    >
      {/* Cards are absolutely positioned and contribute nothing to layout, so one
          invisible copy holds the container open. */}
      <div aria-hidden className="invisible">
        <CardFace item={{ id: "_", title: "—", meta: "—" }} />
      </div>

      {visible
        .map((item, depth) => ({ item, depth }))
        .reverse()
        .map(({ item, depth }) => (
          <Card
            key={item.id}
            item={item}
            depth={depth}
            total={visible.length}
            axis={axis}
            threshold={threshold}
            velocityThreshold={velocityThreshold}
            rubberBand={rubberBand}
            stackOffset={stackOffset}
            stackScale={stackScale}
            rotateOnDrag={rotateOnDrag}
            stiffness={stiffness}
            damping={damping}
            reducedMotion={reducedMotion}
            onDismiss={onDismiss}
          />
        ))}
    </div>
  );
}

// One component for every position in the stack, not one for the top card and
// another for the rest. Promotion from depth 1 to depth 0 must not remount — a
// remount would reset the drag state and drop the card's identity mid-animation.
function Card({
  item,
  depth,
  total,
  axis,
  threshold,
  velocityThreshold,
  rubberBand,
  stackOffset,
  stackScale,
  rotateOnDrag,
  stiffness,
  damping,
  reducedMotion,
  onDismiss,
}: {
  item: DismissItem;
  depth: number;
  total: number;
  axis: "x" | "y" | "both";
  threshold: number;
  velocityThreshold: number;
  rubberBand: number;
  stackOffset: number;
  stackScale: number;
  rotateOnDrag: number;
  stiffness: number;
  damping: number;
  reducedMotion: boolean;
  onDismiss?: (id: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Lean is derived from displacement rather than animated separately, so an
  // interrupted throw can never desync it from the card.
  const lean = useTransform(x, [-TRAVEL, TRAVEL], [-rotateOnDrag, rotateOnDrag], {
    clamp: true,
  });

  const top = depth === 0;
  const live = top && !leaving;

  const send = (dirX: number, dirY: number) => {
    if (leaving) return;
    setLeaving(true);
    const w = boxRef.current?.offsetWidth ?? 320;
    const h = boxRef.current?.offsetHeight ?? 120;
    const out = reducedMotion
      ? { duration: 0.1 }
      : { type: "spring" as const, stiffness: 260, damping: 30 };

    const goX = dirX !== 0;
    const flightX = animate(x, goX ? Math.sign(dirX) * w * 1.6 : x.get(), out);
    const flightY = animate(y, dirY !== 0 ? Math.sign(dirY) * h * 2.4 : y.get(), out);

    // Resolve on the axis that actually carries the card off screen. The other is
    // holding position and settles at once, so awaiting it would pull the card
    // out of the DOM while it is still on screen.
    void (goX ? flightX : flightY).then(() => onDismiss?.(item.id));
  };

  const release = (info: PanInfo) => {
    const w = boxRef.current?.offsetWidth ?? 320;
    const h = boxRef.current?.offsetHeight ?? 120;
    const canX = axis !== "y";
    const canY = axis !== "x";

    const pastX =
      canX &&
      (Math.abs(info.offset.x) > (threshold / 100) * w ||
        Math.abs(info.velocity.x) > velocityThreshold);
    const pastY =
      canY &&
      (Math.abs(info.offset.y) > (threshold / 100) * h ||
        Math.abs(info.velocity.y) > velocityThreshold);

    if (pastX || pastY) {
      send(
        pastX ? info.offset.x || info.velocity.x : 0,
        pastY ? info.offset.y || info.velocity.y : 0,
      );
      return;
    }

    const home = reducedMotion
      ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const }
      : { type: "spring" as const, stiffness, damping };
    animate(x, 0, { ...home, ...(reducedMotion ? {} : { velocity: info.velocity.x }) });
    animate(y, 0, { ...home, ...(reducedMotion ? {} : { velocity: info.velocity.y }) });
  };

  return (
    <motion.div
      className="absolute inset-x-0 top-0"
      style={{ zIndex: total - depth }}
      // The slot, read straight off `depth`: a card promoted by the one above
      // leaving springs up without any explicit reorder bookkeeping.
      animate={{
        translateY: depth * stackOffset,
        scale: 1 - depth * stackScale,
        opacity: 1 - depth * 0.18,
      }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness, damping }}
    >
      <motion.div
        ref={boxRef}
        // `select-none` alongside `touch-none`, because this drag surface carries
        // text. A drag across it selects the text, a press that starts on the
        // selection begins a native drag-and-drop, and the browser answers with
        // `pointercancel` — motion abandons the gesture and the card stops dead
        // under a still-moving cursor.
        className="touch-none select-none"
        style={{ x, y, rotate: reducedMotion || !top ? 0 : lean, cursor: live ? "grab" : "default" }}
        drag={live ? (axis === "both" ? true : axis) : false}
        dragElastic={rubberBand}
        dragMomentum={false}
        onDragEnd={(_, info) => release(info)}
        whileDrag={{ cursor: "grabbing" }}
      >
        <CardFace
          item={item}
          // Held on through the fly-out — `live` goes false the moment a throw
          // commits, and the card must not blank out while it is still on screen.
          showContent={top}
          interactive={live}
          onDismiss={() => send(axis === "y" ? 0 : 1, axis === "y" ? 1 : 0)}
        />
      </motion.div>
    </motion.div>
  );
}

function CardFace({
  item,
  showContent = true,
  interactive,
  onDismiss,
}: {
  item: DismissItem;
  showContent?: boolean;
  interactive?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-hairline bg-panel px-5 py-4">
      {/* Only the front card carries copy — the surface behind it stays, because
          that IS the stack. Leave the text on and whatever line happens to fall
          in the exposed sliver reads as one card bleeding through another. */}
      <span
        className="min-w-0 flex-1 transition-opacity duration-200"
        style={{ opacity: showContent ? 1 : 0 }}
      >
        <span className="block truncate font-display text-[12px] tracking-[0.12em] text-ink uppercase">
          {item.title}
        </span>
        {item.meta ? (
          <span className="mt-1 block truncate font-sans text-[12px] text-ink-mute">
            {item.meta}
          </span>
        ) : null}
      </span>
      {interactive ? (
        <button
          type="button"
          aria-label={`Dismiss ${item.title}`}
          onClick={onDismiss}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid size-7 shrink-0 place-items-center rounded-full border border-hairline text-ink-mute transition-colors outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 24 24" className="size-3" aria-hidden>
            <path
              d="M5 5 19 19M19 5 5 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
