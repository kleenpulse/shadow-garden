import { Outfit, Roboto } from "next/font/google";

import "./template.css";
import VoltlineApp from "./voltline-app";

// VOLTLINE — a network/infrastructure landing page.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <VoltlineTemplate /> from a route. It brings its own scroll, type, splash
// screen, waitlist form and modal; the only thing it asks of the host is Tailwind
// and the `cn` helper from @/lib/utils.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts    nav links, FAQs, feature and target lists
//   colour     template.css        --primary and --surface-white drive everything
//   type       the two families below — swap them, keep the variable names
//   waitlist   lib/waitlist.ts     the one seam; point it at your own endpoint
//   media      ../_shared/cdn.ts   set NEXT_PUBLIC_TEMPLATE_CDN to your account
//
// The source posted its waitlist to a Google Sheet through `googleapis`, running
// server-side with the owner's service-account credentials. None of that is a
// template's to ship, so lib/waitlist.ts validates locally and returns success
// with a commented-out fetch where your endpoint goes.

const display = Outfit({
  subsets: ["latin"],
  variable: "--voltline-display",
  display: "swap",
});

const body = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--voltline-body",
  display: "swap",
});

export default function VoltlineTemplate() {
  return (
    // data-voltline-root is what template.css paints; the font variables have to
    // live on the same element as the font-family that reads them.
    <div
      data-voltline-root
      className={`${display.variable} ${body.variable} relative w-full overflow-x-hidden`}
    >
      <VoltlineApp />
    </div>
  );
}
