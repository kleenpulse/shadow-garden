"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Rotunda from "./Rotunda";

const PANELS = [
  { tag: "I", title: "Atomic", note: "Seven shades answer to one shadow." },
  { tag: "II", title: "Bench", note: "Graphite, and a single amethyst." },
  { tag: "III", title: "Cathode", note: "A beam that turns at every edge." },
  { tag: "IV", title: "Delta", note: "Simple orders, overwhelming force." },
  { tag: "V", title: "Epsilon", note: "Polish is not decoration." },
  { tag: "VI", title: "Zeta", note: "Everything, seen before it moves." },
  { tag: "VII", title: "Eta", note: "The cause, not the symptom." },
];

export default function RotundaPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative flex h-full min-h-80 w-full items-center justify-center overflow-hidden">
      <Rotunda
        radius={values.radius as number}
        perspective={values.perspective as number}
        autoSpin={values.autoSpin as number}
        friction={values.friction as number}
        snap={values.snap as boolean}
        snapStiffness={values.snapStiffness as number}
        depthDim={values.depthDim as number}
        depthBlur={values.depthBlur as number}
        faceCamera={values.faceCamera as boolean}
        dragSensitivity={values.dragSensitivity as number}
        paused={paused}
        reducedMotion={reducedMotion}
      >
        {PANELS.map((panel) => (
          <article
            key={panel.tag}
            className="h-44 w-64 rounded-xl border border-hairline bg-panel/90 p-4 backdrop-blur-md"
          >
            <p className="font-display text-[10px] tracking-[0.3em] text-accent uppercase">
              {panel.tag}
            </p>
            <h3 className="mt-3 font-display text-lg text-ink">{panel.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink-dim">{panel.note}</p>
          </article>
        ))}
      </Rotunda>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
          drag or arrow keys — spin the ring
        </p>
      )}
    </div>
  );
}
