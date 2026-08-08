"use client";

import type { PreviewProps } from "@/lib/registry/types";
import BorderGlow from "./border-glow";

// BorderGlow's glowColor is an "H S L" triplet string; convert from the hex control.
function hexToHsl(hex: string): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
}

export default function BorderGlowPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <BorderGlow
        glowColor={hexToHsl(values.glowColor as string)}
        backgroundColor="var(--color-panel)"
        glowRadius={values.glowRadius as number}
        glowIntensity={values.glowIntensity as number}
        coneSpread={values.coneSpread as number}
        edgeSensitivity={values.edgeSensitivity as number}
        borderRadius={values.borderRadius as number}
        fillOpacity={values.fillOpacity as number}
        animated={reducedMotion ? false : (values.animated as boolean)}
      >
        <div className="flex h-52 w-72 items-center justify-center p-6 text-center font-display text-sm uppercase tracking-widest text-ink-dim">
          Move your cursor to the edges
        </div>
      </BorderGlow>
    </div>
  );
}
