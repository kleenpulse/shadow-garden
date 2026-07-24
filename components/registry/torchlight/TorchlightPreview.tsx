"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Torchlight from "./Torchlight";

export default function TorchlightPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Torchlight
        radius={values.radius as number}
        softness={values.softness as number}
        darkness={values.darkness as number}
        restReveal={values.restReveal as number}
        smoothing={values.smoothing as number}
        flicker={values.flicker as number}
        torchColor={values.torchColor as string}
        reducedMotion={reducedMotion}
        className="h-80 w-full max-w-md rounded-xl border border-hairline bg-surface"
      >
        <div className="flex h-80 w-full flex-col gap-4 p-6">
          <p className="font-display text-[0.65rem] uppercase tracking-[0.25em] text-accent">
            Classified // Section VII
          </p>
          <h3 className="font-display text-xl text-ink">
            The Shadow&apos;s Ledger
          </h3>
          <p className="text-sm leading-relaxed text-ink-dim">
            Somewhere in these lines a name has been hidden. Sweep the torch
            across the parchment and only what the light touches will surrender
            its secrets to you.
          </p>

          <div className="mt-auto grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <p className="font-display text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Cipher
              </p>
              <p className="mt-1 font-display text-sm text-ink">7A · 3F · 91</p>
            </div>
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <p className="font-display text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Bearer
              </p>
              <p className="mt-1 font-display text-sm text-ink">Shadow</p>
            </div>
          </div>
        </div>
      </Torchlight>
    </div>
  );
}
