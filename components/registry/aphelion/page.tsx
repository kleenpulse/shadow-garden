import { Instrument_Serif, Space_Grotesk } from "next/font/google";

import "./template.css";
import AphelionApp from "./aphelion-app";

// APHELION — a dark-sky observatory retreat.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <AphelionTemplate /> from a route. It brings its own scroll, its own type
// and its own sky; the only things it asks of the host are Tailwind, the `cn`
// helper from @/lib/utils, and the `vgpu` package for the WebGPU layers.
//
// The sky is entirely procedural. The aurora and the starfield are WGSL
// shaders (gfx/), the room windows and fallbacks are CSS gradients — the whole
// template ships without a single image, video or model file.
//
// WebGPU is a progressive layer, not a requirement: browsers without it get a
// designed CSS night sky instead of a canvas (lib/webgpu.ts decides), and
// visitors with reduced motion get one still frame of it.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts          every string on the page
//   colour     template.css              --accent and --background drive the
//                                        CSS *and* the shader uniforms
//   type       the two families below    swap them, keep the variable names
//   sky        gfx/hero-shader.ts        the aurora, as commented WGSL
//
// Two downloaded families, not four. The `fontPair` control offers four
// voices, but the other two resolve to system serif and system mono stacks in
// template.css — respectable faces that cost nothing.

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--aphelion-display",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--aphelion-grotesk",
  display: "swap",
});

export default function AphelionTemplate() {
  return (
    // data-aphelion-root is what template.css paints; the font variables have
    // to live on the same element as the font-family that reads them.
    <div
      data-aphelion-root
      className={`${display.variable} ${grotesk.variable} relative w-full overflow-x-hidden`}
    >
      <AphelionApp />
    </div>
  );
}
