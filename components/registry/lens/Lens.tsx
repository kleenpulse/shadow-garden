"use client";

import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A glass lens you drag over live content, bending it for real.
//
// Four decisions carry this.
//
// **The refraction runs through `filter` on a duplicated layer, not through
// `backdrop-filter`.** `backdrop-filter: url(#f)` is the obvious build and it is
// Chromium-only: WebKit and Gecko parse the property, accept it, and silently
// drop the SVG reference, leaving a flat blur. Worse, `CSS.supports` returns
// true in all three, so the capability cannot even be detected — the feature
// test lies. Refracting an aria-hidden duplicate of the content works in every
// engine and is honest about what it can reach: the children you hand it, not
// the arbitrary page behind it.
//
// **The displacement map is a signed-distance field rasterised to RGB.** R and G
// carry the x and y push with 128 as neutral; feDisplacementMap reads them
// through `xChannelSelector` and `yChannelSelector`. `color-interpolation-
// filters="sRGB"` is mandatory — the default is linearRGB, which regrades the
// map before it is ever read as geometry and skews every offset.
//
// **Chromatic aberration is three passes, not a tint.** Each channel is
// displaced by its own scale, isolated with a colour matrix, and screened back
// together. Glass disperses; one pass with a coloured edge is a smear.
//
// **The bend lives in the last fifth of the radius.** Real glass does nearly all
// of its work at the bevel. Displacing uniformly across the disc gives a soap
// bubble — technically a lens, visually a toy.
export interface LensProps {
  /** The content the lens refracts. Rendered once for real, once inside the glass. */
  children?: ReactNode;
  /** Diameter of the disc. */
  size?: number;
  /** How far the map pushes the content. */
  refraction?: number;
  /** How much of the radius is bevel. */
  edgeThickness?: number;
  /** Softening behind the glass. */
  blur?: number;
  /** Separation between the three channels' displacement. */
  chromatic?: number;
  /** Scale applied to the content inside the disc. */
  magnify?: number;
  /** Speed of the specular travelling the rim. */
  shimmer?: number;
  /** How much of a throw survives each frame. */
  friction?: number;
  /** Keep the lens inside its container. */
  bounded?: boolean;
  /** The colour of the rim highlight. */
  rimColor?: string;
  /** Halt the loop. The lens holds its position. */
  paused?: boolean;
  /** The rim stops travelling; dragging still works. */
  reducedMotion?: boolean;
  className?: string;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};

/** Rasterises the bevel into R = x push, G = y push, 128 neutral. Kept at a
 *  fixed resolution rather than the lens size: the map is stretched to fit by
 *  feImage anyway, and regenerating a 400px bitmap on every drag of the size
 *  slider is a lot of main-thread work for a texture nobody can see the pixels
 *  of. */
const MAP_RES = 192;

