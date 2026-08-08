"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// A row of slats. Point at one and it opens; its neighbours give up the room on a
// spring rather than jumping aside.
//
// Honest tradeoff: this animates `flex-grow`, a layout property, which is normally
// the thing to avoid. There is no transform-only way to make neighbouring panels
// genuinely reflow — a scaled panel would squash its contents instead of revealing
// more of them. The cost is bounded by keeping the count small and putting
// `contain: layout paint` on each slat so the reflow can't escape the row.
export interface UnfoldPanel {
  key: string;
  label: string;
  meta?: string;
  children?: ReactNode;
  /** Artwork for the slat. Cropped to fill, so anything works — but the slat is
   *  a tall sliver when closed and a wide box when open, and both crops come
   *  out of the same file. A source that already frames the subject tightly
   *  survives that far better than a full-length figure. */
  image?: string;
  /** Focal point of `image`, as an `object-position` value. Doubles as the
   *  zoom origin, so the subject stays put instead of drifting out of frame as
   *  the slat resizes. Defaults to just above centre, which suits a portrait;
   *  off-centre artwork needs its own. */
  imagePosition?: string;
}

// The art bleeds to every edge, so the bottom would otherwise end on a hard
// horizontal cut across the torso. Dissolving that band lets the crop fall away
// into the panel instead of terminating on a line.
const ART_MASK =
  "linear-gradient(to top, transparent 0%, #000 26%, #000 100%)";

// Full-bleed art means the label now sits *on* the picture rather than beside
// it, so the scrim carries the text: a floor along the bottom edge plus a
// heavier wash into the bottom-left corner where the block actually lands.
// Built from --color-panel via color-mix so the contrast runs the correct
// direction in both themes — a hardcoded black scrim would swallow the
// ink-coloured text in light mode.
const ART_SCRIM = [
  "radial-gradient(115% 85% at 0% 100%, color-mix(in oklab, var(--color-panel) 95%, transparent) 0%, color-mix(in oklab, var(--color-panel) 62%, transparent) 45%, transparent 78%)",
  "linear-gradient(to top, color-mix(in oklab, var(--color-panel) 96%, transparent) 0%, color-mix(in oklab, var(--color-panel) 72%, transparent) 26%, transparent 62%)",
].join(", ");

// Seven unrelated colour casts would fight the shell. A single amethyst wash
// behind the open slat pulls whatever art you supply back toward the bench
// identity, and reads as backlight rather than a filter laid over the top.
const ART_WASH =
  "radial-gradient(105% 80% at 72% 6%, var(--color-accent) 0%, transparent 68%)";

export interface UnfoldProps {
  /** Slats to render, in order. */
  items?: UnfoldPanel[];
  className?: string;
  /** How many of `items` to show. */
  panels?: number;
  /** How many times wider the open slat is than a closed one. */
  expandRatio?: number;
  /** Spring stiffness — higher snaps open faster. */
  stiffness?: number;
  /** Spring damping — lower overshoots and settles. */
  damping?: number;
  /** Turn the vertical rail label horizontal when the slat opens. */
  labelReveal?: boolean;
  /** Space between slats, in px. */
  gap?: number;
  /** Fade each panel's `image` in behind its slat. */
  useImage?: boolean;
  /** When true, slats resize instantly instead of on a spring. */
  reducedMotion?: boolean;
}

