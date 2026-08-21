"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAnimationLoop } from "@/hooks/use-animation-loop";

export type CanvasBackdrop = "dots" | "lines" | "none";

export interface InfiniteCanvasNode {
  id: string;
  /** World-space position of the card's top-left corner. */
  x: number;
  y: number;
  width?: number;
  content: ReactNode;
}

export interface InfiniteCanvasProps {
  nodes?: InfiniteCanvasNode[];
  /** Per-frame-at-60fps glide decay after a thrown pan. */
  friction?: number;
  zoomSpeed?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Snap cards to the grid on drop. */
  gridSnap?: boolean;
  gridSize?: number;
  minimap?: boolean;
  backdrop?: CanvasBackdrop;
  paused?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const DEFAULT_NODES: InfiniteCanvasNode[] = [
  { id: "a", x: 40, y: 60, content: "Drag the background to pan." },
  { id: "b", x: 340, y: 140, content: "Wheel zooms to the cursor." },
  { id: "c", x: 120, y: 320, content: "Cards drag independently." },
];

const MINIMAP_W = 128;
const MINIMAP_H = 88;

const InfiniteCanvas = ({
  nodes = DEFAULT_NODES,
  friction = 0.92,
  zoomSpeed = 1,
  minZoom = 0.25,
  maxZoom = 3,
  gridSnap = true,
  gridSize = 24,
  minimap = true,
  backdrop = "dots",
  paused = false,
  reducedMotion = false,
  className,
}: InfiniteCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const viewportRectRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);

  const live = useRef({
    friction,
    zoomSpeed,
    minZoom,
    maxZoom,
    gridSnap,
    gridSize,
    backdrop,
    paused,
    reducedMotion,
  });
  live.current = {
    friction,
    zoomSpeed,
    minZoom,
    maxZoom,
    gridSnap,
    gridSize,
    backdrop,
    paused,
    reducedMotion,
  };

  // ONE source of truth for the camera, written by handlers and the loop.
  // Every consumer — world transform, backdrop, minimap — derives from it in
  // one write pass per frame. React never renders a camera frame.
  const cam = useRef({
    x: 24,
    y: 24,
    scale: 1,
    vx: 0,
    vy: 0,
    zoomTarget: 1,
    anchorX: 0,
    anchorY: 0,
    glide: null as { x: number; y: number } | null,
    panning: false,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    // second pointer for pinch
    pointers: new Map<number, { x: number; y: number }>(),
    pinchDist: 0,
  });

  // Card world positions, mutated by drags without a React render.
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const dragging = useRef<{
    id: string;
    el: HTMLElement;
    startWX: number;
    startWY: number;
    startPX: number;
    startPY: number;
    snapGlide: boolean;
  } | null>(null);

  const applyRef = useRef<(() => void) | null>(null);
  const drawRef = useRef<((dt: number) => void | false) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    onResize: () => applyRef.current?.(),
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    const container = containerRef.current;
    const world = worldRef.current;
    if (!container || !world) return;

    const c = cam.current;
    c.zoomTarget = c.scale;

    const nodeEls = () =>
      Array.from(world.querySelectorAll<HTMLElement>("[data-node]"));

