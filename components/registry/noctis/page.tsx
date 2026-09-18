import { Archivo_Black, Inter, Space_Mono } from "next/font/google";

import "./template.css";
import NoctisApp from "./noctis-app";

// NOCTIS — a dark, kinetic landing page built entirely on a fragment shader.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <NoctisTemplate /> from a route. It brings its own scroll, type and imagery; the
// only thing it asks of the host is Tailwind and the `cn` helper from @/lib/utils.
//
// ── What makes this one unusual ─────────────────────────────────────────────
// It ships no media. Not one image, video, or font file. Nine surfaces that were
// stock footage in the original — four in the hero switcher, five in the bento
// grid, plus the clipped collages — are all the same shader at different points on
// a preset dial. See gfx/field-shader.ts.
//
// The practical difference: about fifty megabytes of downloads became four
// kilobytes of GLSL, the loading gate in front of the hero is gone because there
// is nothing to buffer, and every surface renders at whatever resolution the
// display actually is.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   imagery    gfx/field-shader.ts   PRESETS — nine values, one per surface
//   colour     template.css          --noctis-yellow and --noctis-violet-50
//   type       the three families below — swap them, keep the variable names
//   copy       the section files; there is no CMS layer to unpick
//
// If you want photography back, gfx/field-canvas.tsx is the single seam: give it
// an <img> or a <video> instead and every surface follows.

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--noctis-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--noctis-body",
  display: "swap",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--noctis-mono",
  display: "swap",
});

export default function NoctisTemplate() {
  return (
    // data-noctis-root is what template.css paints; the font variables have to
    // live on the same element as the font-family that reads them.
    <div
      data-noctis-root
      className={`${display.variable} ${body.variable} ${mono.variable} relative w-full overflow-x-hidden`}
    >
      <NoctisApp />
    </div>
  );
}