function buildDisplacementMap(edge: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_RES;
  canvas.height = MAP_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(MAP_RES, MAP_RES);
  const data = image.data;
  const half = MAP_RES / 2;

  for (let y = 0; y < MAP_RES; y++) {
    for (let x = 0; x < MAP_RES; x++) {
      const i = (y * MAP_RES + x) * 4;
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);

      let px = 0;
      let py = 0;
      if (r <= 1 && r > 1e-4) {
        // Bevel only, and nothing at all across the middle of the disc. Adding a
        // radius-proportional pull here to fake magnification distorts the whole
        // window, which is what makes a lens read as a smear: real glass is
        // sharpest dead centre and does all of its bending at the rim.
        // Magnification is a scale transform instead — crisp, and free.
        const bevel = smoothstep(1 - Math.max(edge, 0.02), 1, r);
        const mag = bevel * bevel;
        px = (dx / r) * mag;
        py = (dy / r) * mag;
      }

      data[i] = Math.max(0, Math.min(255, 128 + px * 127));
      data[i + 1] = Math.max(0, Math.min(255, 128 + py * 127));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

const Lens = memo(
  ({
    children,
    size = 180,
    refraction = 0.55,
    edgeThickness = 0.3,
    blur = 1,
    chromatic = 0.22,
    magnify = 1.15,
    shimmer = 0.35,
    friction = 0.9,
    bounded = true,
    rimColor = "#e9e6ff",
    paused = false,
    reducedMotion = false,
    className,
  }: LensProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lensRef = useRef<HTMLDivElement>(null);
    const dupRef = useRef<HTMLDivElement>(null);
    const rimRef = useRef<HTMLDivElement>(null);
    // Everything React's useId can emit that is not a bare word is stripped.
    // The id ends up inside a CSS `url(#...)` reference, and React has used both
    // colons and guillemets in that string across versions — either one makes the
    // reference unresolvable. A filter that fails to resolve does not degrade to
    // "no filter": per spec the element is not rendered at all, so the glass goes
    // empty and looks like a compositing bug rather than a bad identifier.
    const filterId = `sg-lens-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const [map, setMap] = useState("");

    const box = useRef({ w: 0, h: 0 });
    const state = useRef({
      x: 0, y: 0, vx: 0, vy: 0, phase: 0,
      dragging: false, pointerId: -1, grabX: 0, grabY: 0, lastT: 0, placed: false,
    });

    const live = useRef({ size, friction, bounded, shimmer, reducedMotion });
    live.current = { size, friction, bounded, shimmer, reducedMotion };

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      onResize: (metrics: Metrics) => {
        box.current = { w: metrics.width, h: metrics.height };
        const s = state.current;
        if (!s.placed && metrics.width > 0) {
          s.x = metrics.width / 2 - live.current.size / 2;
          s.y = metrics.height / 2 - live.current.size / 2;
          s.placed = true;
        }
        const dup = dupRef.current;
        if (dup) {
          dup.style.width = `${metrics.width}px`;
          dup.style.height = `${metrics.height}px`;
        }
      },
      onFrame: ({ dt }) => {
        const l = live.current;
        const s = state.current;

        if (!s.dragging) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const decay = Math.pow(l.friction, dt * 60);
          s.vx *= decay;
          s.vy *= decay;
        }

        if (l.bounded) {
          const maxX = Math.max(0, box.current.w - l.size);
          const maxY = Math.max(0, box.current.h - l.size);
          // Resist and reverse rather than stop dead — a thrown object that
          // halts against an invisible wall reads as a bug.
          if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * 0.4; }
          if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy) * 0.4; }
          if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx) * 0.4; }
          if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy) * 0.4; }
        }

        const lens = lensRef.current;
        if (lens) {
          lens.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
        }
        // The duplicate is pushed the opposite way so the content inside the
        // glass stays registered with the content outside it. Any drift here and
        // the lens reads as a floating picture rather than as a window.
        const dup = dupRef.current;
        if (dup) {
          dup.style.transform = `translate3d(${(-s.x).toFixed(2)}px, ${(-s.y).toFixed(2)}px, 0)`;
        }

        if (!l.reducedMotion) s.phase += dt * l.shimmer;
        const rim = rimRef.current;
        if (rim) {
          rim.style.transform = `rotate(${((s.phase * 90) % 360).toFixed(2)}deg)`;
        }
      },
      deps: [],
    });

    useEffect(() => {
      setMap(buildDisplacementMap(edgeThickness));
    }, [edgeThickness]);

    useEffect(() => {
      loop.paint();
    }, [size, refraction, blur, chromatic, shimmer, friction, bounded, rimColor, map, loop]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      const r = e.currentTarget.getBoundingClientRect();
      s.dragging = true;
      s.pointerId = e.pointerId;
      s.grabX = e.clientX - r.left - s.x;
      s.grabY = e.clientY - r.top - s.y;
      s.vx = 0;
      s.vy = 0;
      s.lastT = e.timeStamp;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      if (!s.dragging || e.pointerId !== s.pointerId) return;
      const r = e.currentTarget.getBoundingClientRect();
      const nx = e.clientX - r.left - s.grabX;
      const ny = e.clientY - r.top - s.grabY;
      const dt = (e.timeStamp - s.lastT) / 1000;
      if (dt > 0.001) {
        s.vx = (nx - s.x) / dt;
        s.vy = (ny - s.y) / dt;
        s.lastT = e.timeStamp;
      }
      s.x = nx;
      s.y = ny;
      loop.start();
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      if (s.pointerId !== -1 && e.currentTarget.hasPointerCapture(s.pointerId)) {
        e.currentTarget.releasePointerCapture(s.pointerId);
      }
      s.dragging = false;
      s.pointerId = -1;
      loop.start();
    };

    // Both scaled by the disc, not fixed in pixels. A displacement of a constant
    // number of pixels is a gentle bend on a 400px lens and a violent one on an
    // 80px lens, so the same setting would mean two different optics.
    const scale = refraction * size * 0.32;
    const rgb = chromatic * size * 0.09;

    return (
      <div
        ref={containerRef}
        className={
          className ??
          "relative h-full w-full touch-none overflow-hidden select-none"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg aria-hidden className="absolute h-0 w-0" focusable="false">
          <defs>
            {/* No filterUnits or primitiveUnits. The defaults are what every
                working build of this effect relies on: the region is the
                element's own box, and primitive coordinates are plain CSS
                pixels — so feImage at 0,0,size,size lands exactly on the glass.
                Overriding filterUnits to userSpaceOnUse re-anchors the region to
                a coordinate system the HTML element does not share, and the map
                is placed off the element entirely. */}
            <filter id={filterId} colorInterpolationFilters="sRGB">
              {map ? (
                <feImage
                  href={map}
                  result="map"
                  x="0"
                  y="0"
                  width={size}
                  height={size}
                  preserveAspectRatio="none"
                />
              ) : null}
              {/* Three passes, one per channel, recombined additively. Glass
                  disperses, and a single pass with a tinted rim is a smear
                  pretending to be physics. feComposite arithmetic rather than
                  feBlend screen: screen is defined on premultiplied colour and
                  quietly lifts the blacks, which on a dark surface turns the
                  glass into a grey disc. */}
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale + rgb}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dR"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dG"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale - rgb}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dB"
              />
              <feColorMatrix
                in="dR"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="cR"
              />
              <feColorMatrix
                in="dG"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="cG"
              />
              <feColorMatrix
                in="dB"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="cB"
              />
              <feComposite
                in="cR"
                in2="cG"
                operator="arithmetic"
                k1="0"
                k2="1"
                k3="1"
                k4="0"
                result="rg"
              />
              <feComposite
                in="rg"
                in2="cB"
                operator="arithmetic"
                k1="0"
                k2="1"
                k3="1"
                k4="0"
              />
            </filter>
          </defs>
        </svg>

        <div className="absolute inset-0">{children}</div>

        <div
          ref={lensRef}
          className="absolute top-0 left-0 cursor-grab rounded-full active:cursor-grabbing"
          style={{
            width: size,
            height: size,
            willChange: "transform",
            boxShadow:
              "0 18px 46px rgb(0 0 0 / 0.45), inset 0 1px 1px rgb(255 255 255 / 0.35)",
          }}
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{
              // The filter is only referenced once its map exists. On the first
              // paint the map is still being rasterised, and in2="map" pointing
              // at a result that has not been produced invalidates the whole
              // chain — which hides the element rather than skipping the filter.
              filter: map
                ? `url(#${filterId}) blur(${blur}px)`
                : `blur(${blur}px)`,
            }}
          >
            {/* Magnification is a real scale about the centre of the disc, not a
                displacement. Displacement can only resample what is already
                there, so faking magnification with it softens the whole window;
                a transform genuinely enlarges and stays sharp. */}
            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${magnify})`,
                transformOrigin: "50% 50%",
              }}
            >
              <div
                ref={dupRef}
                aria-hidden
                className="absolute top-0 left-0"
                style={{ willChange: "transform" }}
              >
                {children}
              </div>
            </div>
          </div>

          <div
            ref={rimRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${rimColor} 40deg, transparent 110deg, transparent 200deg, ${rimColor}88 250deg, transparent 320deg)`,
              maskImage:
                "radial-gradient(circle, transparent calc(100% - 3px), #000 calc(100% - 2px))",
              mixBlendMode: "plus-lighter",
              opacity: 0.75,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: `inset 0 0 0 1px ${rimColor}55, inset 0 8px 18px rgb(255 255 255 / 0.10)`,
            }}
          />
        </div>
      </div>
    );
  },
);

Lens.displayName = "Lens";

export default Lens;