    // world bounds for the minimap, from live card positions
    const worldBounds = () => {
      let minX = 0;
      let minY = 0;
      let maxX = 400;
      let maxY = 300;
      for (const el of nodeEls()) {
        const p = positions.current.get(el.dataset.node ?? "");
        if (!p) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + el.offsetWidth);
        maxY = Math.max(maxY, p.y + el.offsetHeight);
      }
      return { minX: minX - 80, minY: minY - 80, maxX: maxX + 80, maxY: maxY + 80 };
    };

    // ── the single write pass ────────────────────────────────────────────────
    const apply = () => {
      const L = live.current;
      world.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.scale})`;

      // backdrop plane moves with the camera
      if (L.backdrop !== "none") {
        const cell = L.gridSize * c.scale;
        container.style.backgroundSize =
          L.backdrop === "dots" ? `${cell}px ${cell}px` : `${cell}px ${cell}px`;
        container.style.backgroundPosition = `${c.x}px ${c.y}px`;
      } else {
        container.style.backgroundSize = "";
        container.style.backgroundPosition = "";
      }

      // minimap mirrors extent + viewport
      const mini = minimapRef.current;
      const vp = viewportRectRef.current;
      if (mini && vp) {
        const b = worldBounds();
        const bw = Math.max(b.maxX - b.minX, 1);
        const bh = Math.max(b.maxY - b.minY, 1);
        const k = Math.min(MINIMAP_W / bw, MINIMAP_H / bh);
        for (const el of nodeEls()) {
          const id = el.dataset.node ?? "";
          const p = positions.current.get(id);
          const m = mini.querySelector<HTMLElement>(`[data-mini="${id}"]`);
          if (!p || !m) continue;
          m.style.left = `${(p.x - b.minX) * k}px`;
          m.style.top = `${(p.y - b.minY) * k}px`;
          m.style.width = `${Math.max(el.offsetWidth * k, 3)}px`;
          m.style.height = `${Math.max(el.offsetHeight * k, 2)}px`;
        }
        const rect = container.getBoundingClientRect();
        vp.style.left = `${(-c.x / c.scale - b.minX) * k}px`;
        vp.style.top = `${(-c.y / c.scale - b.minY) * k}px`;
        vp.style.width = `${(rect.width / c.scale) * k}px`;
        vp.style.height = `${(rect.height / c.scale) * k}px`;
      }
    };
    applyRef.current = apply;

    // seed card positions and paint the initial camera
    for (const el of nodeEls()) {
      const id = el.dataset.node ?? "";
      if (!positions.current.has(id)) {
        positions.current.set(id, {
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
        });
      }
    }
    apply();

    // ── frame body: inertia, zoom easing, snap glides ───────────────────────
    const frame = (dt: number) => {
      const L = live.current;
      const still = L.paused || L.reducedMotion;

      // pan inertia
      if (!c.panning && (Math.abs(c.vx) > 0.01 || Math.abs(c.vy) > 0.01)) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const decay = still ? 0 : Math.exp(Math.log(Math.max(L.friction, 0.01)) * dt * 60);
        c.vx *= decay;
        c.vy *= decay;
        if (Math.abs(c.vx) < 0.5) c.vx = 0;
        if (Math.abs(c.vy) < 0.5) c.vy = 0;
      }

      // zoom-to-cursor: hold the anchored world point fixed while easing
      if (Math.abs(c.zoomTarget - c.scale) > 0.0005) {
        const next = still
          ? c.zoomTarget
          : c.scale + (c.zoomTarget - c.scale) * Math.min(1, dt * 12);
        const ratio = next / c.scale;
        c.x = c.anchorX - (c.anchorX - c.x) * ratio;
        c.y = c.anchorY - (c.anchorY - c.y) * ratio;
        c.scale = next;
      } else {
        c.scale = c.zoomTarget;
      }

      // minimap jump glide
      if (c.glide) {
        const k = still ? 1 : Math.min(1, dt * 10);
        c.x += (c.glide.x - c.x) * k;
        c.y += (c.glide.y - c.y) * k;
        if (Math.abs(c.glide.x - c.x) < 0.5 && Math.abs(c.glide.y - c.y) < 0.5) {
          c.x = c.glide.x;
          c.y = c.glide.y;
          c.glide = null;
        }
      }

      // a dropped card gliding onto its snap point
      const d = dragging.current;
      if (d?.snapGlide) {
        const p = positions.current.get(d.id);
        if (p) {
          const g = Math.max(L.gridSize, 1);
          const tx = Math.round(p.x / g) * g;
          const ty = Math.round(p.y / g) * g;
          const k = still ? 1 : Math.min(1, dt * 14);
          p.x += (tx - p.x) * k;
          p.y += (ty - p.y) * k;
          d.el.style.left = `${p.x}px`;
          d.el.style.top = `${p.y}px`;
          if (Math.abs(tx - p.x) < 0.5 && Math.abs(ty - p.y) < 0.5) {
            p.x = tx;
            p.y = ty;
            d.el.style.left = `${tx}px`;
            d.el.style.top = `${ty}px`;
            dragging.current = null;
          }
        } else {
          dragging.current = null;
        }
      }

      apply();

      const settled =
        !c.panning &&
        c.vx === 0 &&
        c.vy === 0 &&
        Math.abs(c.zoomTarget - c.scale) <= 0.0005 &&
        !c.glide &&
        !(dragging.current && dragging.current.snapGlide);
      if (settled) {
        // will-change lives exactly as long as the motion
        world.style.willChange = "";
        return false;
      }
      world.style.willChange = "transform";
    };
    drawRef.current = frame;

    // ── gestures ────────────────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      c.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      container.setPointerCapture(e.pointerId);

      if (c.pointers.size === 2) {
        const [p1, p2] = Array.from(c.pointers.values());
        c.pinchDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        return;
      }

      const card = target.closest<HTMLElement>("[data-node]");
      if (card && world.contains(card)) {
        const p = positions.current.get(card.dataset.node ?? "");
        if (!p) return;
        dragging.current = {
          id: card.dataset.node ?? "",
          el: card,
          startWX: p.x,
          startWY: p.y,
          startPX: e.clientX,
          startPY: e.clientY,
          snapGlide: false,
        };
        card.style.zIndex = "10";
        return;
      }

      c.panning = true;
      c.glide = null;
      c.vx = 0;
      c.vy = 0;
      c.lastX = e.clientX;
      c.lastY = e.clientY;
      c.lastT = performance.now();
      loop.start();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (c.pointers.has(e.pointerId)) {
        c.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // pinch zoom: two live pointers
      if (c.pointers.size === 2) {
        const [p1, p2] = Array.from(c.pointers.values());
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (c.pinchDist > 0) {
          const L = live.current;
          const rect = container.getBoundingClientRect();
          c.anchorX = (p1.x + p2.x) / 2 - rect.left;
          c.anchorY = (p1.y + p2.y) / 2 - rect.top;
          c.zoomTarget = Math.max(
            L.minZoom,
            Math.min(L.maxZoom, c.zoomTarget * (dist / c.pinchDist)),
          );
        }
        c.pinchDist = dist;
        loop.start();
        return;
      }

      const d = dragging.current;
      if (d && !d.snapGlide) {
        const p = positions.current.get(d.id);
        if (!p) return;
        // screen delta → world delta
        p.x = d.startWX + (e.clientX - d.startPX) / c.scale;
        p.y = d.startWY + (e.clientY - d.startPY) / c.scale;
        d.el.style.left = `${p.x}px`;
        d.el.style.top = `${p.y}px`;
        applyRef.current?.();
        return;
      }

      if (c.panning) {
        const now = performance.now();
        const dx = e.clientX - c.lastX;
        const dy = e.clientY - c.lastY;
        const dtms = Math.max(now - c.lastT, 1);
        c.x += dx;
        c.y += dy;
        c.vx = (dx / dtms) * 1000;
        c.vy = (dy / dtms) * 1000;
        c.lastX = e.clientX;
        c.lastY = e.clientY;
        c.lastT = now;
        applyRef.current?.();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      c.pointers.delete(e.pointerId);
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (c.pointers.size < 2) c.pinchDist = 0;

      const d = dragging.current;
      if (d && !d.snapGlide) {
        d.el.style.zIndex = "";
        if (live.current.gridSnap) {
          d.snapGlide = true;
          loop.start();
        } else {
          dragging.current = null;
        }
        return;
      }

      if (c.panning) {
        c.panning = false;
        // a stale velocity from a stop-then-release reads as a ghost push
        if (performance.now() - c.lastT > 90) {
          c.vx = 0;
          c.vy = 0;
        }
        loop.start();
      }
    };

    // React's onWheel is passive — preventDefault would fail silently, and the
    // page would scroll instead of zooming.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const L = live.current;
      const rect = container.getBoundingClientRect();
      c.anchorX = e.clientX - rect.left;
      c.anchorY = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0012 * L.zoomSpeed);
      c.zoomTarget = Math.max(L.minZoom, Math.min(L.maxZoom, c.zoomTarget * factor));
      loop.start();
    };

    // keyboard: arrows pan, +/- zoom around the center
    const onKeyDown = (e: KeyboardEvent) => {
      const L = live.current;
      const rect = container.getBoundingClientRect();
      const step = 48;
      let handled = true;
      if (e.key === "ArrowLeft") c.x += step;
      else if (e.key === "ArrowRight") c.x -= step;
      else if (e.key === "ArrowUp") c.y += step;
      else if (e.key === "ArrowDown") c.y -= step;
      else if (e.key === "+" || e.key === "=") {
        c.anchorX = rect.width / 2;
        c.anchorY = rect.height / 2;
        c.zoomTarget = Math.min(L.maxZoom, c.zoomTarget * 1.2);
      } else if (e.key === "-" || e.key === "_") {
        c.anchorX = rect.width / 2;
        c.anchorY = rect.height / 2;
        c.zoomTarget = Math.max(L.minZoom, c.zoomTarget / 1.2);
      } else handled = false;
      if (handled) {
        e.preventDefault();
        loop.start();
      }
    };

    const onMinimapDown = (e: PointerEvent) => {
      const mini = minimapRef.current;
      if (!mini) return;
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      const mrect = mini.getBoundingClientRect();
      const b = worldBounds();
      const bw = Math.max(b.maxX - b.minX, 1);
      const bh = Math.max(b.maxY - b.minY, 1);
      const k = Math.min(MINIMAP_W / bw, MINIMAP_H / bh);
      const wx = (e.clientX - mrect.left) / k + b.minX;
      const wy = (e.clientY - mrect.top) / k + b.minY;
      // center the clicked world point
      cam.current.glide = {
        x: rect.width / 2 - wx * c.scale,
        y: rect.height / 2 - wy * c.scale,
      };
      loop.start();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("keydown", onKeyDown);
    const mini = minimapRef.current;
    mini?.addEventListener("pointerdown", onMinimapDown);

    loop.start();

    return () => {
      drawRef.current = null;
      applyRef.current = null;
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("keydown", onKeyDown);
      mini?.removeEventListener("pointerdown", onMinimapDown);
      world.style.willChange = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // backdrop / grid tuning repaints the derived surfaces
  useEffect(() => {
    applyRef.current?.();
  }, [backdrop, gridSize, minimap]);

  const backdropStyle: React.CSSProperties =
    backdrop === "dots"
      ? {
          backgroundImage:
            "radial-gradient(color-mix(in oklab, var(--sg-ink) 18%, transparent) 1px, transparent 1px)",
        }
      : backdrop === "lines"
        ? {
            backgroundImage:
              "linear-gradient(color-mix(in oklab, var(--sg-ink) 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--sg-ink) 9%, transparent) 1px, transparent 1px)",
          }
        : {};

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Pannable canvas. Arrow keys pan, plus and minus zoom."
      tabIndex={0}
      // touch-none + select-none: a finger drag pans the board instead of
      // scrolling the page, and a drag across card text never starts a native
      // text-drag that would cancel the gesture mid-throw.
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden bg-surface",
        "cursor-grab focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing",
        className,
      )}
      style={backdropStyle}
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
        {nodes.map((node) => (
          <div
            key={node.id}
            data-node={node.id}
            className="absolute touch-none rounded-lg border border-hairline bg-panel p-3 text-xs leading-relaxed text-ink shadow-lg"
            style={{
              left: node.x,
              top: node.y,
              width: node.width ?? 200,
              cursor: "grab",
            }}
          >
            {node.content}
          </div>
        ))}
      </div>

      {minimap && (
        <div
          ref={minimapRef}
          className="absolute bottom-3 right-3 overflow-hidden rounded-md border border-hairline bg-panel/80 backdrop-blur-sm"
          style={{ width: MINIMAP_W, height: MINIMAP_H }}
        >
          {nodes.map((node) => (
            <div
              key={node.id}
              data-mini={node.id}
              className="absolute rounded-[2px] bg-ink-mute/60"
            />
          ))}
          <div
            ref={viewportRectRef}
            className="absolute rounded-sm border border-accent/80"
          />
        </div>
      )}
    </div>
  );
};

export default InfiniteCanvas;
