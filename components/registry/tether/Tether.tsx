"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// A popover that grows out of the thing that opened it.
//
// Almost every popover in the wild scales from its own centre, which reads as a
// panel appearing *near* the trigger rather than coming *from* it. The fix is
// one line of geometry: the transform origin is the corner of the panel nearest
// the trigger, so a panel below-and-left grows down-and-right out of the button
// and a panel that flipped above grows the other way. Origin, not motion — the
// spring is the same either way.
//
// The origin is derived from the side the panel *resolved* to, never the side
// that was asked for. Those differ whenever the panel would have run off the
// viewport, and a flip that keeps the old origin is worse than no flip at all:
// the panel then grows away from the trigger it just moved to.
//
// No ResizeObserver here. The panel is placed by CSS against its own trigger, so
// nothing has to be measured to position it — only the flip decision reads the
// box, once per open, plus on scroll and resize while it is open.
export type TetherSide = "top" | "right" | "bottom" | "left";
export type TetherAlign = "start" | "center" | "end";
export type TetherOpenOn = "click" | "hover";

export interface TetherProps {
  /** What opens the panel. Rendered inside a real `<button>`. */
  trigger?: ReactNode;
  children?: ReactNode;
  /** Preferred side. `flip` may override it. */
  side?: TetherSide;
  /** Where the panel sits along that side. */
  align?: TetherAlign;
  /** Gap between trigger and panel, in px. Padding rather than margin, so a
   *  pointer crossing the gap never leaves the component. */
  offset?: number;
  /** Spring tension on the pop. */
  stiffness?: number;
  /** Spring friction on the pop. */
  damping?: number;
  /** Size the panel grows from. 1 is a pure fade. */
  popScale?: number;
  /** Draw the caret on the tethered edge. */
  arrow?: boolean;
  /** Move to the opposite side when the preferred one would overflow. */
  flip?: boolean;
  openOn?: TetherOpenOn;
  /** Grace period before a hover-opened panel closes, in ms. */
  closeDelay?: number;
  /** Panel corner radius, in px. */
  radius?: number;
  /** The rule on the tethered edge and the caret. Both point back at the
   *  trigger, which is the only cue that survives a flip. */
  accentColor?: string;
  /** The panel appears and disappears with no pop. Every keyboard path, the
   *  flip, and the origin are untouched — only the travel is withheld. */
  reducedMotion?: boolean;
  className?: string;
  panelClassName?: string;
}

const OPPOSITE: Record<TetherSide, TetherSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** The corner of the panel nearest the trigger, per resolved side and align.
 *  This table is the component. */
function originFor(side: TetherSide, align: TetherAlign): string {
  const along =
    align === "start" ? "0%" : align === "end" ? "100%" : "50%";
  switch (side) {
    case "bottom":
      return `${along} 0%`;
    case "top":
      return `${along} 100%`;
    case "right":
      return `0% ${along}`;
    case "left":
      return `100% ${along}`;
  }
}

/** A few px of travel along the tether, toward the trigger. Small on purpose —
 *  the scale is doing the work and a long slide turns a pop into a drawer. */
const NUDGE = 6;

