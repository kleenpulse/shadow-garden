"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

// A dock whose items swell as the pointer passes over them, the way the macOS
// original does. The effect people remember is not the item under the cursor
// getting bigger — it is the two on either side getting *slightly* bigger, which
// is what makes the row read as a continuous surface being pushed from
// underneath rather than a set of independent hover targets.
//
// Everything is driven off a single MotionValue holding the pointer's position
// along the dock's axis, in client coordinates. Each item derives its own size
// from its distance to that number. There is no per-item state and no React
// re-render while the pointer moves: the row re-renders when `items` changes and
// at no other time.
//
// Why client coordinates and a live getBoundingClientRect rather than measuring
// each item once: the items are resizing, so a cached centre is stale the
// instant the effect starts. Reading the rect inside the transform is a layout
// read per item per frame — cheap at dock scale, and it happens in motion's
// value-update pass, ahead of the pass that writes styles. Cache the centres and
// you get a dock that magnifies correctly only while perfectly still.
//
// Keyboard is not a second code path. Focusing an item writes that item's centre
// into the same MotionValue the pointer writes to, so the row magnifies
// identically whether you are pointing at it or tabbing through it.

export interface MagneticDockItem {
  key: string;
  /** Shown in the tooltip, and the source of the fallback glyph. */
  label: string;
  /** Any icon node. Sized by the dock, so it does not need its own dimensions. */
  icon?: ReactNode;
  /** Draws the running-app indicator under (or beside) the item. */
  active?: boolean;
  onSelect?: () => void;
}

export interface MagneticDockProps {
  /** Items to render, in order. */
  items?: MagneticDockItem[];
  className?: string;
  /** How many times its resting size the item directly under the pointer grows to. */
  magnification?: number;
  /** Distance in px at which an item stops being affected at all. */
  falloff?: number;
  /** Resting edge length of an item, in px. */
  baseSize?: number;
  /** Space between items, in px. */
  gap?: number;
  /** Spring stiffness of the swell. */
  stiffness?: number;
  /** Spring damping of the swell. */
  damping?: number;
  /** Show the label tooltip over the magnified item. */
  labels?: boolean;
  /** Which way the dock runs. */
  orientation?: "horizontal" | "vertical";
  /** Active indicator and focus ring colour. */
  accent?: string;
  /** Drop the spring — size still tracks the pointer, it just arrives instantly. */
  reducedMotion?: boolean;
}

/** Nothing is under the pointer, so every item resolves to its resting size. */
const AWAY = Number.POSITIVE_INFINITY;

