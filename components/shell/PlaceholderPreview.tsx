"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { PreviewProps } from "@/lib/registry/types";

const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

// Reference stand-in shown until a real component is registered for a slug. It
// reacts to the same tuned props the real component will (amplitude/speed/color/
// lineCount/...), so the controls→URL→preview loop is demonstrably live now.
export default function PlaceholderPreview({
  values,
  reducedMotion,
  showLabel = true,
}: PreviewProps & { showLabel?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const t = useTranslations("chrome.placeholderPreview");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (time: number) => {
      const v = valuesRef.current;
      const amplitude = num(v.amplitude, 1);
      const speed = num(v.speed, 1);
      const color = str(v.color, "#5eead4");
      const lineCount = Math.round(num(v.lineCount, 24));
      const lineWidth = num(v.lineWidth, 2);
      const lineBlur = num(v.lineBlur, 0);
      const convergence = num(v.convergence, 0.5);

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = lineBlur;

      const phase = reducedMotion ? 0 : (time / 1000) * speed;
      for (let i = 0; i < lineCount; i++) {
        const yBase = (height / (lineCount + 1)) * (i + 1);
        ctx.beginPath();
        for (let x = 0; x <= width; x += 6) {
          const k = x / width;
          const envelope = Math.sin(k * Math.PI);
          const conv = 1 - convergence * (1 - envelope);
          const y = yBase + Math.sin(k * 8 + phase + i * 0.3) * 18 * amplitude * conv;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = 0.12 + 0.5 * (i / lineCount);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!reducedMotion) rafRef.current = requestAnimationFrame(draw);
    };

    if (reducedMotion) draw(0);
    else rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [reducedMotion]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
      {showLabel && (
        <span className="pointer-events-none absolute bottom-3 left-3 font-display text-[10px] uppercase tracking-[0.2em] text-ink-mute">
          {t("label")}
        </span>
      )}
    </div>
  );
}
