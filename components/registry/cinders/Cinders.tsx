"use client";

import { useEffect, useRef, memo } from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";

const TWO_PI = Math.PI * 2;

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number; // 0..1 progress up the field
  maxLife: number; // frames of lifetime
  seed: number;
  swayFreq: number;
}

interface CindersProps {
  emberCount?: number;
  riseSpeed?: number;
  turbulence?: number;
  emberSize?: number;
  glow?: number;
  draftStrength?: number;
  emberColor?: string;
  backgroundColor?: string;
  /** Halt the canvas loop (renders one final settled frame). */
  paused?: boolean;
  [key: string]: unknown;
}

/** Parse a #rgb / #rrggbb hex into [r,g,b]. Falls back to a warm ember. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [255, 138, 46];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const Cinders = memo(
  ({
    emberCount = 140,
    riseSpeed = 1,
    turbulence = 0.6,
    emberSize = 2,
    glow = 8,
    draftStrength = 1,
    emberColor = "#a855f7",
    backgroundColor = "#0a0510",
    paused = false,
    ...rest
  }: CindersProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const embersRef = useRef<Ember[]>([]);
    const spriteRef = useRef<HTMLCanvasElement | null>(null);
    const spriteHalfRef = useRef(0);
    const sizeRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
    const mouseRef = useRef({
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      speed: 0,
      inside: false,
    });
    const restingRef = useRef(1); // 0 = fully running, 1 = fully settled (dim)
    const rebuildSpriteRef = useRef<(() => void) | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<(() => void | false) | null>(null);
    const measureRef = useRef<((m: Metrics) => void) | null>(null);

    const loop = useAnimationLoop({
      target: containerRef,
      halted: paused,
      dpr: 2,
      resizeDebounceMs: 100,
      onResize: (metrics) => measureRef.current?.(metrics),
      onFrame: () => drawRef.current?.() ?? false,
    });

    const propsRef = useRef<Record<string, unknown>>({});
    propsRef.current = {
      emberCount,
      riseSpeed,
      turbulence,
      emberSize,
      glow,
      draftStrength,
      emberColor,
      backgroundColor,
      paused,
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      measureRef.current = ({ width: w, height: h, dpr, bufferWidth, bufferHeight }) => {
        const parent = canvas!.parentElement;
        if (!parent || w <= 0 || h <= 0) return;
        const rect = parent.getBoundingClientRect();

        canvas!.width = bufferWidth;
        canvas!.height = bufferHeight;
        canvas!.style.width = `${w}px`;
        canvas!.style.height = `${h}px`;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

        sizeRef.current = {
          w,
          h,
          offsetX: rect.left + window.scrollX,
          offsetY: rect.top + window.scrollY,
        };

        buildEmbers();
      };

      function makeEmber(w: number, h: number, atBottom: boolean): Ember {
        const p = propsRef.current;
        const sizeBase = p.emberSize as number;
        return {
          x: Math.random() * w,
          // atBottom spawns fresh along the bottom edge; otherwise scatter
          // across the field so the first frame isn't empty.
          y: atBottom ? h + Math.random() * 24 : Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0,
          size: sizeBase * (0.5 + Math.random() * 0.9),
          life: atBottom ? 0 : Math.random(),
          maxLife: 260 + Math.random() * 260,
          seed: Math.random() * TWO_PI,
          swayFreq: 0.008 + Math.random() * 0.02,
        };
      }

      function buildEmbers() {
        const { w, h } = sizeRef.current;
        const target = Math.max(1, Math.round(propsRef.current.emberCount as number));
        const arr = embersRef.current;
        if (arr.length > target) {
          arr.length = target;
        } else {
          while (arr.length < target) arr.push(makeEmber(w, h, false));
        }
      }

      function buildSprite() {
        const p = propsRef.current;
        const [r, g, b] = hexToRgb(p.emberColor as string);
        // glow is a small halo in px, NOT a multiplier — a spark is a bright hot
        // core with a short glow, never a 150px cloud (which washes to white).
        const coreR = Math.max(1, p.emberSize as number);
        const haloR = Math.max(0, p.glow as number);
        const half = Math.ceil(coreR + haloR + 1);
        const dim = half * 2;
        const off = document.createElement("canvas");
        off.width = dim;
        off.height = dim;
        const octx = off.getContext("2d");
        if (!octx) return;
        const cf = Math.min(0.9, coreR / half); // core fraction of the sprite
        const grad = octx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(cf * 0.6, `rgba(${r},${g},${b},1)`);
        grad.addColorStop(cf, `rgba(${r},${g},${b},0.5)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        octx.fillStyle = grad;
        octx.fillRect(0, 0, dim, dim);
        spriteRef.current = off;
        spriteHalfRef.current = half;
      }
      rebuildSpriteRef.current = buildSprite;

      function updatePointer(pageX: number, pageY: number, inside: boolean) {
        const s = sizeRef.current;
        mouseRef.current.x = pageX - s.offsetX;
        mouseRef.current.y = pageY - s.offsetY;
        mouseRef.current.inside = inside;
      }

      function onMouseMove(e: MouseEvent) {
        const s = sizeRef.current;
        const lx = e.pageX - s.offsetX;
        const ly = e.pageY - s.offsetY;
        const inside = lx >= 0 && lx <= s.w && ly >= 0 && ly <= s.h;
        updatePointer(e.pageX, e.pageY, inside);
      }

      function onTouchMove(e: TouchEvent) {
        const touch = e.touches[0];
        if (!touch) return;
        const s = sizeRef.current;
        const lx = touch.pageX - s.offsetX;
        const ly = touch.pageY - s.offsetY;
        const inside = lx >= 0 && lx <= s.w && ly >= 0 && ly <= s.h;
        updatePointer(touch.pageX, touch.pageY, inside);
      }

      function onLeave() {
        mouseRef.current.inside = false;
        mouseRef.current.x = -9999;
        mouseRef.current.y = -9999;
      }

      function updateMouseSpeed() {
        if (propsRef.current.paused) return;
        const m = mouseRef.current;
        const dx = m.prevX - m.x;
        const dy = m.prevY - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        m.speed += (dist - m.speed) * 0.4;
        if (m.speed < 0.001) m.speed = 0;
        m.prevX = m.x;
        m.prevY = m.y;
      }

      const speedInterval = setInterval(updateMouseSpeed, 20);

      let frameCount = 0;
      function paintBackground() {
        const { w, h } = sizeRef.current;
        ctx!.globalCompositeOperation = "source-over";
        ctx!.fillStyle = propsRef.current.backgroundColor as string;
        ctx!.fillRect(0, 0, w, h);
      }

      function tick() {
        frameCount++;
        const p = propsRef.current;
        const { w, h } = sizeRef.current;
        const embers = embersRef.current;
        const sprite = spriteRef.current;
        const spriteHalf = spriteHalfRef.current;
        const m = mouseRef.current;

        const still = p.paused as boolean;
        // Ease the whole field toward rest when still, back to life when active.
        const target = still ? 1 : 0;
        restingRef.current += (target - restingRef.current) * 0.08;
        if (still && restingRef.current > 0.985) restingRef.current = 1;
        if (!still && restingRef.current < 0.002) restingRef.current = 0;
        const rest = restingRef.current;
        const activity = 1 - rest; // 0 settled .. 1 fully alive

        paintBackground();

        // Ember-pool: a faint amethyst glow pooling at the bottom edge, as if a
        // fire burns just out of frame below — grounds the rising sparks.
        if (activity > 0.01) {
          const [pr, pg, pb] = hexToRgb(p.emberColor as string);
          const poolH = Math.min(h * 0.4, 180);
          const grad = ctx!.createLinearGradient(0, h, 0, h - poolH);
          grad.addColorStop(0, `rgba(${pr},${pg},${pb},${0.22 * activity})`);
          grad.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
          ctx!.globalCompositeOperation = "lighter";
          ctx!.fillStyle = grad;
          ctx!.fillRect(0, h - poolH, w, poolH);
        }

        // Sprite not baked yet — keep the loop alive unless fully settled.
        if (!sprite) {
          return still && rest >= 1 ? false : undefined;
        }

        const rise = (p.riseSpeed as number) * activity;
        const turb = (p.turbulence as number) * activity;
        const draft = p.draftStrength as number;
        const t = frameCount * 0.02;
        const pointerActive = m.inside && !still;
        const draftRadius = 140;
        const draftRadiusSq = draftRadius * draftRadius;

        ctx!.globalCompositeOperation = "lighter";

        for (let i = 0; i < embers.length; i++) {
          const e = embers[i];

          // Horizontal sway.
          const sway = Math.sin(e.seed + frameCount * e.swayFreq) * turb;

          // Cursor draft: nudge nearby motes radially, scaled by pointer speed
          // and draftStrength, decaying with distance.
          if (pointerActive && m.speed > 0.05) {
            const dx = e.x - m.x;
            const dy = e.y - m.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < draftRadiusSq && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const falloff = 1 - dist / draftRadius;
              const push =
                falloff * falloff * draft * Math.min(m.speed, 40) * 0.02;
              e.vx += (dx / dist) * push;
              e.vy += (dy / dist) * push;
            }
          }

          // Integrate. Buoyancy pulls upward (negative y).
          e.vy += (-(rise * (0.6 + e.size * 0.15)) - e.vy) * 0.06;
          e.vx *= 0.92;
          e.vy *= 0.98;

          e.x += e.vx + sway * 0.4;
          e.y += e.vy;

          // Lifetime progress by frame budget so recycling is stable.
          e.life += (1 / e.maxLife) * (0.4 + activity);

          // Recycle at top edge, on expiry, or if drifted far off-screen.
          if (e.y < -spriteHalf || e.life >= 1 || e.x < -60 || e.x > w + 60) {
            const fresh = makeEmber(w, h, true);
            embers[i] = fresh;
            continue;
          }

          // Alpha: ease-in at spawn (bottom), ease-out near the top.
          const heightFrac = 1 - e.y / (h || 1); // 0 bottom .. 1 top
          const easeIn = Math.min(1, e.life * 6);
          const easeOut = Math.min(1, (1 - heightFrac) * 2.4 + 0.05);
          let alpha = easeIn * easeOut * (0.55 + 0.45 * activity);
          // Dim survivors when settled so the final frame reads calm, not black.
          alpha *= 0.35 + 0.65 * activity;
          // Twinkle like a live ember.
          alpha *=
            0.72 + 0.28 * Math.sin(e.seed * 3 + frameCount * (0.22 + e.swayFreq * 6));
          if (alpha <= 0.002) continue;

          // Cooler / smaller as it rises toward ash. Sprite already bakes the
          // core+halo at the base ember size, so scale by this ember's size.
          const shrink = 1 - heightFrac * 0.4;
          const baseSize = Math.max(0.001, p.emberSize as number);
          const scale = (e.size / baseSize) * shrink;
          const dw = spriteHalf * 2 * scale;

          ctx!.globalAlpha = Math.min(1, alpha);
          ctx!.drawImage(sprite, e.x - dw / 2, e.y - dw / 2, dw, dw);
        }

        ctx!.globalAlpha = 1;
        ctx!.globalCompositeOperation = "source-over";

        if (still && rest >= 1) return false;
      }
      drawRef.current = tick;

      buildSprite();
      loop.resize();

      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("touchstart", onTouchMove, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onLeave, { passive: true });
      window.addEventListener("touchcancel", onLeave, { passive: true });
      window.addEventListener("mouseout", onLeave, { passive: true });

      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        clearInterval(speedInterval);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("touchstart", onTouchMove);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onLeave);
        window.removeEventListener("touchcancel", onLeave);
        window.removeEventListener("mouseout", onLeave);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Rebuild the pre-baked sprite when its keys change, then repaint.
    useEffect(() => {
      rebuildSpriteRef.current?.();
      loop.paint();
    }, [emberColor, emberSize, glow, loop]);

    return (
      <div ref={containerRef} className="relative h-full w-full" {...rest}>
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    );
  }
);

Cinders.displayName = "Cinders";

export default Cinders;
