"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";

/**
 * MagneticButton — a button that leans toward the cursor. A padded, invisible
 * magnetic field extends `radius` px beyond the button; while the pointer is
 * inside it the button eases toward the cursor by `pullStrength`, an aura
 * blooms behind it, and clicks emit a fading ripple. All pointer listeners live
 * on the field container — no window listeners. Under reduced motion the button
 * stays put, ripples are suppressed, and only a faint static aura remains.
 *
 * On coarse pointers (touch) the magnetic lean is a no-op — there's no hovering
 * cursor to follow — so the field padding collapses to 0 (otherwise `radius`
 * would balloon the layout ~2*radius past the button and overflow on mobile).
 * Taps still fire the ripple, and `touch-action: manipulation` keeps them crisp.
 */
export interface MagneticButtonProps {
  /** Button label / content. */
  children?: ReactNode;
  /** Fraction of the pointer offset the button follows (0..1). */
  pullStrength?: number;
  /** Radius of the magnetic field beyond the button, in px. */
  radius?: number;
  /** Follow-spring stiffness. */
  stiffness?: number;
  /** Follow-spring damping. */
  damping?: number;
  /** Aura color (hex). */
  auraColor?: string;
  /** Aura spread beyond the button, in px. */
  auraSize?: number;
  /** Emit a ripple on click. */
  ripple?: boolean;
  /** Ripple color (hex). */
  rippleColor?: string;
  /** Freeze motion, drop ripples, keep only a faint static aura. */
  reducedMotion?: boolean;
  className?: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export default function MagneticButton({
  children = "Magnetic",
  pullStrength = 0.4,
  radius = 120,
  stiffness = 260,
  damping = 18,
  auraColor = "#a855f7",
  auraSize = 80,
  ripple = true,
  rippleColor = "#0a0a0c",
  reducedMotion = false,
  className,
}: MagneticButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  // Coarse pointer = touch: no persistent cursor to lean toward, so the magnetic
  // pull is disabled and the field padding collapses. Starts false to match SSR,
  // then the effect corrects on the client (no hydration mismatch).
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const magnetic = !reducedMotion && !coarse;

  const spring = { stiffness, damping } as const;
  // Numeric initial (not a MotionValue source) so imperative `.set()` in the
  // pointer handlers actually drives the spring — a source-bound spring would
  // snap back to the source each frame and the button would never move.
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const auraOpacity = useSpring(reducedMotion ? 0.35 : 0, spring);

  // Bake the faint static aura whenever reduced motion is active — not only at
  // mount, since the docs bench toggles `reducedMotion` at runtime.
  useEffect(() => {
    auraOpacity.set(reducedMotion ? 0.35 : 0);
    if (reducedMotion) {
      x.set(0);
      y.set(0);
    }
  }, [reducedMotion, auraOpacity, x, y]);

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!magnetic) return;
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < radius) {
      x.set(dx * pullStrength);
      y.set(dy * pullStrength);
      auraOpacity.set(1 - dist / radius);
    } else {
      x.set(0);
      y.set(0);
      auraOpacity.set(0);
    }
  };

  const handlePointerLeave = () => {
    if (!magnetic) return;
    x.set(0);
    y.set(0);
    auraOpacity.set(0);
  };

  const handleClick = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!ripple || reducedMotion) return;
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    // Cover the button fully from the click origin.
    const size =
      2 *
      Math.max(
        Math.hypot(localX, localY),
        Math.hypot(rect.width - localX, localY),
        Math.hypot(localX, rect.height - localY),
        Math.hypot(rect.width - localX, rect.height - localY),
      );
    const id = rippleId.current++;
    setRipples((prev) => [...prev, { id, x: localX, y: localY, size }]);
  };

  const removeRipple = (id: number) =>
    setRipples((prev) => prev.filter((r) => r.id !== id));

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ padding: magnetic ? radius : 0 }}
      className="relative inline-flex max-w-full items-center justify-center"
    >
      {/* Wrapper hugs the button so the aura's `100%` resolves to the button
          box, not the padded field — auraSize alone drives the spread. */}
      <div className="relative inline-flex">
        {/* Aura — sits behind the button, spread scaled by auraSize. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 rounded-full"
          style={{
            x,
            y,
            opacity: auraOpacity,
            width: `calc(100% + ${auraSize * 2}px)`,
            height: `calc(100% + ${auraSize * 2}px)`,
            translateX: "-50%",
            translateY: "-50%",
            background: `radial-gradient(circle at center, ${auraColor}, transparent 70%)`,
          }}
        />

        <motion.button
          ref={buttonRef}
          type="button"
          onPointerDown={handleClick}
          // touch-action: manipulation kills the 300ms tap delay + double-tap
          // zoom so ripples fire instantly on touch. x/y only bind when the
          // magnetic pull is live — otherwise the button sits still.
          style={{ touchAction: "manipulation", ...(magnetic ? { x, y } : {}) }}
          className={
            className ??
            "relative isolate cursor-pointer overflow-hidden rounded-md border border-hairline bg-panel px-6 py-3 font-display text-sm uppercase tracking-widest text-ink transition-colors hover:text-accent"
          }
        >
          {/* Ripples. */}
          <AnimatePresence>
            {ripples.map((r) => (
              <motion.span
                key={r.id}
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.size,
                  height: r.size,
                  marginLeft: -r.size / 2,
                  marginTop: -r.size / 2,
                  background: rippleColor,
                }}
                initial={{ scale: 0, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                onAnimationComplete={() => removeRipple(r.id)}
              />
            ))}
          </AnimatePresence>
          <span className="relative z-10">{children}</span>
        </motion.button>
      </div>
    </div>
  );
}
