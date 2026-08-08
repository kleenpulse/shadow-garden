"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

// A glass lens you drag over live content, bending it for real.
//
// Four decisions carry this.
//
// **Bounded it reads its children; unbounded it reads the page.** The first is a
// live duplicate and keeps up with everything behind it. The second cannot be —
// no browser API lets an element read arbitrary rendered content — so the page
// is cloned, once per grab. That is the component's one snapshot, and it is
// confined to the mode where the glass is over content it was never handed.
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
//
// **Nothing here is promoted with `will-change`.** The disc carries an animated
// `filter` inside a rounded `overflow-hidden` clip, and a permanent promotion on
// top of that combination is what strands compositor tiles: fragments of an old
// raster survive at the wrong position until a scroll or a resize discards them.
// It costs sharpness too — a promoted layer beneath a `scale()` ancestor rasters
// at its own scale and is upscaled by the compositor, so magnified text arrives
// soft and only snaps crisp when some other change forces a re-raster.
export interface LensProps {
  /** The content the lens refracts. Rendered once for real, once inside the glass. */
  children?: ReactNode;
  /** Diameter of the disc, as a percentage of the container's shorter side. */
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
  /** Bound the lens to its container. Off, it is portalled to the body and bound
   *  to the viewport instead. */
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

/** How far the filtered layer reaches past the disc, as a fraction of the
 *  diameter. The bevel pushes OUTWARD, so a pixel at the rim shows content from
 *  beyond the rim — and if the glass is clipped to its circle before the filter
 *  runs, "beyond the rim" is transparency. Each of the three passes runs out of
 *  content at its own radius, so the disc edge loses red, then green, and rings
 *  itself in saturated blue: on a dark surface a subtle fringe, on a light one a
 *  drawn-on outline that reads as a rendering fault. Filtering a layer wider
 *  than the disc and clipping the RESULT gives every sample real content to land
 *  on. 0.35 clears the worst case — refraction and chromatic both at maximum
 *  ask for 0.307 of the diameter. */
const PAD_RATIO = 0.35;

/** Rasterises the bevel into R = x push, G = y push, 128 neutral. Kept at a
 *  fixed resolution rather than the lens size: the map is stretched to fit by
 *  feImage anyway, and regenerating a 400px bitmap on every drag of the size
 *  slider is a lot of main-thread work for a texture nobody can see the pixels
 *  of. */
const MAP_RES = 320;

/** Where the disc's edge falls inside the padded layer, as a fraction of its
 *  radius. Fixed, because the pad is a fixed fraction of the diameter — so the
 *  map depends on `edgeThickness` alone and a size change never rebuilds it. */
const INNER = 1 / (1 + 2 * PAD_RATIO);

/** Marks every portalled disc so a snapshot never contains a picture of itself. */
const LENS_TAG = "data-sg-lens";

/** Unbounded, the glass is over the whole page rather than over the children it
 *  was handed, so what it magnifies has to BE the whole page. There is no
 *  browser API that reads arbitrary rendered content — `backdrop-filter` cannot
 *  magnify and is Chromium-only — so the page is duplicated for real.
 *
 *  This is the one place the component takes a snapshot rather than a live
 *  duplicate, and the trade is deliberate: a clone cannot carry running
 *  animations, canvas pixels or component state. It is re-taken on every grab,
 *  which is as live as a copy gets.
 *
 *  Viewport-relative positioning is the trap, and it is BOTH `fixed` and
 *  `sticky` — a stuck element holds a viewport position that a detached copy has
 *  no way to reproduce, exactly like a fixed one. Cloned in, each re-resolves
 *  against the disc instead of the page: `fixed` against the filtered layer
 *  (`filter` makes it a containing block), `sticky` against the nearest
 *  scrollport, which is the disc's own `overflow-hidden` clip. That clip sits
 *  one `pad` from the filtered layer's origin, so an unrestated sticky sidebar
 *  lands exactly `pad` down and across — a constant offset that looks like
 *  arithmetic error and is not — and then re-sticks on every scroll instead of
 *  holding still. The originals are measured and their copies restated at
 *  document coordinates — read from the live tree, since computed style on a
 *  detached clone tells you nothing. The two walks stay
 *  index-aligned because the clone is structurally identical; the tagged discs
 *  come out afterwards, never before. */
/** Where a stuck element WOULD sit if it were not sticky, in document
 *  coordinates. `offsetTop` does not answer this — Chromium folds the sticky
 *  shift into it — and a detached clone cannot be asked either. So the live
 *  elements are un-stuck, measured, and put back, all inside one task: the
 *  browser never gets a chance to paint the intermediate state, and the two
 *  batched passes cost two layout flushes rather than two per element. */
function flowPositions(sticky: HTMLElement[]): Array<[number, number]> {
  const restore = sticky.map((el) => el.style.position);
  for (const el of sticky) el.style.position = "static";
  const flow = sticky.map((el) => {
    const r = el.getBoundingClientRect();
    return [r.left + window.scrollX, r.top + window.scrollY] as [number, number];
  });
  sticky.forEach((el, i) => {
    el.style.position = restore[i];
  });
  return flow;
}

function snapshotPage(host: HTMLDivElement) {
  const src = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
  const root = document.body.cloneNode(true) as HTMLElement;
  const dst = Array.from(root.querySelectorAll<HTMLElement>("*"));

  // Scroll offsets survive neither `cloneNode` nor a detached element, so they
  // are collected on the way past and replayed once the copy is in the document
  // and has a layout. Skipping this leaves every nested scroller — a sidebar, a
  // code panel — rendered from its top, which puts the wrong content under the
  // glass while the glass itself is in exactly the right place.
  const scrolled: Array<[HTMLElement, number, number]> = [];

  // Resolved before the clone is walked, so every rect the walk reads is taken
  // with the page in its true state.
  const positions = src.map((el) => getComputedStyle(el).position);
  const stickyEls = src.filter((_, i) => positions[i] === "sticky");
  const stickyFlow = new Map<HTMLElement, [number, number]>();
  flowPositions(stickyEls).forEach((p, i) => stickyFlow.set(stickyEls[i], p));

  for (let i = 0; i < src.length; i++) {
    const copy = dst[i];
    if (!copy) continue;
    const from = src[i];
    if (from.scrollTop || from.scrollLeft) {
      scrolled.push([copy, from.scrollTop, from.scrollLeft]);
    }
    const pos = positions[i];
    if (pos !== "fixed" && pos !== "sticky") continue;
    // The rect of a stuck or fixed element is where it is ON SCREEN, which is
    // what the page looks like and therefore what the copy has to freeze.
    const r = from.getBoundingClientRect();
    if (pos === "sticky") {
      // `sticky` is IN FLOW and `fixed` is not, so they cannot be restated the
      // same way. Pinning a sticky sidebar with `absolute` takes it out of flow,
      // the column that was laid out beside it collapses into the space, and the
      // whole copy shifts by the sidebar's width — a displacement that looks
      // like a bad transform and is really a reflow. Keep the box in flow with
      // `relative` and carry only the offset the stickiness was contributing:
      // where it is drawn, minus where it would sit unstuck.
      const flow = stickyFlow.get(from);
      if (flow) {
        copy.style.position = "relative";
        copy.style.left = `${r.left + window.scrollX - flow[0]}px`;
        copy.style.top = `${r.top + window.scrollY - flow[1]}px`;
      }
    } else {
      copy.style.position = "absolute";
      copy.style.left = `${r.left + window.scrollX}px`;
      copy.style.top = `${r.top + window.scrollY}px`;
      copy.style.width = `${r.width}px`;
      copy.style.height = `${r.height}px`;
      copy.style.right = "auto";
      copy.style.bottom = "auto";
      copy.style.margin = "0";
    }
  }
  for (const lens of Array.from(root.querySelectorAll(`[${LENS_TAG}]`))) {
    lens.remove();
  }

  // A cloned <body> nested in a <div> is legal in the DOM but picks up user
  // agent margins nothing else on the page has, so the children move instead.
  const holder = document.createElement("div");
  holder.style.background = getComputedStyle(document.body).backgroundColor;
  while (root.firstChild) holder.appendChild(root.firstChild);

  host.style.width = `${document.documentElement.scrollWidth}px`;
  host.style.height = `${document.documentElement.scrollHeight}px`;
  host.replaceChildren(holder);

  for (const [el, top, left] of scrolled) {
    el.scrollTop = top;
    el.scrollLeft = left;
  }
}

/** `inner` is where the disc's edge falls inside the map, which now covers the
 *  padded layer rather than the disc alone. The ring outside it must still be
 *  rasterised neutral rather than left uncovered: an absent map reads as R=G=0,
 *  which is not "no displacement" but maximum displacement in the negative
 *  direction. */
function buildDisplacementMap(edge: number, inner: number): string {
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
      const rr = r / inner;

      let px = 0;
      let py = 0;
      if (rr <= 1 && rr > 1e-4) {
        // Bevel only, and nothing at all across the middle of the disc. Adding a
        // radius-proportional pull here to fake magnification distorts the whole
        // window, which is what makes a lens read as a smear: real glass is
        // sharpest dead centre and does all of its bending at the rim.
        // Magnification is a scale transform instead — crisp, and free.
        const bevel = smoothstep(1 - Math.max(edge, 0.02), 1, rr);
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
    size = 45,
    refraction = 0.55,
    edgeThickness = 0.3,
    blur = 0,
    chromatic = 0.22,
    magnify = 1.6,
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
    const pageRef = useRef<HTMLDivElement>(null);
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
      lastSX: 0, lastSY: 0,
    });

