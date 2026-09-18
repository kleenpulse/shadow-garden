import { Fraunces, IBM_Plex_Mono } from "next/font/google";

import "./template.css";
import ObscuraApp from "./obscura-app";

// OBSCURA — a photographic studio and darkroom.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <ObscuraTemplate /> from a route. It brings its own scroll, its own type and
// its own grain; the only things it asks of the host are Tailwind, the `cn`
// helper from @/lib/utils, and the `vgpu` package for the WebGPU layers.
//
// The photography is delivered through ../_shared/cdn.ts — swap the public
// ids in lib/constants.ts (or the NEXT_PUBLIC_TEMPLATE_CDN account) and the
// site reshoots itself. The darkroom effects on top of the photographs are
// WGSL shaders in gfx/: pointer parallax, chromatic fringing, animated grain
// and a breathing light leak on the hero; a ripple-and-RGB-split hover on
// every print in the gallery.
//
// WebGPU is a progressive layer, not a requirement: every picture plane keeps
// a real <img> underneath (lib/webgpu.ts decides), so browsers without WebGPU
// get the same page with CSS grain instead of shader grain — and visitors
// with reduced motion get one still frame of everything.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts          every string, and every public id
//   colour     template.css              --accent is the safelight; both vars
//                                        also feed the shader uniforms
//   type       the two families below    swap them, keep the variable names
//   darkroom   gfx/hero-shader.ts        the effects, as commented WGSL
//
// Two downloaded families, not four. The `fontPair` control offers four
// voices, but the other two resolve to system stacks in template.css.

const display = Fraunces({
  subsets: ["latin"],
  variable: "--obscura-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--obscura-mono",
  display: "swap",
});

export default function ObscuraTemplate() {
  return (
    // data-obscura-root is what template.css paints; the font variables have
    // to live on the same element as the font-family that reads them.
    <div
      data-obscura-root
      className={`${display.variable} ${mono.variable} relative w-full overflow-x-hidden`}
    >
      <ObscuraApp />
    </div>
  );
}
