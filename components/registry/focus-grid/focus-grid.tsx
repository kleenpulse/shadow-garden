"use client";

import { useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";

// A five-tile bento. Pick any tile and it takes the large slot; the rest fall
// back into the smaller slots in their original order, so the grid never
// shuffles into an arrangement the viewer has to relearn.
export interface FocusGridItem {
  key: string;
  title: string;
  description?: string;
  image: string;
  alt: string;
  /** `object-position` for the crop. Every tile shape takes its crop from the
   *  same file, so point this at the subject rather than trusting the centre. */
  imagePosition?: string;
}

type Side = "left" | "right";

export interface FocusGridProps {
  /** Tiles, in their resting order. Only the first five render. */
  items?: FocusGridItem[];
  /** Key of the tile that starts in the large slot. Defaults to the first. */
  defaultActive?: string;
  className?: string;
  /** Space between tiles, in px. */
  gap?: number;
  /** Corner radius of each tile, in px. */
  radius?: number;
  /** Spring stiffness — higher lands faster. */
  stiffness?: number;
  /** Spring damping — lower overshoots and settles. */
  damping?: number;
  /** Show the small label on the supporting tiles. */
  captions?: boolean;
  /** Which edge the large slot sits against. */
  heroSide?: Side;
  /** When true, tiles jump to their new slots instead of travelling. */
  reducedMotion?: boolean;
}

// Grid lines on a 5 × 2 track: [colStart, colEnd, rowStart, rowEnd]. Slot 0 is
// the hero; 1–4 are filled in the order the items were given.
type Slot = readonly [number, number, number, number];
const SLOTS: readonly Slot[] = [
  [1, 3, 1, 3],
  [3, 5, 1, 2],
  [5, 6, 1, 2],
  [3, 4, 2, 3],
  [4, 6, 2, 3],
];

// Line n of 6 mirrors to line 7 − n, so a span [a, b) flips to [7 − b, 7 − a).
const mirror = ([c0, c1, r0, r1]: Slot): Slot => [7 - c1, 7 - c0, r0, r1];

// Swapping which tile owns the hero scrim would pop, so both layers stay
// mounted and only the heavy one fades.
const SCRIM_LIGHT =
  "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 38%)";
const SCRIM_HERO =
  "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 32%, rgba(0,0,0,0) 58%)";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EASE_RISE: [number, number, number, number] = [0.2, 0.7, 0.1, 1];
const EASE_LIFT: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

// The hero copy waits for its tile to all but land, then the title words rise
// in on a stagger and the description lifts in behind them.
const INTRO_DELAY = 0.28;

export default function FocusGrid({
  items = [],
  defaultActive,
  className,
  gap = 8,
  radius = 16,
  stiffness = 260,
  damping = 32,
  captions = true,
  heroSide = "left",
  reducedMotion = false,
}: FocusGridProps) {
  const osReduce = useReducedMotion();
  const reduce = Boolean(osReduce) || reducedMotion;

  const tiles = items.slice(0, 5);
  const [picked, setPicked] = useState(defaultActive ?? tiles[0]?.key);
  // If the items change underneath us, fall back rather than render no hero.
  const active = tiles.some((t) => t.key === picked) ? picked : tiles[0]?.key;

  const slotOf = new Map<string, number>();
  slotOf.set(active ?? "", 0);
  let next = 1;
  for (const t of tiles) if (t.key !== active) slotOf.set(t.key, next++);

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  // Captions leave fast and arrive late: text that rides a tile through a
  // resize reads as smeared even when it is scale-corrected, so it only shows
  // once the tile has all but landed.
  const captionIn = reduce
    ? { duration: 0 }
    : { duration: 0.4, delay: INTRO_DELAY, ease: EASE_OUT };
  const captionOut = reduce ? { duration: 0 } : { duration: 0.12 };

  return (
    <MotionConfig transition={spring}>
      <div
        className={cn("grid h-full w-full grid-cols-5 grid-rows-2", className)}
        style={{ gap: `${gap}px`, containerType: "inline-size" }}
      >
        {/* DOM order never changes — only grid placement does — so focus,
            loaded images and tab order all survive every re-pick. */}
        {tiles.map((tile) => {
          const slot = slotOf.get(tile.key) ?? 0;
          const hero = slot === 0;
          const [c0, c1, r0, r1] =
            heroSide === "right" ? mirror(SLOTS[slot]) : SLOTS[slot];
          const focus = tile.imagePosition ?? "50% 40%";

          return (
            <motion.button
              key={tile.key}
              type="button"
              layout
              onClick={() => setPicked(tile.key)}
              aria-pressed={hero}
              aria-label={tile.title}
              // The incoming hero travels over its neighbours rather than under.
              style={{
                gridColumn: `${c0} / ${c1}`,
                gridRow: `${r0} / ${r1}`,
                borderRadius: radius,
                zIndex: hero ? 2 : 1,
              }}
              className={cn(
                "group relative min-h-0 min-w-0 overflow-hidden bg-raised text-left outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                hero ? "cursor-default" : "cursor-pointer",
              )}
            >
              <span className="absolute inset-0 transition-[filter] duration-300 group-hover:brightness-110">
                {/* `layout` on the image lets motion undo the tile's scale, so
                    the crop re-frames instead of stretching mid-flight. */}
                <motion.img
                  layout
                  src={tile.image}
                  alt={tile.alt}
                  draggable={false}
                  decoding="async"
                  style={{ objectPosition: focus }}
                  className="absolute inset-0 h-full w-full select-none object-cover"
                />
              </span>

              <span
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: SCRIM_LIGHT }}
              />
              <motion.span
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: SCRIM_HERO }}
                initial={false}
                animate={{ opacity: hero ? 1 : 0 }}
                transition={hero ? captionIn : captionOut}
              />

              {/* Captions animate on first mount too, so the opening hero gets
                  the same entrance as every later pick. */}
              <AnimatePresence>
                {hero ? (
                  <motion.span
                    key="hero"
                    layout="position"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: captionOut }}
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-[clamp(0.75rem,2.4cqw,1.25rem)] text-white"
                  >
                    <span
                      className="font-medium leading-[1.05] tracking-tight"
                      style={{ fontSize: "clamp(1.1rem, 3.4cqw, 2rem)" }}
                    >
                      {/* Each word rises out from beneath its own baseline:
                          the mask clips it, so it reads as surfacing rather
                          than sliding in from somewhere. */}
                      {tile.title.split(" ").map((word, i) => (
                        <span key={i}>
                          {i > 0 && " "}
                          <span className="mb-[-0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
                            <motion.span
                              className="inline-block"
                              initial={{ y: "105%" }}
                              animate={{ y: 0 }}
                              transition={
                                reduce
                                  ? { duration: 0 }
                                  : { duration: 0.9, delay: INTRO_DELAY + i * 0.12, ease: EASE_RISE }
                              }
                            >
                              {word}
                            </motion.span>
                          </span>
                        </span>
                      ))}
                    </span>
                    {tile.description && (
                      <motion.span
                        className="max-w-[34ch] text-[clamp(0.65rem,1.3cqw,0.8rem)] leading-snug text-white/80"
                        initial={{ opacity: 0, y: "0.75rem" }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { duration: 0.8, delay: INTRO_DELAY + 0.42, ease: EASE_LIFT }
                        }
                      >
                        {tile.description}
                      </motion.span>
                    )}
                  </motion.span>
                ) : captions ? (
                  <motion.span
                    key="label"
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: captionIn }}
                    exit={{ opacity: 0, transition: captionOut }}
                    className="pointer-events-none absolute bottom-0 left-0 p-[clamp(0.5rem,1.4cqw,0.75rem)] text-[clamp(0.6rem,1.1cqw,0.7rem)] font-medium text-white/90"
                  >
                    {tile.title}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </MotionConfig>
  );
}