    // `size` is a percentage; the loop, the filter and the box all need pixels.
    // The ref is what the frame reads, the state is what the render reads — one
    // value, two consumers, and the setState is guarded so a resize that does not
    // change the diameter does not re-render.
    const diaRef = useRef(0);
    const [dia, setDia] = useState(0);
    const capture = useRef<HTMLDivElement | null>(null);
    // Unbounded, the disc is portalled to the body, and a portal cannot be built
    // during the server render.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const live = useRef({ size, friction, bounded, shimmer, reducedMotion });
    live.current = { size, friction, bounded, shimmer, reducedMotion };

    // The duplicate's box is the container's, and the observer that knows the
    // container's box only fires when the CONTAINER changes. Anything that mounts
    // a fresh duplicate afterwards — a mode swap, a gate, a hidden tab — would
    // never be sized by it and would render with no usable box at all. One writer,
    // called from the observer AND from a layout effect, so neither path can be
    // the only one that ran.
    const sizeDuplicate = useCallback(() => {
      const dup = dupRef.current;
      if (!dup || box.current.w === 0) return;
      dup.style.width = `${box.current.w}px`;
      dup.style.height = `${box.current.h}px`;
    }, []);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      onResize: (metrics: Metrics) => {
        box.current = { w: metrics.width, h: metrics.height };
        // The shorter side, so the glass keeps its proportion in a wide hero and
        // in a narrow column alike and can never outgrow the box on either axis.
        const next = Math.round(
          (live.current.size / 100) * Math.min(metrics.width, metrics.height),
        );
        if (next !== diaRef.current) {
          diaRef.current = next;
          setDia(next);
        }
        const s = state.current;
        if (!s.placed && metrics.width > 0 && next > 0) {
          s.x = metrics.width / 2 - next / 2;
          s.y = metrics.height / 2 - next / 2;
          s.placed = true;
        }
        sizeDuplicate();
      },
      onFrame: ({ dt }) => {
        const l = live.current;
        const s = state.current;
        const d = diaRef.current;

        if (!s.dragging) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const decay = Math.pow(l.friction, dt * 60);
          s.vx *= decay;
          s.vy *= decay;
        }

