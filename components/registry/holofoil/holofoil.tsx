"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

// Holographic trading-card foil over whatever you wrap. Tilt is the carrier; the
// foil is the component.
//
// Four decisions carry this.
//
// **Foil and glare move in opposite directions, and that is the whole trick.**
// Foil is diffraction: a grating splits light by wavelength, and the band it
// throws travels *against* the tilt. Glare is plain reflection and follows the
// tilt. Run only one and the card reads as a single gradient sliding about; run
// both, opposed, and the surface acquires a material.
//
// **The sparkle is masked BY the diffraction band, not laid over it.** Glitter
// that twinkles everywhere reads as dust on the screen. Glitter that only lights
// where the rainbow currently falls reads as flake suspended inside the
// laminate, because that is the only place a real flake could catch the light.
//
// **CSS, not a canvas overlay.** This wraps arbitrary children at arbitrary
// sizes; a canvas would need per-instance sizing, would still need a blend mode
// to composite onto the card, and would break the moment someone nested it
// inside another 3D transform. Gradients composite for free and inherit the
// card's own border radius.
//
// **Deliberately not touch-driven.** A finger dragging across a card should
// scroll the page. Touch pointers are ignored and no touch-action is set, the
// same call `tilt` makes for the same reason.
export type HolofoilPattern = "rainbow" | "reverse" | "cosmic" | "linear" | "none";
export type HolofoilBlend =
  | "color-dodge"
  | "screen"
  | "overlay"
  | "hard-light"
  | "plus-lighter";

export interface HolofoilProps {
  children?: ReactNode;
  /** Maximum lean at the card's edge. */
  maxTilt?: number;
  /** Depth of the 3D projection. */
  perspective?: number;
  /** Which diffraction pattern the laminate carries. */
  foil?: HolofoilPattern;
  /** Strength of the diffraction band. */
  foilIntensity?: number;
  /** Density of the flake caught inside the laminate. */
  sparkle?: number;
  /** The broad specular band. */
  glare?: number;
  /** How much the foil keeps moving with no pointer on it. */
  idleDrift?: number;
  /** How quickly the card follows the pointer. */
  settle?: number;
  /** How the foil composites onto the card. */
  blendMode?: HolofoilBlend;
  /** The colour carried by the sheen. */
  sheenColor?: string;
  /** Halt the loop. The card holds its angle. */
  paused?: boolean;
  /** The card stops drifting and stops answering the pointer. */
  reducedMotion?: boolean;
  className?: string;
}

const FOIL_LAYERS: Record<Exclude<HolofoilPattern, "none">, string> = {
  // Twelve stops, because a real holographic sheet repeats its spectrum rather
  // than running one rainbow across the whole card.
  rainbow:
    "repeating-linear-gradient(115deg, #ff2f6a 0%, #ffdd55 8%, #4dff9b 16%, #35d7ff 24%, #9b6bff 32%, #ff2f6a 40%)",
  reverse:
    "repeating-linear-gradient(-115deg, #35d7ff 0%, #9b6bff 8%, #ff2f6a 16%, #ffdd55 24%, #4dff9b 32%, #35d7ff 40%)",
  cosmic:
    "conic-gradient(from 210deg, #ff2f6a, #ffdd55, #4dff9b, #35d7ff, #9b6bff, #ff2f6a)",
  linear:
    "linear-gradient(115deg, transparent 30%, #ffffff 48%, #cbd5ff 52%, transparent 70%)",
};

