"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Crossing, {
  type CrossingEasing,
  type CrossingExit,
} from "./crossing";

// Gradients rather than flat fills: a solid rectangle morphing into a bigger
// solid rectangle is indistinguishable from a box that was simply always there.
// A gradient carries an internal landmark, so the eye can see the tile stretch.
const ITEMS = [
  {
    id: "north",
    title: "North Ridge",
    meta: "12 routes",
    tone: "linear-gradient(140deg, #7c3aed, #2563eb)",
    body: "A long approach and a short climb. Best in the two hours after sunrise, when the rock has warmed but the traverse is still in shade.",
  },
  {
    id: "basin",
    title: "Low Basin",
    meta: "8 routes",
    tone: "linear-gradient(140deg, #db2777, #f97316)",
    body: "Sheltered, forgiving, and busy by mid-morning. The one place here that stays climbable in a headwind.",
  },
  {
    id: "shelf",
    title: "East Shelf",
    meta: "5 routes",
    tone: "linear-gradient(140deg, #059669, #0891b2)",
    body: "Short walls with clean landings. Everything is graded a little generously, which is part of why people keep coming back.",
  },
];

export default function CrossingPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <p className="mb-4 font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          the tile is the same object in both views
        </p>
        <Crossing
          items={ITEMS}
          duration={values.duration as number}
          easing={values.easing as CrossingEasing}
          shareTitle={values.shareTitle as boolean}
          exit={values.exit as CrossingExit}
          radius={values.radius as number}
          viewTransition={values.viewTransition as boolean}
          announce={values.announce as boolean}
          accentColor={values.accentColor as string}
          reducedMotion={reducedMotion}
          // A fixed height on purpose. The view is its own captured group, so a
          // box that changes size between the two states stretches its own
          // snapshot for the length of the crossing — legible, but it competes
          // with the element that is supposed to be doing the travelling.
          className="h-72"
        />
      </div>
    </div>
  );
}
