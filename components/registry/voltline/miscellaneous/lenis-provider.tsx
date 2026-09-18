"use client";

import { ReactLenis } from "lenis/react";

// Smooth scroll for the page.
//
// The source also mounted `next-nprogress-bar` here — a top-of-page loading bar
// for route transitions. A single landing page has no route transitions to report
// on, so it was a dependency rendering a bar that could never move. Removed rather
// than shipped.

export default function LenisProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReactLenis root>{children}</ReactLenis>;
}
