"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  animate,
  useInView,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const LightRays = dynamic(() => import("@/components/registry/light-rays/light-rays"), {
  ssr: false,
});

// Sealed-archive band. LightRays burns behind server-rendered content, mounts
// near the viewport, and stills (speed 0) when offscreen or reduced motion —
// with the hero cube paused by then, at most one WebGL context animates.

// Dusk: the plate is graphite in both themes, and in light the page would hit
// it on a line. Near the plate the light tokens mix toward their dark values
// by `--sg-dusk` (globals.css), so the page dims into the plate and lifts
// again as the colophon comes up. The scroll decides *when*, a short tween
// does the dimming: a dissolve scrubbed by the scroll drags surface and ink
// through the same mid grey at its midpoint, which is a scroll position where
// nothing reads, and a reader can stop exactly there. A tween passes through
// that frame and never rests on it. The switch reads off the plate's own box
// with hysteresis on both edges, so a scroll that dithers at a threshold does
// not flicker the page. Dark ignores the variable, so this runs the same in
// both themes.
//
// Each direction owns its own pair of rules. Going down, the dim starts as
// the plate's top comes into the viewport and lifts at the colophon. Coming
// back up, the dark reads as the plate's, so it lifts as soon as the headline
// has left the bottom of the screen, and re-dims (from the colophon) once the
// headline is back. The pairs must not be mixed: going down the dim starts
// before the headline is in view, so the way-up lift would fire in the same
// frame, and the way-down entry would then re-dim on the next. A scroll event
// with no movement changes nothing, for the same reason.
const DUSK = { duration: 0.7, ease: [0.45, 0.05, 0.2, 1] } as const;
// The lift on the way up is the one the reader asked for by leaving; quicker.
const LIFT = 0.4;
// Plate top past this fraction of the viewport, scrolling down: dim.
const ENTER_TOP = 0.85;
// Room below the plate is the colophon, shorter than half a screen, so the
// bottom thresholds are fractions of whatever room there is and the last
// scroll position is always fully light.
const EXIT_BOTTOM = 0.8;
const ENTER_BOTTOM = 0.5;

function useDusk(ref: React.RefObject<HTMLElement | null>, reduce: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    let raf = 0;
    let dark = false;
    let lastY = window.scrollY;
    let tween: AnimationPlaybackControls | null = null;
    const value = { current: 0 };
    const write = (v: number) => root.style.setProperty("--sg-dusk", v.toFixed(3));
    const go = (target: number, duration: number = DUSK.duration) => {
      tween?.stop();
      tween = animate(value.current, target, {
        ...DUSK,
        duration: reduce ? 0 : duration,
        onUpdate: (v) => {
          value.current = v;
          write(v);
        },
      });
    };
    let first = true;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (dy === 0 && !first) return;
      first = false;
      const up = dy < 0;
      const { top, bottom } = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const below = document.documentElement.scrollHeight - (bottom + y);
      const span = Math.max(1, Math.min(0.5 * vh, below));
      const headline = el.querySelector("h2")?.getBoundingClientRect().top ?? top;
      const inFromBottom = bottom > vh - ENTER_BOTTOM * span;
      if (dark) {
        if (up ? headline >= vh : bottom < vh - EXIT_BOTTOM * span) {
          dark = false;
          go(0, up ? LIFT : DUSK.duration);
        }
      } else if (up ? inFromBottom && headline < vh : top < ENTER_TOP * vh && inFromBottom) {
        dark = true;
        go(1);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      tween?.stop();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      // The plate is landing-only; a soft navigation must not leave the bench
      // dimmed.
      root.style.removeProperty("--sg-dusk");
    };
  }, [ref, reduce]);
}

export default function ProSection({
  raysColor,
  children,
}: {
  raysColor: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "300px 0px" });
  const reduce = useReducedMotion() ?? false;
  useDusk(ref, reduce);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (inView) setMounted(true);
  }, [inView]);

  return (
    <section ref={ref} className="exhibit-plate relative overflow-hidden">
      {mounted ? (
        <div className="sg-plate-glow absolute inset-0 opacity-60" aria-hidden>
          <PreviewBoundary slug="light-rays" label="LightRays" variant="silent">
            <LightRays
              raysColor={raysColor}
              raysSpeed={inView && !reduce ? 1 : 0}
              pulsating={false}
              followMouse={false}
              lightSpread={0.9}
              rayLength={1.8}
              noiseAmount={0.08}
              distortion={0.2}
              // Decorative full-bleed backdrop — cap DPR below retina; the soft
              // glow hides the resolution drop, ~1.8× fewer fragments per frame.
              maxDpr={1.5}
            />
          </PreviewBoundary>
        </div>
      ) : null}
      <div className="relative z-10">{children}</div>
    </section>
  );
}
