"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Rift from "./Rift";

// Two readings of the same scene — the tear decides which one you're looking at.
//
// These panels stand in for the two images a real before/after slider compares,
// so they carry their own fixed palette rather than the bench's semantic tokens.
// Themed surfaces would defeat the point: in light mode the "before" and "after"
// would land a shade apart and the wipe would have nothing to reveal.
function Scene({
  tone,
  eyebrow,
  title,
  body,
}: {
  tone: "dark" | "lit";
  eyebrow: string;
  title: string;
  body: string;
}) {
  const lit = tone === "lit";
  return (
    <div
      className="flex h-full w-full flex-col justify-end gap-2 bg-surface p-6"
      style={
        lit
          ? {
              // Strong enough to read as a different scene in light mode too,
              // where bg-raised and bg-surface sit only a shade apart.
              backgroundImage:
                "radial-gradient(130% 100% at 80% 0%, rgb(168 85 247 / 0.55), rgb(88 28 135 / 0.28) 55%, transparent 85%)",
            }
          : {
              backgroundImage:
                "linear-gradient(180deg, rgb(2 2 6 / 0.72), rgb(2 2 6 / 0.88))",
            }
      }
    >
      <span
        className="font-display text-[10px] uppercase tracking-[0.25em]"
        style={{ color: lit ? "#e9d5ff" : "#a855f7" }}
      >
        {eyebrow}
      </span>
      <h3
        className="font-display text-2xl tracking-tight"
        style={{ color: lit ? "#ffffff" : "#d4d4d8" }}
      >
        {title}
      </h3>
      <p
        className="max-w-[16rem] text-xs leading-relaxed"
        style={{ color: lit ? "rgb(255 255 255 / 0.78)" : "rgb(212 212 216 / 0.6)" }}
      >
        {body}
      </p>
    </div>
  );
}

export default function RiftPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Rift
        position={values.position as number}
        handleWidth={values.handleWidth as number}
        rubberBand={values.rubberBand as number}
        angle={values.angle as number}
        snapBack={values.snapBack as boolean}
        glow={values.glow as number}
        accentColor={values.accentColor as string}
        reducedMotion={reducedMotion}
        className="h-72 w-full max-w-lg rounded-xl border border-hairline"
        before={
          <Scene
            tone="dark"
            eyebrow="Before"
            title="In shadow"
            body="What the world is permitted to see. Unremarkable, and deliberately so."
          />
        }
        after={
          <Scene
            tone="lit"
            eyebrow="After"
            title="In eminence"
            body="What was always there, waiting for someone to move the light."
          />
        }
      />
    </div>
  );
}
