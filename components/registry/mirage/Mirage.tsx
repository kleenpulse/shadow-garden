"use client";

import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// Real, interactive HTML seen through moving air. No snapshot, no canvas
// replica: the live DOM subtree is displaced per pixel, so the text stays
// selectable, the button still takes focus and the link is still a link.
//
// Four decisions carry this, and the first two are corrections of the obvious
// build.
//
// **The field SCROLLS. It is never re-seeded.** Animating feTurbulence by
// stepping its `seed` is the tempting one-liner and it is not animation at all —
// each seed is an entirely new random field, so the content jumps between
// unrelated distortions many times a second. That reads as a broken component
// rather than as moving air. Here the noise is rasterised once into a seamless
// tile and the tile is scrolled; the pattern is continuous, and because it is
// seamless the wrap at one period is invisible.
//
// **The displacement tapers to neutral at the element's edges.** Displacing
// uniformly moves the border too, so a rounded card dissolves into an amoeba and
// the silhouette — the one part of a card a reader uses to locate it — is the
// first thing destroyed. The taper is composited onto the map with
// feComposite arithmetic (k1=1, k3=-0.5, k4=0.5), which is `0.5 + (map-0.5)*t`:
// it pulls toward the neutral 128 rather than toward zero, and multiplying the
// map directly would instead push every edge pixel to maximum displacement.
//
// **The map is built on resize, never per frame.** feImage needs a URL, and a
// canvas has to go through toDataURL to become one — that is a PNG encode, far
// too expensive to run sixty times a second. Scrolling a pre-built map buys
// smooth motion for one encode per size.
//
// **The animation writes attributes on the live filter primitives.** The frame
// budget of an SVG filter is spent inside the filter; asking React to reconcile
// it every frame spends it twice.
export type MirageMode = "haze" | "liquify" | "shatter" | "tear";
export type MirageTrigger = "always" | "hover";

export interface MirageProps {
  children?: ReactNode;
  /** How the air moves. */
  mode?: MirageMode;
  /** How far the content is pushed. */
  intensity?: number;
  /** Rate the field drifts. */
  speed?: number;
  /** Size of the turbulence cells. */
  scale?: number;
  /** Colour the shimmer carries. */
  chroma?: number;
  /** What turns the effect on. */
  trigger?: MirageTrigger;
  /** How much of the element's own silhouette is protected. */
  edgeHold?: number;
  /** The colour of the shimmer. */
  tintColor?: string;
  /** Halt the loop. The air stops moving. */
  paused?: boolean;
  /** The air holds still. Content stays exactly where it is. */
  reducedMotion?: boolean;
  className?: string;
}

/** One period of the scrolling map, in CSS pixels. The map is rendered a tile
 *  larger than the element in both axes so a full period of scroll never
 *  uncovers an edge. */
const TILE = 180;

/** Lattice cells per tile, x and y. Anisotropy is what separates the modes:
 *  equal frequencies give soup, and a strongly biased axis is what makes a tear
 *  read as a tear rather than as more haze. */
const CELLS: Record<MirageMode, [number, number]> = {
  haze: [3, 6],
  liquify: [2, 2],
  shatter: [9, 9],
  tear: [1, 11],
};

const OCTAVES: Record<MirageMode, number> = {
  haze: 2,
  liquify: 2,
  shatter: 1,
  tear: 1,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};

/** Value noise on a lattice that WRAPS at `cells`, which is what makes the tile
 *  seamless — without the modulo the scroll shows a hard seam once per period. */
