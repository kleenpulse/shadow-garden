import { DM_Serif_Text, Inter } from "next/font/google";

import "./template.css";
import EmberApp from "./ember-app";

// EMBER & OAK — a cocktail bar landing page.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <EmberOakTemplate /> from a route. It brings its own scroll, type and imagery;
// the only thing it asks of the host is Tailwind and the `cn` helper from
// @/lib/utils.
//
// ── What makes this one unusual ─────────────────────────────────────────────
// It ships no media. The hero was a 25MB video scrubbed by scroll — the timeline
// tweened `video.currentTime`, which means seeking a compressed stream on every
// tick and stuttering between keyframes. The same ScrollTrigger now drives a
// `uProgress` uniform on a fragment shader instead: identical choreography, no
// download, no seeking. See gfx/field-shader.ts.
//
// The twenty-odd decorative rasters — leaves flanking every heading, four glasses,
// four portraits — are drawn by miscellaneous/ornament.tsx. They were flat
// single-colour silhouettes; they are flat single-colour silhouettes still, just
// generated rather than fetched.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts      the menu, the hours, the testimonials
//   imagery    gfx/field-shader.ts   PRESETS, and miscellaneous/ornament.tsx
//   colour     template.css          --eo-yellow is the brand
//   type       the two families below — swap them, keep the variable names
//
// If you want photography back, gfx/field-canvas.tsx and ornament.tsx are the two
// seams; nothing else in the template touches imagery.

const display = DM_Serif_Text({
  subsets: ["latin"],
  weight: "400",
  variable: "--eo-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--eo-body",
  display: "swap",
});

export default function EmberOakTemplate() {
  return (
    // data-ember-root is what template.css paints; the font variables have to live
    // on the same element as the font-family that reads them.
    <div
      data-ember-root
      className={`${display.variable} ${body.variable} relative w-full overflow-x-hidden`}
    >
      <EmberApp />
    </div>
  );
}
