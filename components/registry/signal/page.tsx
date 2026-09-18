import { Archivo, Inter } from "next/font/google";

import "./template.css";
import SignalApp from "./signal-app";

// SIGNAL — a product landing page for a monitoring agent.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <SignalTemplate /> from a route. It brings its own scroll, cursor, type and
// theme; the only thing it asks of the host is Tailwind and the `cn` helper from
// @/lib/utils.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts        nav, features, metrics, integration, FAQ
//   colour     template.css            --secondary is the ground, --accent-yellow the CTA
//   type       the two families below  swap them, keep the variable names
//   icons      lucide-react            the social row uses neutral glyphs on purpose
//   media      ../_shared/cdn.ts       set NEXT_PUBLIC_TEMPLATE_CDN to your account
//
// The source loaded licensed Helvetica OTFs from its own public/ folder. Those are
// neither ours to redistribute nor a buyer's to inherit, so the display voice is
// Archivo — a grotesk with the same square, tightly-spaced feel and an open licence.

const display = Archivo({
  subsets: ["latin"],
  variable: "--signal-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--signal-body",
  display: "swap",
});

export default function SignalTemplate() {
  return (
    // data-signal-root is what template.css paints; the font variables have to live
    // on the same element as the font-family that reads them.
    <div
      data-signal-root
      className={`${display.variable} ${body.variable} relative w-full overflow-x-hidden`}
    >
      <SignalApp />
    </div>
  );
}