// `useLayoutEffect` measures before paint so a flip never shows in the wrong
// place first. Aliased at module scope, not branched inside the component: the
// server has no layout to read and React warns if the hook is called there.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Tether({
  trigger,
  children,
  side = "bottom",
  align = "center",
  offset = 10,
  stiffness = 520,
  damping = 26,
  popScale = 0.86,
  arrow = true,
  flip = true,
  openOn = "click",
  closeDelay = 140,
  radius = 10,
  accentColor = "#a855f7",
  reducedMotion = false,
  className,
  panelClassName,
}: TetherProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  // A boolean, not the resolved side: storing the side means keeping a copy of
  // a prop in state and re-syncing it from an effect, which costs a second
  // render every time `side` changes and is the pattern React now lints. One
  // flag plus the prop derives the same answer during render, and the stale
  // flag from the previous side is cleared here rather than a frame later.
  const [flipped, setFlipped] = useState(false);
  const [lastSide, setLastSide] = useState(side);
  if (lastSide !== side) {
    setLastSide(side);
    setFlipped(false);
  }
  const resolved = flipped ? OPPOSITE[side] : side;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedBy = useRef<TetherOpenOn>("click");

  const clearClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => clearClose, []);

  const place = useCallback(() => {
    const triggerEl = triggerRef.current;
    const panel = panelRef.current;
    if (!triggerEl || !panel) return;
    if (!flip) {
      setFlipped(false);
      return;
    }
    const box = triggerEl.getBoundingClientRect();
    // offsetWidth / offsetHeight, never the bounding rect: the panel is mid-pop
    // and its rect carries the entrance scale, so a rect-based fit test decides
    // using a box 14% smaller than the one that will actually be there.
    const w = panel.offsetWidth + offset;
    const h = panel.offsetHeight + offset;
    const room = {
      top: box.top,
      bottom: window.innerHeight - box.bottom,
      left: box.left,
      right: window.innerWidth - box.right,
    };
    const need = side === "top" || side === "bottom" ? h : w;
    setFlipped(room[side] < need && room[OPPOSITE[side]] >= need);
  }, [flip, offset, side]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => place();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Focus moves into the panel only when a click opened it. A hover-opened
  // popover that steals focus yanks the caret out of whatever was being typed,
  // and the pointer never asked for it.
  useEffect(() => {
    if (open && openedBy.current === "click") {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const vertical = resolved === "top" || resolved === "bottom";
  const nudge = reducedMotion ? 0 : NUDGE;
  const from = {
    x: resolved === "left" ? nudge : resolved === "right" ? -nudge : 0,
    y: resolved === "top" ? nudge : resolved === "bottom" ? -nudge : 0,
  };

  const hover = openOn === "hover";

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-block", className)}
      onPointerEnter={
        hover
          ? () => {
              clearClose();
              openedBy.current = "hover";
              setOpen(true);
            }
          : undefined
      }
      onPointerLeave={
        hover
          ? () => {
              clearClose();
              closeTimer.current = setTimeout(() => {
                // A pointer wandering off must not close a panel someone is
                // tabbing through — the focus would be destroyed with it and
                // land back on <body>.
                if (rootRef.current?.contains(document.activeElement)) return;
                setOpen(false);
              }, Math.max(0, closeDelay));
            }
          : undefined
      }
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${uid}-panel` : undefined}
        aria-describedby={open ? `${uid}-panel` : undefined}
        onClick={() => {
          if (hover) return;
          openedBy.current = "click";
          setOpen((v) => !v);
        }}
        // Hover mode still has to answer the keyboard, or the panel is
        // unreachable without a pointer. Focus opens it and leaves focus where
        // it is: the panel is the next thing in DOM order, so Tab walks into it.
        onFocus={
          hover
            ? () => {
                clearClose();
                openedBy.current = "hover";
                setOpen(true);
              }
            : undefined
        }
        className="rounded-md border border-hairline bg-raised px-4 py-2 font-display text-[11px] tracking-[0.14em] text-ink uppercase transition-colors hover:bg-raised/70"
        style={{ boxShadow: open ? `inset 0 0 0 1px ${accentColor}` : undefined }}
      >
        {trigger}
      </button>

      <AnimatePresence>
        {open ? (
          <div
            key="tether-panel"
            // Positioning wrapper. It owns the CSS transform that centres the
            // panel; the panel owns the motion transform. One element carrying
            // both means motion overwrites the centring on the first frame and
            // the panel jumps half its width sideways as it opens.
            className={cn(
              "absolute z-50",
              resolved === "bottom" && "top-full",
              resolved === "top" && "bottom-full",
              resolved === "right" && "left-full",
              resolved === "left" && "right-full",
              vertical && align === "start" && "left-0",
              vertical && align === "end" && "right-0",
              vertical && align === "center" && "left-1/2 -translate-x-1/2",
              !vertical && align === "start" && "top-0",
              !vertical && align === "end" && "bottom-0",
              !vertical && align === "center" && "top-1/2 -translate-y-1/2",
            )}
            style={{
              paddingTop: resolved === "bottom" ? offset : undefined,
              paddingBottom: resolved === "top" ? offset : undefined,
              paddingLeft: resolved === "right" ? offset : undefined,
              paddingRight: resolved === "left" ? offset : undefined,
            }}
          >
            <motion.div
              ref={panelRef}
              id={`${uid}-panel`}
              role="dialog"
              aria-label="More"
              tabIndex={-1}
              // `false` under reduced motion, not a zero-duration transition:
              // motion paints `initial` on the mount and only reaches `animate`
              // on the next frame, so a duration of 0 still shows one frame at
              // 86%. Measured — the panel flashes small even with the animation
              // switched off. `initial={false}` mounts it already arrived.
              initial={
                reducedMotion ? false : { opacity: 0, scale: popScale, ...from }
              }
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: popScale, ...from }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness, damping }
              }
              style={{
                transformOrigin: originFor(resolved, align),
                borderRadius: radius,
              }}
              className={cn(
                "relative border border-hairline bg-panel shadow-xl outline-none",
                panelClassName,
              )}
            >
              {/* The rule on the tethered edge. It moves with the flip, so the
                  panel keeps pointing back at the trigger no matter which side
                  it ended up on. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute rounded-[inherit]",
                  resolved === "bottom" && "inset-x-0 top-0 h-0.5",
                  resolved === "top" && "inset-x-0 bottom-0 h-0.5",
                  resolved === "right" && "inset-y-0 left-0 w-0.5",
                  resolved === "left" && "inset-y-0 right-0 w-0.5",
                )}
                style={{ backgroundColor: accentColor }}
              />

              {arrow ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute size-2 rotate-45",
                    resolved === "bottom" && "-top-1",
                    resolved === "top" && "-bottom-1",
                    resolved === "right" && "-left-1",
                    resolved === "left" && "-right-1",
                    vertical && align === "start" && "left-3.5",
                    vertical && align === "end" && "right-3.5",
                    vertical && align === "center" && "left-1/2 -ml-1",
                    !vertical && align === "start" && "top-3.5",
                    !vertical && align === "end" && "bottom-3.5",
                    !vertical && align === "center" && "top-1/2 -mt-1",
                  )}
                  style={{ backgroundColor: accentColor }}
                />
              ) : null}

              {children}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
