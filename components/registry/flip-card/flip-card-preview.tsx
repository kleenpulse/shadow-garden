"use client";

import type { PreviewProps } from "@/lib/registry/types";
import FlipCard, { type FlipCardItem } from "./flip-card";

type Demo = {
  id: string;
  index: string;
  title: string;
  gradient: string;
  description: string;
  meta: [string, string][];
};

const DEMOS: Demo[] = [
  {
    id: "signal",
    index: "01",
    title: "SIGNAL",
    gradient: "bg-gradient-to-br from-accent/45 via-accent/10 to-panel",
    description:
      "Long-range relay tuned to the garden's quiet band. Carries orders no one ever hears twice.",
    meta: [
      ["BAND", "88.1 MHZ"],
      ["RANGE", "140 KM"],
      ["STATUS", "ACTIVE"],
    ],
  },
  {
    id: "relay",
    index: "02",
    title: "RELAY",
    gradient: "bg-gradient-to-tr from-accent/35 via-panel to-accent/15",
    description:
      "Midpoint node between watchers. Repeats everything, remembers nothing — by design.",
    meta: [
      ["HOPS", "3"],
      ["LATENCY", "12 MS"],
      ["STATUS", "IDLE"],
    ],
  },
  {
    id: "cipher",
    index: "03",
    title: "CIPHER",
    gradient: "bg-gradient-to-bl from-accent/40 via-accent/5 to-panel",
    description:
      "Rotating key schedule for field reports. Breaks cleanly at dawn, reseeds at dusk.",
    meta: [
      ["ROUNDS", "16"],
      ["KEY", "256 BIT"],
      ["STATUS", "SEALED"],
    ],
  },
  {
    id: "echo",
    index: "04",
    title: "ECHO",
    gradient: "bg-gradient-to-tl from-accent/30 via-panel to-accent/20",
    description:
      "Passive listener stitched into the perimeter. Confirms nothing, denies nothing.",
    meta: [
      ["NODES", "7"],
      ["DELAY", "4 MS"],
      ["STATUS", "ACTIVE"],
    ],
  },
  {
    id: "vector",
    index: "05",
    title: "VECTOR",
    gradient: "bg-gradient-to-r from-accent/45 via-accent/10 to-panel",
    description:
      "Extraction route computed on demand. Recalculates the instant a watcher blinks.",
    meta: [
      ["PATHS", "12"],
      ["ETA", "90 S"],
      ["STATUS", "STANDBY"],
    ],
  },
  {
    id: "null",
    index: "06",
    title: "NULL",
    gradient: "bg-gradient-to-b from-accent/35 via-accent/5 to-panel",
    description:
      "Dead-drop signature for orders that never happened. Verifies once, then forgets.",
    meta: [
      ["DROPS", "1"],
      ["TTL", "60 S"],
      ["STATUS", "SEALED"],
    ],
  },
];

const ITEMS: FlipCardItem[] = DEMOS.map((demo) => ({
  id: demo.id,
  front: (
    <div
      className={`flex h-full w-full flex-col justify-between border border-hairline p-3 ${demo.gradient}`}
    >
      <span className="font-display text-[10px] tracking-widest text-ink-dim">
        {demo.index}
      </span>
      <span className="font-display text-xs tracking-widest text-ink">
        {demo.title}
      </span>
    </div>
  ),
  back: (
    <div className="flex h-full w-full flex-col border border-hairline bg-panel p-5">
      <span className="font-display text-[10px] tracking-widest text-ink-mute">
        {demo.index} / DOSSIER
      </span>
      <h3 className="mt-2 font-display text-sm tracking-widest text-ink">
        {demo.title}
      </h3>
      <p className="mt-3 font-sans text-xs leading-relaxed text-ink-dim">
        {demo.description}
      </p>
      <div className="mt-auto flex flex-col gap-1.5 border-t border-hairline pt-3">
        {demo.meta.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between font-display text-[10px] tracking-widest"
          >
            <span className="text-ink-mute">{key}</span>
            <span className="text-accent">{value}</span>
          </div>
        ))}
      </div>
      <span className="mt-3 font-display text-[10px] tracking-widest text-ink-mute">
        ESC TO CLOSE
      </span>
    </div>
  ),
}));

export default function FlipCardPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-155 w-full items-center justify-center p-8">
      <FlipCard
        items={ITEMS}
        className="grid w-full max-w-2xl grid-cols-3 gap-4"
        flipDuration={values.flipDuration as number}
        perspective={values.perspective as number}
        expandedWidth={values.expandedWidth as number}
        expandedHeight={values.expandedHeight as number}
        backdropBlur={values.backdropBlur as number}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