export default function Unfold({
  items = [],
  className,
  panels = 5,
  expandRatio = 3.5,
  stiffness = 260,
  damping = 30,
  labelReveal = true,
  gap = 8,
  useImage = false,
  reducedMotion = false,
}: UnfoldProps) {
  const [active, setActive] = useState<number | null>(null);
  const visible = items.slice(0, Math.max(2, panels));

  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness, damping };

  // The art crosses between states on a tween, not the slat's spring — an
  // overshooting spring on a filter reads as a flicker rather than a bloom.
  const artSwap = reducedMotion
    ? { duration: 0 }
    : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

  // The overlays are laid out at their *settled* width from the very first
  // frame and revealed by the slat's own overflow clip, so text never re-wraps
  // while the row springs. Container query units are what make that possible
  // without measuring: `cqw` resolves against the row, which never resizes,
  // while a percentage would resolve against the slat, which is mid-animation.
  const n = visible.length;
  const share = expandRatio + n - 1;
  const track = `(100cqw - ${(n - 1) * gap}px)`;
  const openWidth = `calc(${track} * ${(expandRatio / share).toFixed(4)})`;
  const closedWidth = `calc(${track} * ${(1 / share).toFixed(4)})`;

  return (
    <div
      className={cn("flex h-full w-full", className)}
      style={{ gap: `${gap}px`, containerType: "inline-size" }}
      onMouseLeave={() => setActive(null)}
    >
      {visible.map((panel, i) => {
        const open = active === i;
        // `labelReveal` off keeps the spine label up even while the slat opens.
        const revealed = open && labelReveal;
        const focus = panel.imagePosition ?? "50% 35%";
        return (
          <motion.button
            key={panel.key}
            type="button"
            // Hover and focus are the same gesture here, so the row is fully
            // operable from the keyboard without a separate affordance.
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(open ? null : i)}
            aria-expanded={open}
            animate={{ flexGrow: open ? expandRatio : 1 }}
            initial={false}
            transition={spring}
            style={{ flexBasis: 0, contain: "layout paint" }}
            className={cn(
              "group relative min-w-0 overflow-hidden rounded-2xl border text-left outline-none transition-colors",
              open
                ? "border-accent-muted bg-raised"
                : "border-hairline bg-panel hover:bg-raised/60",
              "focus-visible:border-accent",
            )}
          >
            {/* Gating on mount rather than on opacity keeps the default render
                honest: with `useImage` off the browser never requests the art
                at all. AnimatePresence buys back the exit fade that a bare
                conditional would cost. */}
            <AnimatePresence initial={false}>
              {useImage && panel.image ? (
                <motion.span
                  key="art"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.3 }}
                  className="pointer-events-none absolute inset-0"
                >
                  {/* Light mode puts these dark figures on a white panel, where
                      the same opacity reads far louder. Damping the whole layer
                      keeps both states proportional without forking the
                      animation. */}
                  <span className="absolute inset-0 opacity-72 dark:opacity-100">
                    <motion.img
                      src={panel.image}
                      alt=""
                      aria-hidden
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      style={{
                        maskImage: ART_MASK,
                        WebkitMaskImage: ART_MASK,
                        // Crop and zoom share a focal point, so the subject
                        // stays anchored while the slat changes shape.
                        objectPosition: focus,
                        transformOrigin: focus,
                      }}
                      className="absolute inset-0 h-full w-full select-none object-cover"
                      initial={false}
                      // The stage is taller than a slat is ever wide, so `cover`
                      // fits landscape art by height and crops the width in
                      // both states — closed to a sliver, open to about a
                      // third. The scale then tightens onto the face. At this
                      // depth the visible band is roughly a third of the source
                      // height, which is why each panel's focal point sits
                      // *above* its subject's eyes: aim at the face itself and
                      // the crown of the head falls outside the crop.
                      animate={
                        open
                          ? {
                              opacity: 0.95,
                              scale: 2.7,
                              filter: "grayscale(0) contrast(1)",
                            }
                          : {
                              opacity: 0.22,
                              scale: 1.6,
                              filter: "grayscale(1) contrast(1.2)",
                            }
                      }
                      transition={artSwap}
                    />
                  </span>

                  {/* Above the figure: the spine label sits over it while
                      closed, and the open label block needs a floor to read
                      against. */}
                  <span
                    className="absolute inset-0"
                    style={{ backgroundImage: ART_SCRIM }}
                  />

                  <motion.span
                    className="absolute inset-0"
                    style={{
                      backgroundImage: ART_WASH,
                      mixBlendMode: "soft-light",
                    }}
                    initial={false}
                    animate={{ opacity: open ? 1 : 0 }}
                    transition={artSwap}
                  />
                </motion.span>
              ) : null}
            </AnimatePresence>

            {/* Both layers stay mounted and cross-fade. Mounting them on demand
                meant the outgoing text had to finish before the incoming one
                started, so a closing slat sat blank through most of its own
                collapse. */}
            <motion.span
              animate={{ opacity: revealed ? 0 : 1 }}
              initial={false}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : revealed
                    ? { duration: 0.12, ease: "easeOut" }
                    : { duration: 0.22, delay: 0.06, ease: "easeOut" }
              }
              style={{ width: closedWidth }}
              className="pointer-events-none absolute inset-y-0 left-0 flex items-end justify-center pb-5"
            >
              {/* Closed state: the label runs up the slat like a book spine. */}
              <span
                className="font-display text-[11px] uppercase tracking-[0.25em] text-ink-dim group-hover:text-ink"
                style={{ writingMode: "vertical-rl", rotate: "180deg" }}
              >
                {panel.label}
              </span>
            </motion.span>

            <motion.span
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 8 }}
              initial={false}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : revealed
                    ? {
                        opacity: { duration: 0.28, delay: 0.06 },
                        y: { duration: 0.34, delay: 0.06, ease: [0.22, 1, 0.36, 1] },
                      }
                    : {
                        opacity: { duration: 0.14, ease: "easeOut" },
                        // Snap the rise back only once the fade has finished —
                        // animating it out would read as a second, competing
                        // motion against the collapse.
                        y: { duration: 0, delay: 0.16 },
                      }
              }
              style={{
                width: openWidth,
                // The art bleeds full width now, so this is a measure rather
                // than a clearance: it keeps the description off the right edge
                // instead of letting it run the whole way across the picture.
                paddingRight:
                  useImage && panel.image ? `calc(${closedWidth} + 1.25rem)` : undefined,
              }}
              className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-end gap-1.5 p-5"
            >
              {panel.meta && (
                <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">
                  {panel.meta}
                </span>
              )}
              <span className="font-display text-lg tracking-tight text-ink">
                {panel.label}
              </span>
              {panel.children && (
                <span className="block text-xs leading-relaxed text-ink-dim">
                  {panel.children}
                </span>
              )}
            </motion.span>

            {/* Index tick — pinned to the closed width so it holds still while
                the slat around it resizes. */}
            <span
              style={{ width: closedWidth }}
              className="absolute left-0 top-4 text-center font-display text-[10px] text-ink-mute"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
