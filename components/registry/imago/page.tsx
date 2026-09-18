import { Inter, Rajdhani } from "next/font/google";

import "./template.css";
import ImagoApp from "./imago-app";

// IMAGO — a metamorphic studio landing page built around a 3D model.
//
// Drop this directory anywhere in a Next.js App Router project and render
// <ImagoTemplate /> from a route. It brings its own scroll, type, theme handling
// and WebGL scene; the only thing it asks of the host is Tailwind and the `cn`
// helper from @/lib/utils.
//
// ── Making it yours ─────────────────────────────────────────────────────────
//   copy       lib/constants.ts        menu items and the model's tuning values
//   colour     template.css            --accent and --background drive everything
//   type       the two families below  swap them, keep the variable names
//   model      model/imago-model.tsx   MODEL_URL — point it at your own .glb
//   media      ../_shared/cdn.ts       set NEXT_PUBLIC_TEMPLATE_CDN to your account
//
// The scene's tuning constants used to live in a persisted zustand store driving a
// control panel. The panel is gone, so they are plain constants again — edit them
// in lib/constants.ts and the model reads them directly, with nothing written to
// your visitors' localStorage.

const display = Rajdhani({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--imago-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--imago-body",
  display: "swap",
});

export default function ImagoTemplate() {
  return (
    // data-imago-root is what template.css paints; the font variables have to live
    // on the same element as the font-family that reads them.
    <div
      data-imago-root
      className={`${display.variable} ${body.variable} relative mx-auto w-full max-w-360 overflow-x-hidden`}
    >
      <ImagoApp />
    </div>
  );
}
