"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Elastic from "./elastic";

// Every face is styled identically — the deck cycles, so a "this one is the front"
// treatment baked into a single face would ride it to the back of the queue. Depth
// reads off the scale and opacity the component applies per slot.
function Face({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <div className="flex h-44 w-64 flex-col justify-between rounded-2xl border border-accent-muted bg-raised p-5 shadow-[0_24px_60px_-24px_rgb(168_85_247_/_0.45)]">
      <span className="font-display text-[10px] uppercase tracking-[0.25em] text-accent">
        {id}
      </span>
      <div>
        <p className="font-display text-xl tracking-tight text-ink">{title}</p>
        <p className="mt-1 text-xs text-ink-mute">{note}</p>
      </div>
    </div>
  );
}

const FACES = [
  <Face key="1" id="I" title="Throw me" note="Flick, don't drag." />,
  <Face key="2" id="II" title="Second" note="Follows late." />,
  <Face key="3" id="III" title="Third" note="Follows later." />,
  <Face key="4" id="IV" title="Fourth" note="Barely moves." />,
  <Face key="5" id="V" title="Fifth" note="Anchored." />,
];

export default function ElasticPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Elastic
        items={FACES}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        mass={values.mass as number}
        bounds={values.bounds as number}
        rubberBand={values.rubberBand as number}
        flickPower={values.flickPower as number}
        cards={values.cards as number}
        throwThreshold={values.throwThreshold as number}
        reducedMotion={reducedMotion}
        className="h-72 w-full"
      />
    </div>
  );
}