function makeNoise(cellsX: number, cellsY: number, seed: number) {
  const hash = (ix: number, iy: number) => {
    const x = ((ix % cellsX) + cellsX) % cellsX;
    const y = ((iy % cellsY) + cellsY) % cellsY;
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return (u: number, v: number) => {
    const fx = u * cellsX;
    const fy = v * cellsY;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

function buildNoiseMap(
  w: number,
  h: number,
  mode: MirageMode,
  scale: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const [cx, cy] = CELLS[mode];
  const s = Math.max(scale, 0.05);
  // Cells are counted per TILE, so the tile stays the period no matter what the
  // element measures — the scroll wrap is invisible at any size.
  const tilesX = Math.max(1, Math.round((canvas.width / TILE) * (cx / s)));
  const tilesY = Math.max(1, Math.round((canvas.height / TILE) * (cy / s)));

  const oct = OCTAVES[mode];
  const n1x = makeNoise(tilesX, tilesY, 1);
  const n1y = makeNoise(tilesX, tilesY, 2);
  const n2x = makeNoise(tilesX * 2, tilesY * 2, 3);
  const n2y = makeNoise(tilesX * 2, tilesY * 2, 4);

  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  for (let y = 0; y < canvas.height; y++) {
    const v = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      let dx = n1x(u, v) - 0.5;
      let dy = n1y(u, v) - 0.5;
      if (oct > 1) {
        dx += (n2x(u, v) - 0.5) * 0.5;
        dy += (n2y(u, v) - 0.5) * 0.5;
      }
      const i = (y * canvas.width + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + dx * 220));
      data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 220));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** White where the content may be pushed, black where the silhouette must hold.
 *  Composited onto the map so the edges settle at neutral rather than at zero. */
function buildTaper(w: number, h: number, hold: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const band = Math.max(
    1,
    Math.min(canvas.width, canvas.height) * 0.5 * Math.min(Math.max(hold, 0), 1),
  );
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const d = Math.min(x, y, canvas.width - 1 - x, canvas.height - 1 - y);
      const t = band <= 1 ? 1 : smoothstep(0, band, d);
      const c = Math.round(t * 255);
      const i = (y * canvas.width + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

const Mirage = memo(
  ({
    children,
    mode = "haze",
    intensity = 0.4,
    speed = 0.35,
    scale = 2.2,
    chroma = 0.25,
    trigger = "always",
    edgeHold = 0.35,
    tintColor = "#a855f7",
    paused = false,
    reducedMotion = false,
    className,
  }: MirageProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const noiseRef = useRef<SVGFEImageElement>(null);
    const dispRef = useRef<SVGFEDisplacementMapElement>(null);
    const tintRef = useRef<HTMLDivElement>(null);
    const rawId = useId();
    // Stripped to a bare word: this ends up inside a CSS url(#...) reference and
    // React has emitted both colons and guillemets here across versions. A filter
    // reference that fails to resolve does not fall back to "no filter" — the
    // element is not rendered at all.
    const filterId = `sg-mirage-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const gathered = useRef(0);
    const pointer = useRef({ x: 0.5, y: 0.5, over: false });
    const box = useRef({ w: 0, h: 0 });

    const [maps, setMaps] = useState({ noise: "", taper: "", w: 0, h: 0 });

    const live = useRef({ mode, intensity, speed, scale, chroma, trigger, edgeHold, reducedMotion });
    live.current = { mode, intensity, speed, scale, chroma, trigger, edgeHold, reducedMotion };

    const rebuild = useRef<(() => void) | null>(null);
    rebuild.current = () => {
      const { w, h } = box.current;
      if (w < 2 || h < 2) return;
      const l = live.current;
      setMaps({
        // A tile larger in both axes, so a full period of scroll never uncovers
        // an edge of the element.
        noise: buildNoiseMap(w + TILE, h + TILE, l.mode, l.scale),
        taper: buildTaper(w, h, l.edgeHold),
        w,
        h,
      });
    };

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused || reducedMotion,
      onResize: (m: Metrics) => {
        const changed =
          Math.abs(m.width - box.current.w) > 1 ||
          Math.abs(m.height - box.current.h) > 1;
        box.current = { w: m.width, h: m.height };
        if (changed) rebuild.current?.();
      },
      onFrame: ({ elapsed }) => {
        const l = live.current;
        const noise = noiseRef.current;
        const disp = dispRef.current;

        const active = l.trigger === "always" ? 1 : pointer.current.over ? 1 : 0;
        // Eased rather than switched. A displacement that snaps on reads as the
        // element being swapped out; one that rises reads as air beginning to move.
        gathered.current += (active - gathered.current) * 0.09;

        if (noise) {
          // Two incommensurate rates so the drift never settles into a visible
          // period, wrapped at exactly one tile — which is seamless, so the wrap
          // cannot be seen.
          const t = elapsed * l.speed;
          const ox = -(((t * 26) % TILE) + TILE) % TILE;
          const oy = -(((t * 17) % TILE) + TILE) % TILE;
          noise.setAttribute("x", ox.toFixed(2));
          noise.setAttribute("y", oy.toFixed(2));
        }
        if (disp) {
          disp.setAttribute(
            "scale",
            (l.intensity * 26 * gathered.current).toFixed(2),
          );
        }

        const tint = tintRef.current;
        if (tint) {
          tint.style.opacity = String(
            Math.min(0.45, l.chroma * 0.45 * gathered.current),
          );
          const p = pointer.current;
          tint.style.background = `radial-gradient(circle at ${(p.x * 100).toFixed(1)}% ${(p.y * 100).toFixed(1)}%, currentColor 0%, transparent 62%)`;
        }
      },
      deps: [],
    });

    // Map content changes rebuild the raster; everything else is a uniform-style
    // attribute write and only needs a repaint.
    useEffect(() => {
      rebuild.current?.();
    }, [mode, scale, edgeHold]);

    useEffect(() => {
      loop.paint();
    }, [intensity, speed, chroma, trigger, tintColor, maps, loop]);

    const track = (e: React.PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      pointer.current.x = (e.clientX - r.left) / r.width;
      pointer.current.y = (e.clientY - r.top) / r.height;
      pointer.current.over = true;
      loop.start();
    };
    const release = () => {
      pointer.current.over = false;
      loop.start();
    };

    const ready = maps.noise !== "" && maps.taper !== "";

    return (
      <div
        ref={containerRef}
        className={className ?? "relative"}
        onPointerMove={track}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        <svg aria-hidden className="absolute h-0 w-0" focusable="false">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              {ready ? (
                <>
                  <feImage
                    ref={noiseRef}
                    href={maps.noise}
                    x="0"
                    y="0"
                    width={maps.w + TILE}
                    height={maps.h + TILE}
                    preserveAspectRatio="none"
                    result="noise"
                  />
                  <feImage
                    href={maps.taper}
                    x="0"
                    y="0"
                    width={maps.w}
                    height={maps.h}
                    preserveAspectRatio="none"
                    result="taper"
                  />
                  {/* 0.5 + (noise - 0.5) * taper. Multiplying the map by the taper
                      instead would drive every edge pixel to zero, which is
                      MAXIMUM displacement rather than none — the exact opposite
                      of protecting the silhouette. */}
                  <feComposite
                    in="noise"
                    in2="taper"
                    operator="arithmetic"
                    k1="1"
                    k2="0"
                    k3="-0.5"
                    k4="0.5"
                    result="map"
                  />
                  <feDisplacementMap
                    ref={dispRef}
                    in="SourceGraphic"
                    in2="map"
                    scale={0}
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </>
              ) : null}
            </filter>
          </defs>
        </svg>

        {/* The live tree, filtered in place — never cloned, never snapshotted. */}
        <div
          style={{
            filter: ready && !reducedMotion ? `url(#${filterId})` : undefined,
          }}
        >
          {children}
        </div>

        <div
          ref={tintRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ color: tintColor, mixBlendMode: "plus-lighter", opacity: 0 }}
        />
      </div>
    );
  },
);

Mirage.displayName = "Mirage";

export default Mirage;
