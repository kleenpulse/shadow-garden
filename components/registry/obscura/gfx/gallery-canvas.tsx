"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useStill } from "../hooks/use-still";
import { watchTemplateTokens, type Rgb } from "../lib/token-colors";
import { supportsWebGPU } from "../lib/webgpu";
import {
  startGalleryRenderer,
  type GalleryRendererHandle,
} from "./gallery-renderer";

// One work-card's picture plane. Same layering as the hero: the real <img>
// underneath for crawlers, loading and the no-WebGPU path (its CSS hover in
// template.css is the fallback interaction), the canvas fading in on top when
// the renderer delivers. The IntersectionObserver is the budget: six cards
// share one GPU device, and only the ones on screen get to spend frames.

const ACCENT_FALLBACK: Rgb = [0.827, 0.271, 0.169]; // #d3452b
const BG_FALLBACK: Rgb = [0.047, 0.039, 0.035]; // #0c0a09

type GalleryCanvasProps = {
  src: string;
  alt: string;
  className?: string;
};

export default function GalleryCanvas({
  src,
  alt,
  className,
}: GalleryCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GalleryRendererHandle | null>(null);
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

    const renderer = startGalleryRenderer(canvas, src, () => setRunning(true));
    rendererRef.current = renderer;

    const unwatch = watchTemplateTokens(
      container,
      ACCENT_FALLBACK,
      BG_FALLBACK,
      ({ accent }) => renderer.setColors(accent),
    );

    const observer = new IntersectionObserver(
      ([entry]) => renderer.setActive(entry?.isIntersecting ?? true),
      { rootMargin: "20% 0px" },
    );
    observer.observe(container);

    const onMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setPointer(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
    };
    const onEnter = () => renderer.setHover(true);
    const onLeave = () => renderer.setHover(false);
    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);

    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerenter", onEnter);
      container.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
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
    <div
      ref={containerRef}
      className={cn("group/plate relative overflow-hidden", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see hero-canvas */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/plate:scale-[1.04]"
      />
      <div aria-hidden="true" className="obscura-grain absolute inset-0" />
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
