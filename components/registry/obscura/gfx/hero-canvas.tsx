"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useStill } from "../hooks/use-still";
import { watchTemplateTokens, type Rgb } from "../lib/token-colors";
import { supportsWebGPU } from "../lib/webgpu";
import { startHeroRenderer, type HeroRendererHandle } from "./hero-renderer";

// The hero photograph, mounted. The DOM <img> is ALWAYS in the tree — it is
// the no-WebGPU experience (SPEC §V68), the loading state while the device
// and the texture arrive, and the thing a crawler indexes. When the renderer
// delivers its first frame the canvas fades in over it; the CSS grain and
// leak overlays in template.css keep the fallback from feeling undeveloped.

const ACCENT_FALLBACK: Rgb = [0.827, 0.271, 0.169]; // #d3452b
const BG_FALLBACK: Rgb = [0.047, 0.039, 0.035]; // #0c0a09

type HeroCanvasProps = {
  src: string;
  alt: string;
};

export default function HeroCanvas({ src, alt }: HeroCanvasProps) {
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

    const renderer = startHeroRenderer(canvas, src, () => setRunning(true));
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
  }, [supported, src]);

  useEffect(() => {
    rendererRef.current?.setStill(still);
  }, [still]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- the template
          ships into arbitrary hosts; next/image needs host config for a
          remote CDN, a plain img needs nothing (the CDN serves AVIF anyway) */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="obscura-grain absolute inset-0" />
      <div
        aria-hidden="true"
        className={cn(
          "obscura-hero-leak absolute inset-0 transition-opacity duration-700",
          running ? "opacity-0" : "opacity-100",
        )}
      />
      {supported && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-700",
            running ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
