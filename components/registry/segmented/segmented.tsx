"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { cn } from "@/lib/utils";

// A segmented control whose indicator is never measured.
//
// The obvious build watches the active segment with a ResizeObserver and writes
// `left` and `width` every time anything changes. motion already measures for
// you: one element carrying a `layoutId`, rendered inside whichever segment is
// active, and the FLIP moves and resizes it with no measurement code, no
// observer, and nothing to keep in sync when the font loads late.
//
// The smear is the part worth reading. It is not a second timeline authored to
// look like the travel — it is driven by a spring on the *index*, configured
// identically to the one motion runs on the layout, so its velocity is a
// faithful proxy for the indicator's own. The indicator stretches along its
// direction of travel and thins across it, anchored at the leading edge so the
// deformation trails behind the movement rather than leading it. Author that as
// keyframes and it drifts out of phase the moment anyone touches `stiffness`.
export type SegmentedIndicator = "solid" | "outline" | "underline";
export type SegmentedSizing = "auto" | "equal";
export type SegmentedDensity = "comfortable" | "compact";

export interface SegmentedItem {
  id: string;
  label: string;
}

export interface SegmentedProps {
  /** Segments, in order. */
  items?: SegmentedItem[];
  /** Selected id. Leave undefined and the component owns the selection. */
  value?: string;
  /** Starting selection while uncontrolled. Defaults to the first item. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** How the active segment is marked. All three are the same travelling
   *  element at different settings, not three components. */
  indicator?: SegmentedIndicator;
  /** `equal` gives every segment the same width; `auto` sizes each to its
   *  label, so the indicator resizes as well as travels. */
  sizing?: SegmentedSizing;
  density?: SegmentedDensity;
  /** Corner radius of the indicator and the segments, in px. */
  radius?: number;
  /** Spring tension on the travel. */
  stiffness?: number;
  /** Spring friction on the travel. */
  damping?: number;
  /** How hard the travel deforms the indicator. 0 is a rigid box that slides. */
  smear?: number;
  /** Accent bloom under the indicator. */
  glow?: boolean;
  accentColor?: string;
  /** The indicator jumps rather than travels, and never deforms. The control
   *  is fully usable either way — only the movement is withheld. */
  reducedMotion?: boolean;
  "aria-label"?: string;
  className?: string;
}

/** Travel speed, in segments per second, that reads as fully smeared. Tuned
 *  against the default spring: a one-segment hop peaks near this, so the
 *  deformation saturates on a long jump and stays subtle on a neighbouring
 *  one — which is the behaviour, not a coincidence. */
const SPEED_REF = 5.5;

export default function Segmented({
  items = [],
  value,
  defaultValue,
  onValueChange,
  indicator = "solid",
  sizing = "auto",
  density = "comfortable",
  radius = 8,
  stiffness = 520,
  damping = 34,
  smear = 0.5,
  glow = true,
  accentColor = "#a855f7",
  reducedMotion = false,
  "aria-label": ariaLabel = "View",
  className,
}: SegmentedProps) {
  const uid = useId();
  const [self, setSelf] = useState(defaultValue ?? items[0]?.id ?? "");
  const controlled = value !== undefined;
  const active = controlled ? value : self;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === active),
  );

  const compact = density === "compact";
  const bar = indicator === "underline";

  // The proxy spring. Same config as the layout animation below, so `useVelocity`
  // reads the indicator's own speed in segments per second without motion having
  // to expose its projection internals.
  const position = useMotionValue(activeIndex);
  const settled = useSpring(position, { stiffness, damping });
  const velocity = useVelocity(settled);

  useEffect(() => {
    position.set(activeIndex);
  }, [activeIndex, position]);

  const stretch = useTransform(velocity, (v: number) =>
    reducedMotion ? 0 : Math.min(1, Math.abs(v) / SPEED_REF),
  );
  const scaleX = useTransform(stretch, (s: number) => 1 + smear * s * 0.35);
  const scaleY = useTransform(stretch, (s: number) => 1 - smear * s * 0.22);
  // Anchored at the leading edge: travelling right pins the right edge and lets
  // the box stretch back to the left. Pinning the trailing edge instead makes
  // the indicator arrive *early*, overshooting the segment it is heading for.
  const originX = useTransform(velocity, (v: number) => (v > 0 ? 1 : 0));

  const listRef = useRef<HTMLDivElement>(null);

  const select = (id: string) => {
    if (!controlled) setSelf(id);
    onValueChange?.(id);
  };

  // Native radios already give arrow keys and correct group announcement; only
  // Home and End are missing, so only Home and End are hand-written.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Home" && event.key !== "End") return;
    const next = event.key === "Home" ? items[0] : items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next.id);
    listRef.current
      ?.querySelectorAll<HTMLInputElement>('input[type="radio"]')
      ?.[event.key === "Home" ? 0 : items.length - 1]?.focus();
  };

  const layoutTransition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex select-none items-stretch border border-hairline bg-panel",
        compact ? "gap-0.5 p-0.5" : "gap-1 p-1",
        sizing === "equal" && "w-full",
        className,
      )}
      style={{ borderRadius: radius + (compact ? 2 : 4) }}
    >
      {items.map((item) => {
        const on = item.id === active;
        return (
          <label
            key={item.id}
            className={cn(
              "relative flex cursor-pointer items-center justify-center transition-colors",
              compact ? "px-2.5 py-1" : "px-3.5 py-1.5",
              sizing === "equal" ? "flex-1 basis-0" : "flex-none",
              !on && "hover:bg-raised/70",
            )}
            style={{ borderRadius: radius }}
          >
            <input
              type="radio"
              name={uid}
              value={item.id}
              checked={on}
              onChange={() => select(item.id)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />

            {/* The ring the transparent input would otherwise take off screen,
                projected back onto the segment it belongs to. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
              style={{ borderRadius: radius }}
            />

            {on ? (
              <motion.span
                aria-hidden
                layoutId={`${uid}-indicator`}
                transition={layoutTransition}
                className={cn(
                  "pointer-events-none absolute",
                  bar ? "inset-x-1.5 bottom-0 h-[2px]" : "inset-0",
                )}
                style={{ borderRadius: bar ? 2 : radius }}
              >
                {glow ? (
                  <span
                    className="absolute -inset-1 rounded-[inherit] blur-md"
                    style={{ backgroundColor: accentColor, opacity: 0.28 }}
                  />
                ) : null}
                {/* The smear lives on a child, not on the layout element:
                    motion owns that element's transform for the whole flight
                    and a scale written beside its projection is overwritten
                    every frame. A child it does not project keeps its own. */}
                <motion.span
                  className="absolute inset-0 block rounded-[inherit]"
                  style={{
                    scaleX,
                    scaleY,
                    originX,
                    backgroundColor:
                      indicator === "outline"
                        ? `${accentColor}1f`
                        : accentColor,
                    border:
                      indicator === "outline"
                        ? `1.5px solid ${accentColor}`
                        : undefined,
                  }}
                />
              </motion.span>
            ) : null}

            <span
              className={cn(
                "relative z-10 font-display tracking-[0.12em] uppercase",
                compact ? "text-[10px]" : "text-[11px]",
                // 90ms of delay so the label flips mid-flight. Flipped on click
                // it goes dark while the fill is still sitting on the segment it
                // is leaving, which reads as a mis-click rather than a move.
                "transition-colors duration-200 [transition-delay:90ms]",
                on && indicator === "solid"
                  ? "text-on-accent"
                  : on
                    ? "text-accent"
                    : "text-ink-dim",
              )}
            >
              {item.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
