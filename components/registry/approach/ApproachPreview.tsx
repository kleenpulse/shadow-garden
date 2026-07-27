"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Approach from "./Approach";

const TILES = [
  { id: "01", label: "Recon", body: "Already knows." },
  { id: "02", label: "Ledger", body: "Counts what others spend." },
  { id: "03", label: "Force", body: "Simple orders only." },
  { id: "04", label: "Polish", body: "Not one pixel spared." },
];

export default function ApproachPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
        {TILES.map((tile) => (
          <Approach
            key={tile.id}
            overlayOpacity={values.overlayOpacity as number}
            duration={values.duration as number}
            skew={values.skew as number}
            blur={values.blur as number}
            offsetDistance={values.offsetDistance as number}
            overlayColor={values.overlayColor as string}
            reducedMotion={reducedMotion}
            className="h-32 rounded-2xl border border-hairline bg-panel"
            overlay={
              <>
                <span className="font-display text-[10px] uppercase tracking-[0.25em] text-on-accent/70">
                  {tile.id}
                </span>
                <span className="font-display text-lg tracking-tight text-on-accent">
                  {tile.body}
                </span>
              </>
            }
          >
            <div className="flex h-full flex-col justify-end p-5">
              <span className="font-display text-[10px] uppercase tracking-[0.25em] text-ink-mute">
                {tile.id}
              </span>
              <span className="font-display text-lg tracking-tight text-ink">
                {tile.label}
              </span>
            </div>
          </Approach>
        ))}
      </div>
    </div>
  );
}