const Holofoil = memo(
  ({
    children,
    maxTilt = 14,
    perspective = 800,
    foil = "rainbow",
    foilIntensity = 0.75,
    sparkle = 0.5,
    glare = 0.45,
    idleDrift = 0.2,
    settle = 0.12,
    blendMode = "color-dodge",
    sheenColor = "#a855f7",
    paused = false,
    reducedMotion = false,
    className,
  }: HolofoilProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const foilRef = useRef<HTMLDivElement>(null);
    const sparkleRef = useRef<HTMLDivElement>(null);
    const glareRef = useRef<HTMLDivElement>(null);

    const live = useRef({
      maxTilt, perspective, foil, foilIntensity, sparkle, glare,
      idleDrift, settle, blendMode, sheenColor, reducedMotion,
    });
    live.current = {
      maxTilt, perspective, foil, foilIntensity, sparkle, glare,
      idleDrift, settle, blendMode, sheenColor, reducedMotion,
    };

    // Target is where the pointer says; current chases it. Both live in refs so
    // a hover never schedules a React render — the verifier requires the
    // component to fall completely still the moment it is paused.
    const state = useRef({ tx: 0, ty: 0, x: 0, y: 0, drift: 0, over: false });

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      onFrame: ({ dt }) => {
        const l = live.current;
        const s = state.current;

        if (!s.over && !l.reducedMotion) {
          s.drift += dt * l.idleDrift;
          // Two incommensurate rates, so the idle never settles into an obvious
          // period. A card in a case is never quite still.
          s.tx = Math.sin(s.drift * 1.7) * 0.55;
          s.ty = Math.cos(s.drift * 1.1) * 0.4;
        }

        const k = l.reducedMotion ? 1 : Math.min(1, dt / Math.max(l.settle, 0.02));
        s.x += (s.tx - s.x) * k;
        s.y += (s.ty - s.y) * k;

        const card = cardRef.current;
        if (card) {
          card.style.transform =
            `rotateY(${(s.x * l.maxTilt).toFixed(3)}deg) rotateX(${(-s.y * l.maxTilt).toFixed(3)}deg)`;
        }

        const foilEl = foilRef.current;
        if (foilEl) {
          // Against the tilt: diffraction, not reflection.
          const px = 50 - s.x * 60;
          const py = 50 - s.y * 60;
          foilEl.style.backgroundPosition = `${px.toFixed(2)}% ${py.toFixed(2)}%`;
          foilEl.style.opacity = String(
            l.foil === "none" ? 0 : Math.min(1, l.foilIntensity * (0.55 + 0.45 * Math.abs(s.x))),
          );
        }

        const sparkleEl = sparkleRef.current;
        if (sparkleEl) {
          sparkleEl.style.backgroundPosition = `${(50 - s.x * 90).toFixed(2)}% ${(50 - s.y * 90).toFixed(2)}%`;
          // Masked by where the band currently is, so the flake lives inside the
          // laminate rather than on the glass.
          sparkleEl.style.maskPosition = `${(50 - s.x * 60).toFixed(2)}% ${(50 - s.y * 60).toFixed(2)}%`;
          sparkleEl.style.opacity = String(Math.min(1, l.sparkle * 0.8));
        }

        const glareEl = glareRef.current;
        if (glareEl) {
          // With the tilt: reflection.
          glareEl.style.backgroundPosition = `${(50 + s.x * 55).toFixed(2)}% ${(50 + s.y * 55).toFixed(2)}%`;
          glareEl.style.opacity = String(Math.min(1, l.glare * (0.4 + 0.6 * Math.hypot(s.x, s.y))));
        }
      },
      deps: [],
    });

    // Static layer styling. Split from the frame body because none of it changes
    // per frame, and rewriting a gradient string sixty times a second would be
    // sixty needless style recalculations.
    useEffect(() => {
      const foilEl = foilRef.current;
      if (foilEl) {
        foilEl.style.backgroundImage =
          foil === "none" ? "none" : FOIL_LAYERS[foil];
        foilEl.style.backgroundSize = foil === "cosmic" ? "180% 180%" : "260% 260%";
        foilEl.style.mixBlendMode = blendMode;
      }
      const glareEl = glareRef.current;
      if (glareEl) {
        glareEl.style.backgroundImage = `radial-gradient(60% 55% at 50% 50%, ${sheenColor}cc 0%, #ffffff66 35%, transparent 72%)`;
      }
      loop.paint();
    }, [foil, blendMode, sheenColor, loop]);

    useEffect(() => {
      loop.paint();
    }, [maxTilt, perspective, foilIntensity, sparkle, glare, idleDrift, settle, loop]);

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      // Mouse and pen only. A finger dragging a card should scroll the page.
      if (e.pointerType === "touch" || live.current.reducedMotion) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = state.current;
      s.over = true;
      s.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      loop.start();
    };

    const onPointerLeave = () => {
      state.current.over = false;
      loop.start();
    };

    return (
      <div
        ref={containerRef}
        className={className ?? "relative"}
        style={{ perspective: `${perspective}px` }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <div
          ref={cardRef}
          className="relative isolate overflow-hidden rounded-2xl"
          style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        >
          {children}

          <div
            ref={foilRef}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundRepeat: "repeat" }}
          />

          <div
            ref={sparkleRef}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              mixBlendMode: "color-dodge",
              backgroundImage:
                "radial-gradient(#ffffff 0.7px, transparent 0.8px), radial-gradient(#ffffff 0.5px, transparent 0.6px)",
              backgroundSize: "37px 41px, 23px 29px",
              backgroundPosition: "50% 50%",
              // Coprime tile sizes above, so the two flake layers never line up
              // into a visible grid the way equal tiles would.
              maskImage:
                "repeating-linear-gradient(115deg, #000 0%, #fff 8%, #000 16%)",
              maskSize: "260% 260%",
            }}
          />

          <div
            ref={glareRef}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ mixBlendMode: "plus-lighter", backgroundSize: "180% 180%" }}
          />
        </div>
      </div>
    );
  },
);

Holofoil.displayName = "Holofoil";

export default Holofoil;
