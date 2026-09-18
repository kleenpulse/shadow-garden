import { Inter, Instrument_Serif } from "next/font/google";

import "./template.css";
import JinlongApp from "./jinlong-app";

// JINLONG — a collection launch page in gold and vermillion.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <JinlongTemplate /> from a route. It brings its own scroll, splash sequence,
// cursor, soundtrack and type; the only thing it asks of the host is Tailwind and
// the `cn` helper from @/lib/utils.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts     nav links, the three claim steps, socials
//   art        lib/characters.ts    the three guardians and the thumbnail strip
//   colour     template.css         --primary-red is the brand; the palette is
//                                   HSL TRIPLETS read as hsl(var(--x)), not colours
//   type       the two families below — swap them, keep the variable names
//   audio      miscellaneous/music-player.tsx — TRACK is the only reference
//   media      ../_shared/cdn.ts    set NEXT_PUBLIC_TEMPLATE_CDN to your account
//
// The music player is worth reading before you change it: the original had six
// separate defects that all presented as "the widget works", and the rewrite is
// commented with each one.

// Latin only, deliberately. The page shows exactly two Chinese glyphs (金 龍) and
// a CJK webfont ships around a hundred subset files to serve them — a download
// budget entirely out of proportion to two characters, and slow enough that it
// times out and fails the build on an unreliable connection. The glyphs fall back
// to the system CJK face instead, which every target platform already has.
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--jinlong-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--jinlong-body",
  display: "swap",
});

export default function JinlongTemplate() {
  return (
    // data-jinlong-root is what template.css paints; the font variables have to
    // live on the same element as the font-family that reads them.
    <div
      data-jinlong-root
      className={`${display.variable} ${body.variable} relative mx-auto w-full max-w-[1900px] overflow-x-hidden bg-black`}
    >
      <JinlongApp />
    </div>
  );
}
