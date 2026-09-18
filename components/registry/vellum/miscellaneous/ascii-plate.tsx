"use client";

import { useEffect, useRef, useState } from "react";

// Renders an image as ASCII, behind the card back.
//
// Hand-rolled rather than pulled from a package. The whole job is: draw to an
// offscreen canvas at glyph resolution, read the luminance, index a ramp. Forty
// lines, no dependency, and a buyer installs nothing extra for one card effect —
// which matters more here than it would in an app, because a template's
// dependency list is something they have to agree to before they can paste it.

/** Dark → light. Reversed at draw time so dense glyphs land on dark pixels. */
const RAMP = "@%#*+=-:. ";

export default function AsciiPlate({
  src,
  columns = 72,
  rows = 58,
  color = "#7a7a7a",
}: {
  src: string;
  columns?: number;
  rows?: number;
  color?: string;
}) {
  const [art, setArt] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const image = new Image();
    // Data URIs and same-origin sources only — a tainted canvas throws on read,
    // and there is nothing to recover from at that point.
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (cancelled.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = columns;
      canvas.height = rows;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(image, 0, 0, columns, rows);
      let pixels: Uint8ClampedArray;
      try {
        pixels = context.getImageData(0, 0, columns, rows).data;
      } catch {
        return;
      }

      const lines: string[] = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < columns; x++) {
          const i = (y * columns + x) * 4;
          const alpha = pixels[i + 3]! / 255;
          // Rec. 601 luma, faded toward white by the alpha so transparent
          // regions land on the ramp's blank end instead of its densest glyph.
          const luma =
            (0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!) *
              alpha +
            255 * (1 - alpha);
          line += RAMP[Math.min(RAMP.length - 1, Math.floor((luma / 255) * RAMP.length))];
        }
        lines.push(line);
      }
      setArt(lines.join("\n"));
    };

    image.src = src;
    return () => {
      cancelled.current = true;
    };
  }, [src, columns, rows]);

  if (!art) return null;

  return (
    <pre
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-40"
      style={{
        color,
        fontWeight: 900,
        fontSize: "11px",
        lineHeight: "0.9",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {art}
    </pre>
  );
}
