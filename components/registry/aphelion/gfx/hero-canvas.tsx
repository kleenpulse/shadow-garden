"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useStill } from "../hooks/use-still";
import { watchTemplateTokens, type Rgb } from "../lib/token-colors";
import { supportsWebGPU } from "../lib/webgpu";
import { startHeroRenderer, type HeroRendererHandle } from "./hero-renderer";

// The aurora, mounted. Three states, layered so none of them flash:
//
//   1. The CSS fallback (.aphelion-hero-fallback, painted in template.css) is
//      ALWAYS in the tree. It is the no-WebGPU experience (SPEC §V68) and,
//      for everyone else, the loading state while the device spins up.
//   2. When the probe says WebGPU exists, the canvas mounts on top at
//      opacity 0 and the renderer starts.
//   3. On the renderer's first delivered frame the canvas fades in over the
//      fallback — never a blank surface, never a pop.

const ACCENT_FALLBACK: Rgb = [0.498, 0.831, 0.757]; // #7fd4c1
const BG_FALLBACK: Rgb = [0.02, 0.031, 0.063]; // #050810

export default function HeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HeroRendererHandle | null>(null);
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const still = useStill();

  useEffect(() => {
    let alive = true;
    void supportsWebGPU().then((ok) => {
      if (alive && ok) setSupported(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const renderer = startHeroRenderer(canvas, () => setRunning(true));
    rendererRef.current = renderer;

    const unwatch = watchTemplateTokens(
      container,
      ACCENT_FALLBACK,
      BG_FALLBACK,
      ({ accent, background }) => renderer.setColors(accent, background),
    );

    const onPointer = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setPointer(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        ((event.clientY - rect.top) / rect.height) * 2 - 1,
      );
    };
    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      renderer.setScroll(
        Math.min(Math.max(-rect.top / Math.max(rect.height, 1), 0), 1),
      );
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      unwatch();
      renderer.dispose();
      rendererRef.current = null;
      setRunning(false);
    };
  }, [supported]);

  // Reduced motion / bench pause: one resting frame, then silence (SPEC §V70).
  useEffect(() => {
    rendererRef.current?.setStill(still);
  }, [still]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
    >
      <div
        className={cn(
          "aphelion-hero-fallback absolute inset-0 transition-opacity duration-700",
          running ? "opacity-0" : "opacity-100",
        )}
      />
      {supported && (
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-700",
            running ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
