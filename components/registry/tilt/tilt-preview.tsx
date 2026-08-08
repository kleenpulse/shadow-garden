"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Tilt from "./tilt";

export default function TiltPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Tilt
        maxTilt={values.maxTilt as number}
        perspective={values.perspective as number}
        glare={values.glare as number}
        glareSize={values.glareSize as number}
        hoverScale={values.hoverScale as number}
        smoothing={values.smoothing as number}
        glareColor={values.glareColor as string}
        reducedMotion={reducedMotion}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col gap-5 p-7">
          <span className="w-max rounded-full border border-hairline px-3 py-1 font-display text-[10px] uppercase tracking-[0.2em] text-accent">
            Seventh Shadow
          </span>

          <h3 className="font-display text-2xl leading-tight tracking-tight text-ink">
            Power moves
            <br />
            unseen.
          </h3>

          <p className="text-sm leading-relaxed text-ink-dim">
            Lean into the card and the light follows. Everything here rides the
            compositor — transform and opacity, nothing else.
          </p>

          {/* Button-in-button: the arrow lives in its own circular well, flush
              with the pill's inner padding, rather than floating beside the text. */}
          <button
            type="button"
            className="group mt-1 flex w-max items-center gap-3 rounded-full bg-accent py-1.5 pl-5 pr-1.5 text-on-accent transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          >
            <span className="font-display text-xs uppercase tracking-[0.15em]">
              Enter
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-black/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
              ↗
            </span>
          </button>
        </div>
      </Tilt>
    </div>
  );
}