export default function MagneticDock({
  items = [],
  className,
  magnification = 2,
  falloff = 140,
  baseSize = 44,
  gap = 10,
  stiffness = 320,
  damping = 24,
  labels = true,
  orientation = "horizontal",
  accent = "#a855f7",
  reducedMotion = false,
}: MagneticDockProps) {
  const horizontal = orientation === "horizontal";
  // One number for the whole dock: the pointer's position along the active axis.
  const cursor = useMotionValue(AWAY);

  return (
    <div
      onPointerMove={(event) =>
        cursor.set(horizontal ? event.clientX : event.clientY)
      }
      onPointerLeave={() => cursor.set(AWAY)}
      // Blur on the container, not on each item: tabbing between two items fires
      // the first one's blur before the second one's focus, and resetting to AWAY
      // in between collapses the whole row for a frame. `relatedTarget` is where
      // focus is going, so this only fires when focus actually leaves the dock.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          cursor.set(AWAY);
        }
      }}
      className={cn(
        "flex w-fit rounded-2xl border border-hairline bg-panel/80 p-2 backdrop-blur-sm",
        // Items grow away from the dock's floor rather than about their own
        // centre — a dock that expands downward as well as upward reads as a
        // zoom, not as something rising to meet you.
        horizontal ? "flex-row items-end" : "flex-col items-start",
        className,
      )}
      // The accent reaches the focus ring as an inherited custom property. The
      // ring is a `box-shadow`, not an `outline`: an outline paints outside the
      // border box and visibly lags the spring while the button is still
      // resizing under it.
      style={{ gap: `${gap}px`, "--dock-accent": accent } as CSSProperties}
    >
      {items.map((item) => (
        <DockItem
          key={item.key}
          item={item}
          cursor={cursor}
          horizontal={horizontal}
          magnification={magnification}
          falloff={falloff}
          baseSize={baseSize}
          stiffness={stiffness}
          damping={damping}
          labels={labels}
          accent={accent}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}

function DockItem({
  item,
  cursor,
  horizontal,
  magnification,
  falloff,
  baseSize,
  stiffness,
  damping,
  labels,
  accent,
  reducedMotion,
}: {
  item: MagneticDockItem;
  cursor: MotionValue<number>;
  horizontal: boolean;
  magnification: number;
  falloff: number;
  baseSize: number;
  stiffness: number;
  damping: number;
  labels: boolean;
  accent: string;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // Signed distance from the pointer to this item's centre. Before first layout
  // there is no rect, and AWAY is the honest answer — resting size — rather than
  // 0, which would flash every item at full magnification on mount.
  const offset = useTransform(cursor, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return AWAY;
    return value - (horizontal ? rect.x + rect.width / 2 : rect.y + rect.height / 2);
  });

  const target = useTransform(
    offset,
    [-falloff, 0, falloff],
    [baseSize, baseSize * magnification, baseSize],
    { clamp: true },
  );
  // Low mass on purpose: the dock has to feel weightless under a fast sweep. At
  // mass 1 the peak lags far enough behind the pointer that the largest item is
  // visibly not the one you are pointing at.
  const springed = useSpring(target, { stiffness, damping, mass: 0.1 });

  // Reduced motion keeps the magnification and drops the spring. The swell is
  // information — it says which item you are about to hit — so removing it
  // entirely costs more than it saves; removing the travel is what was asked for.
  const size = reducedMotion ? target : springed;

  // The icon is sized in `em` off the button's own font-size, so any node works
  // without knowing the dock exists. Lucide, an emoji, a letter — all follow.
  const glyph = useTransform(size, (value) => value * 0.46);

  const tooltip = useTransform(offset, [-falloff * 0.4, 0, falloff * 0.4], [0, 1, 0], {
    clamp: true,
  });

  return (
    <div className={cn("relative flex", horizontal ? "flex-col items-center" : "flex-row items-center")}>
      {labels ? (
        <motion.span
          style={{ opacity: tooltip }}
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-hairline bg-raised px-2 py-1 font-display text-[10px] tracking-[0.14em] text-ink uppercase",
            horizontal ? "bottom-full mb-2" : "left-full ml-2",
          )}
        >
          {item.label}
        </motion.span>
      ) : null}

      <motion.button
        ref={ref}
        type="button"
        onClick={item.onSelect}
        // Focus writes this item's centre into the shared cursor value, so the
        // keyboard drives the identical magnification the pointer does.
        onFocus={() => {
          const rect = ref.current?.getBoundingClientRect();
          if (!rect) return;
          cursor.set(horizontal ? rect.x + rect.width / 2 : rect.y + rect.height / 2);
        }}
        aria-label={item.label}
        aria-current={item.active ? "true" : undefined}
        style={{ width: size, height: size, fontSize: glyph }}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl border border-hairline bg-raised text-ink-dim outline-none transition-colors",
          "hover:text-ink focus-visible:text-ink",
          "focus-visible:ring-2 focus-visible:ring-(--dock-accent)",
          "[&_svg]:h-[1em] [&_svg]:w-[1em]",
        )}
      >
        {item.icon ?? (
          <span className="font-display leading-none">{item.label.charAt(0)}</span>
        )}
      </motion.button>

      {/* Running indicator. Sized in absolute px rather than in `em` so it holds
          still while the item above it swells — a dot that grows with the icon
          reads as part of the icon instead of as a status light under it. */}
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full",
          horizontal ? "-bottom-1.5 h-1 w-1" : "-right-1.5 h-1 w-1",
        )}
        style={{ backgroundColor: item.active ? accent : "transparent" }}
      />
    </div>
  );
}
