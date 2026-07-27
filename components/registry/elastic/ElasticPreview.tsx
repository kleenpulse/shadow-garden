"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Elastic from "./Elastic";

function Face({
  id,
  title,
  note,
  front,
}: {
  id: string;
  title: string;
  note: string;
  front?: boolean;
}) {
  return (
    <div
      className={`flex h-44 w-64 flex-col justify-between rounded-2xl border p-5 ${
        front
          ? "border-accent-muted bg-raised shadow-[0_24px_60px_-24px_rgb(168_85_247_/_0.45)]"
          : "border-hairline bg-panel"
      }`}
    >
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
  <Face key="1" id="I" title="Throw me" note="Flick, don't drag." front />,
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
        reducedMotion={reducedMotion}
        className="h-72 w-full"
      />
    </div>
  );
}