        let minX = 0;
        let minY = 0;
        let maxX = Math.max(0, box.current.w - d);
        let maxY = Math.max(0, box.current.h - d);
        // Read once at the top of the frame, before any write: the container can
        // move under a page scroll mid-throw, and a cached offset would let the
        // lens walk off screen. All reads, then all writes — never interleaved.
        const el = containerRef.current;
        const r = !l.bounded && el ? el.getBoundingClientRect() : null;
        if (r) {
          // The viewport, restated in container-local coordinates — position
          // stays measured against the panel whose content the glass is reading,
          // so the duplicate underneath it needs no special case.
          minX = -r.left;
          minY = -r.top;
          maxX = Math.max(minX, window.innerWidth - d - r.left);
          maxY = Math.max(minY, window.innerHeight - d - r.top);
        }
        // Resist and reverse rather than stop dead — a thrown object that
        // halts against an invisible wall reads as a bug.
        if (s.x < minX) { s.x = minX; s.vx = Math.abs(s.vx) * 0.4; }
        if (s.y < minY) { s.y = minY; s.vy = Math.abs(s.vy) * 0.4; }
        if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx) * 0.4; }
        if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy) * 0.4; }

        const lens = lensRef.current;
        if (lens) {
          // Portalled, the disc is fixed to the viewport rather than laid out in
          // the container, so its offset is converted on the way out.
          const tx = r ? r.left + s.x : s.x;
          const ty = r ? r.top + s.y : s.y;
          lens.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
        }
        // The duplicate is pushed the opposite way so the content inside the
        // glass stays registered with the content outside it. Any drift here and
        // the lens reads as a floating picture rather than as a window. The pad
        // is added back because the layer it sits on starts that far above and
        // left of the disc.
        const p = Math.round(d * PAD_RATIO);
        const dup = dupRef.current;
        if (dup) {
          dup.style.transform = `translate3d(${(p - s.x).toFixed(2)}px, ${(p - s.y).toFixed(2)}px, 0)`;
        }
        // The page snapshot is laid out at DOCUMENT coordinates, so it is put
        // back under the glass by the disc's viewport position and the scroll.
        const page = pageRef.current;
        if (page && r) {
          const px = p - (r.left + s.x) - window.scrollX;
          const py = p - (r.top + s.y) - window.scrollY;
          page.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`;
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
      setMap(buildDisplacementMap(edgeThickness, INNER));
    }, [edgeThickness]);

    // The observer only fires when the CONTAINER changes; moving the size slider
    // changes the percentage instead, so the diameter has to be re-resolved from
    // the box already measured.
    useEffect(() => {
      const next = Math.round(
        (size / 100) * Math.min(box.current.w, box.current.h),
      );
      if (next !== diaRef.current) {
        diaRef.current = next;
        setDia(next);
      }
    }, [size]);

    // Position is stored against the container, which is right while the lens is
    // bounded BY that container — scroll the page and the glass travels with the
    // content it is reading. Bound to the viewport it is the opposite: a
    // magnifier is held in front of the page, so the page scrolls underneath it
    // and the glass stays where it was put. The stored position is nudged by the
    // scroll delta to hold the viewport position still; the clamp then keeps it
    // on screen as normal.
    useEffect(() => {
      const s = state.current;
      s.lastSX = window.scrollX;
      s.lastSY = window.scrollY;
      const onScroll = () => {
        const dx = window.scrollX - s.lastSX;
        const dy = window.scrollY - s.lastSY;
        s.lastSX = window.scrollX;
        s.lastSY = window.scrollY;
        if (live.current.bounded || (dx === 0 && dy === 0)) return;
        s.x += dx;
        s.y += dy;
        loop.paint();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }, [loop]);

    // Before paint, not after: a duplicate that is one frame wide is a visible
    // flash of shrink-wrapped content, not a subtle one.
    useLayoutEffect(() => {
      sizeDuplicate();
    }, [dia, bounded, sizeDuplicate]);

    useEffect(() => {
      loop.paint();
    }, [dia, refraction, blur, chromatic, magnify, shimmer, friction, bounded, rimColor, map, loop]);

    // One snapshot on arrival so a lens nobody has touched yet still shows the
    // page, one per resize because the copy is laid out at the width it was taken
    // at, and one after scrolling stops. `mounted` is in the deps because the
    // portal — and therefore the host this writes into — does not exist on the
    // first render.
    //
    // The arrival one goes through the same settle timer as the rest rather than
    // running synchronously. Taken on the spot it captures a layout that has not
    // settled — sticky elements in particular are not yet stuck — and freezes
    // those positions into a copy nothing would refresh until the first grab.
    // One scheduler for all three triggers, so there is no second path that can
    // be the one that ran.
    //
    // Scroll matters for the same reason and only for the same reason: the page
    // layer already re-registers itself against the scroll every frame, so the
    // copy stays true EXCEPT for the elements whose position is pinned to the
    // viewport, which were frozen where they were stuck when it was taken. That
    // is worth one snapshot when the scroll settles, and worth nothing at all
    // per scroll event — re-cloning the document at 60Hz is not a trade.
    useEffect(() => {
      if (bounded || !mounted) return;
      let settle = 0;
      const take = () => {
        if (state.current.dragging) return;
        if (pageRef.current) snapshotPage(pageRef.current);
        loop.paint();
      };
      const later = () => {
        window.clearTimeout(settle);
        settle = window.setTimeout(take, 150);
      };
      later();
      window.addEventListener("resize", later);
      window.addEventListener("scroll", later, { passive: true });
      return () => {
        window.clearTimeout(settle);
        window.removeEventListener("resize", later);
        window.removeEventListener("scroll", later);
      };
    }, [bounded, mounted, loop]);

    // Position is always kept relative to the CONTAINER, whichever element the
    // press landed on. Unbounded, the disc is portalled out and no longer shares
    // a coordinate system with the panel it reads from, so measuring the press
    // against the element under the finger would put the two out of register.
    const rectOf = () => containerRef.current?.getBoundingClientRect();

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      const r = rectOf();
      // The disc sits inside the container while bounded, so one press reaches
      // both handlers on the way up. First one wins.
      if (!r || s.dragging) return;
      // Re-taken on every grab: a snapshot goes stale the moment anything on the
      // page changes, and a grab is the last moment before it matters.
      if (pageRef.current) snapshotPage(pageRef.current);
      s.dragging = true;
      s.pointerId = e.pointerId;
      s.grabX = e.clientX - r.left - s.x;
      s.grabY = e.clientY - r.top - s.y;
      s.vx = 0;
      s.vy = 0;
      s.lastT = e.timeStamp;
      capture.current = e.currentTarget;
      e.currentTarget.setPointerCapture(e.pointerId);
      loop.start();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current;
      if (!s.dragging || e.pointerId !== s.pointerId) return;
      if (capture.current !== e.currentTarget) return;
      const r = rectOf();
      if (!r) return;
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
      const held = capture.current;
      if (held && s.pointerId !== -1 && held.hasPointerCapture(s.pointerId)) {
        held.releasePointerCapture(s.pointerId);
      }
      capture.current = null;
      s.dragging = false;
      s.pointerId = -1;
      loop.start();
    };

    const drag = {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    };

    // Both scaled by the disc, not fixed in pixels. A displacement of a constant
    // number of pixels is a gentle bend on a 400px lens and a violent one on an
    // 80px lens, so the same setting would mean two different optics.
    const scale = refraction * dia * 0.32;
    const rgb = chromatic * dia * 0.09;
    const pad = Math.round(dia * PAD_RATIO);
    const host = dia + pad * 2;
    // Never `blur(0px)`. An identity filter still buys a render surface and
    // redefines the element's damage rect for no visual whatsoever.
    const blurTerm = blur > 0 ? `blur(${blur}px)` : "";
    const glass = map
      ? `url(#${filterId})${blurTerm ? ` ${blurTerm}` : ""}`
      : blurTerm;

    // Unbounded, the disc is portalled to the body and fixed to the viewport.
    // Dropping the container's own `overflow-hidden` is not enough on its own —
    // any ANCESTOR that clips wins, and on a docs page or inside a card there is
    // always one. Leaving the tree is the only version of "bounded by the
    // viewport" that is actually bounded by the viewport.
    const escaped = !bounded && mounted;

    const disc = (
      <div
        ref={lensRef}
        {...drag}
        {...{ [LENS_TAG]: "" }}
        className="cursor-grab touch-none rounded-full select-none active:cursor-grabbing"
        style={{
          position: escaped ? "fixed" : "absolute",
          top: 0,
          left: 0,
          zIndex: escaped ? 9999 : undefined,
          width: dia,
          height: dia,
          boxShadow:
            "0 18px 46px rgb(0 0 0 / 0.45), inset 0 1px 1px rgb(255 255 255 / 0.35)",
        }}
      >
        {/* The clip sits OUTSIDE the filter, and that ordering is the whole
            point. An element's own overflow bounds what goes INTO its filter,
            never what comes out, so clipping here would hand the bevel a
            circle of content on a transparent field — and the bevel pushes
            outward, off the edge of what it was given. */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute"
            style={{
              // Wider than the disc by the furthest any channel can reach, so
              // every sample lands on real content instead of running out of it.
              inset: -pad,
              // The filter is only referenced once its map exists. On the first
              // paint the map is still being rasterised, and in2="map" pointing
              // at a result that has not been produced invalidates the whole
              // chain — which hides the element rather than skipping the filter.
              filter: glass || undefined,
            }}
          >
            {/* Magnification is a real scale about the centre of the disc, not
                a displacement. Displacement can only resample what is already
                there, so faking magnification with it softens the whole window;
                a transform genuinely enlarges and stays sharp. The padded layer
                is concentric with the disc, so its centre is the disc's. */}
            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${magnify})`,
                transformOrigin: "50% 50%",
              }}
            >
              {/* Bounded, the glass reads the children it was handed — live, so
                  it keeps up with every change behind it. Unbounded it is over
                  the whole page instead, which no live duplicate can reach, so
                  it reads a snapshot taken on each grab. Two layers rather than
                  one element with swapped contents: React owns the children,
                  `snapshotPage` owns the copy, and neither writes the other's.

                  BOTH stay mounted, and the inactive one is hidden by
                  `visibility` rather than unmounted or `display: none`. Toggling
                  the mode used to swap which layer existed, which handed the
                  resize observer a duplicate it had never measured — the observer
                  watches the container, and the container had not changed, so the
                  new node kept `width: auto` and the glass came up empty.
                  `visibility` keeps a real box, so the layer can be measured and
                  asserted whether or not it is the one on screen; `display: none`
                  has no layout and would put us back to hoping something re-runs. */}
              <div
                ref={dupRef}
                aria-hidden
                className="absolute top-0 left-0"
                style={{ visibility: escaped ? "hidden" : undefined }}
              >
                {children}
              </div>
              <div
                ref={pageRef}
                aria-hidden
                className="absolute top-0 left-0 select-none"
                style={{
                  visibility: escaped ? undefined : "hidden",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>

        <div
          ref={rimRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${rimColor} 40deg, transparent 110deg, transparent 200deg, ${rimColor}88 250deg, transparent 320deg)`,
            // `closest-side` is load-bearing. A bare `circle` sizes itself to
            // the farthest CORNER of the square box, so 100% resolves to 0.707
            // of the side rather than half of it — the ring lands outside the
            // rounded clip and is cut away in full. The specular is only
            // invisible, not broken, so nothing about it ever looks wrong.
            maskImage:
              "radial-gradient(circle closest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
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
    );

    return (
      <>
      <div
        ref={containerRef}
        className={
          className ??
          `relative h-full w-full touch-none select-none${bounded ? " overflow-hidden" : ""}`
        }
        {...drag}
      >
        <svg aria-hidden className="absolute h-0 w-0" focusable="false">
          <defs>
            {/* No filterUnits or primitiveUnits: primitive coordinates are then
                plain CSS pixels, so feImage at 0,0,size,size lands exactly on
                the glass. Overriding filterUnits to userSpaceOnUse re-anchors
                the region to a coordinate system the HTML element does not
                share, and the map is placed off the element entirely.

                The REGION is pinned by hand, because its default is not the
                element's box — it is ten per cent beyond it on every side, and
                out there the map does not exist. A transparent map reads as
                R=G=0, which is not "no displacement" but MAXIMUM displacement in
                the negative direction, so the skirt sampled half a scale back
                inside the disc and painted a copy of whatever it found there:
                fringed ghost text below the glass and a smear off its right
                edge. Three passes at three scales is why that debris was
                rainbow-coloured. */}
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="0"
              y="0"
              width="100%"
              height="100%"
            >
              {map ? (
                <feImage
                  href={map}
                  result="map"
                  x="0"
                  y="0"
                  width={host}
                  height={host}
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
              {/* Clamped, because a negative scale is not a weaker bend but a
                  bend the other way: at a low refraction with a high chromatic
                  the blue channel would invert and fringe against the other two
                  instead of trailing them. */}
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={Math.max(0, scale - rgb)}
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

        {/* Always mounted, never gated on the measured diameter. The
            observer's callback is what sizes the duplicate, and it fires once
            — hold the disc back until a diameter exists and that callback runs
            against a ref that is still null, so the duplicate keeps its auto
            width and the glass shows a shrink-wrapped scrap of the content
            instead of the content. At a diameter of zero it has no area. */}
        {escaped ? null : disc}
      </div>
      {escaped ? createPortal(disc, document.body) : null}
      </>
    );
  },
);

Lens.displayName = "Lens";

export default Lens;
