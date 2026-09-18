import { Archivo_Black, Space_Grotesk } from "next/font/google";

import "./template.css";
import VellumApp from "./vellum-app";

// VELLUM — a specialist incubation and advisory landing page.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <VellumTemplate /> from a route. It brings its own scroll, its own type, its
// own theme handling and its own marks; the only thing it asks of the host is
// Tailwind and the `cn` helper from @/lib/utils.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts              every string on the page
//   colour     template.css                  --accent and --background drive the rest
//   type       the two families below        swap them, keep the variable names
//   logos      miscellaneous/brand-mark.tsx  generated; replace with real art
//   media      ../_shared/cdn.ts             point NEXT_PUBLIC_TEMPLATE_CDN at your own
//
// Two downloaded families, not four. The `fontPair` control offers four voices,
// but the other two resolve to system serif and system mono stacks in
// template.css — which are respectable faces that cost nothing, and which keep
// the build's font fetches proportional to what the page actually uses. A
// template that pulled a webfont per option would multiply that by every
// template in the section.

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--vellum-display",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--vellum-grotesk",
  display: "swap",
});

export default function VellumTemplate() {
  return (
    // data-vellum-root is what template.css paints; the font variables have to
    // live on the same element as the font-family that reads them.
    <div
      data-vellum-root
      className={`${display.variable} ${grotesk.variable} relative w-full overflow-x-hidden`}
    >
      <VellumApp />
    </div>
  );
}
