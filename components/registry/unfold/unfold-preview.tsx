"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Unfold, { type UnfoldPanel } from "./unfold";

// Artwork lives here rather than in Unfold itself: `image` is optional, so the
// component a customer copies works with no assets at all. Run
// `bun scripts/fetch-shade-images.ts` to populate public/shades/.
//
// Every one of these is a 16:9 game plate with the subject somewhere different
// in the frame, so each declares where its face actually is. Without that the
// crop lands on whatever happened to be centre — usually the moon.
//
// The Y values sit above each subject's eyes on purpose: the open slat crops to
// roughly a third of the source height, so aiming at the face clips the head.
const PANELS: UnfoldPanel[] = [
  {
    key: "alpha",
    label: "Alpha",
    meta: "Strategy",
    children: "Reads the board three moves ahead and never says so out loud.",
    image: "/shades/alpha.webp",
    // Sits furthest right of the seven — she leans back behind her own sword,
    // so the crop has to clear the hilt to find her.
    imagePosition: "57% 27%",
  },
  {
    key: "beta",
    label: "Beta",
    meta: "The Author",
    children: "Writes the record everyone else will eventually quote.",
    image: "/shades/beta.webp",
    imagePosition: "46% 24%",
  },
  {
    key: "gamma",
    label: "Gamma",
    meta: "Logistics",
    children: "Owns the ledger. Keep her away from the frontline.",
    image: "/shades/gamma.webp",
    imagePosition: "28% 19%",
  },
  {
    key: "delta",
    label: "Delta",
    meta: "Raw Power",
    children: "Simple orders, overwhelming force. Never hand her ambiguity.",
    image: "/shades/delta.webp",
    // Mid-leap, so her ears sit far above her face — the crop has to start
    // higher than the others to keep the tips inside the frame.
    imagePosition: "65% 30%",
  },
  {
    key: "epsilon",
    label: "Epsilon",
    meta: "Perfection",
    children: "Will not let a single misaligned pixel survive the night.",
    image: "/shades/epsilon.webp",
    imagePosition: "70% 15%",
  },
  {
    key: "zeta",
    label: "Zeta",
    meta: "Espionage",
    children: "Already knows. Has known for some time.",
    image: "/shades/zeta.webp",
    imagePosition: "60% 18%",
  },
  {
    key: "eta",
    label: "Eta",
    meta: "Research",
    children: "Takes the thing apart to find out why it worked.",
    image: "/shades/eta.webp",
    imagePosition: "48% 26%",
  },
];

export default function UnfoldPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Unfold
        items={PANELS}
        panels={values.panels as number}
        expandRatio={values.expandRatio as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        labelReveal={values.labelReveal as boolean}
        useImage={values.useImage as boolean}
        gap={values.gap as number}
        reducedMotion={reducedMotion}
        className="h-72 max-w-2xl"
      />
    </div>
  );
}
