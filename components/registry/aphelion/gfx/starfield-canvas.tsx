"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useStill } from "../hooks/use-still";
import { watchTemplateTokens, type Rgb } from "../lib/token-colors";
import { supportsWebGPU } from "../lib/webgpu";
import {
  startStarfieldRenderer,
  type StarfieldRendererHandle,
} from "./starfield-renderer";

// The sky behind everything. This canvas is fixed across the whole viewport
// and paints the --background token as its clear color, so it IS the page
// background — the sections above it stay transparent and the stars show in
// every gap. Same three-layer mount story as the hero: CSS star fallback
// always present, canvas fades in over it on the first delivered frame.

const ACCENT_FALLBACK: Rgb = [0.498, 0.831, 0.757]; // #7fd4c1
const BG_FALLBACK: Rgb = [0.02, 0.031, 0.063]; // #050810

export default function StarfieldCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StarfieldRendererHandle | null>(null);
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

    const renderer = startStarfieldRenderer(canvas, () => setRunning(true));
    rendererRef.current = renderer;

    const unwatch = watchTemplateTokens(
      container,
      ACCENT_FALLBACK,
      BG_FALLBACK,
      ({ accent, background }) => renderer.setColors(accent, background),
    );

    const onPointer = (event: PointerEvent) => {
      renderer.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    const onScroll = () => {
      renderer.setScroll(window.scrollY / Math.max(window.innerHeight, 1));
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

  useEffect(() => {
    rendererRef.current?.setStill(still);
  }, [still]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 z-0"
    >
      <div
        className={cn(
          "aphelion-stars-fallback absolute inset-0 transition-opacity duration-700",
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
