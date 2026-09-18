"use client";

import type { PreviewProps } from "@/lib/registry/types";
import IntroAnimation from "./intro-animation";

/** A quiet stand-in for the page the intro is covering. Without something
 *  underneath it, the reveal opens onto the panel's own background and the
 *  whole point of the split is invisible. */
function StagePage() {
  return (
    <div className="absolute inset-0 flex flex-col justify-between overflow-hidden bg-surface p-6">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative flex items-center justify-between">
        <span className="font-display text-[10px] tracking-[0.3em] text-ink uppercase">
          Shadow Garden
        </span>
        <span className="font-display text-[10px] tracking-[0.3em] text-ink-mute uppercase">
          Work · Studio · Contact
        </span>
      </div>

      <div className="relative max-w-[34ch]">
        <p className="font-display text-[10px] tracking-[0.3em] text-accent uppercase">
          Est. in the shadows
        </p>
        <h2 className="mt-3 text-3xl leading-[1.05] font-semibold text-balance text-ink sm:text-4xl">
          The ones who move unseen.
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          An interface should arrive the way a good entrance does — decided
          before anyone noticed it starting.
        </p>
        <div className="mt-5 flex gap-2">
          <span className="rounded-full bg-accent px-4 py-1.5 font-display text-[10px] tracking-[0.2em] text-on-accent uppercase">
            Enter
          </span>
          <span className="rounded-full border border-hairline px-4 py-1.5 font-display text-[10px] tracking-[0.2em] text-ink-dim uppercase">
            Read on
          </span>
        </div>
      </div>

      <div className="relative flex justify-between font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
        <span>01 — Arrival</span>
        <span>Scroll</span>
      </div>
    </div>
  );
}

export default function IntroAnimationPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <StagePage />
      <div className="absolute inset-0">
        <IntroAnimation
          text="SHADOWGARDEN"
          sweepDuration={values.sweepDuration as number}
          grainDensity={values.grainDensity as number}
          windSpeed={values.windSpeed as number}
          buoyancy={values.buoyancy as number}
          turbulence={values.turbulence as number}
          grainSize={values.grainSize as number}
          splitIndex={values.splitIndex as number}
          reveal={values.reveal as "split" | "fade" | "none"}
          autoplay={values.autoplay as boolean}
          replayDelay={values.replayDelay as number}
          inkColor={values.inkColor as string}
          accentColor={values.accentColor as string}
          backgroundColor={values.backgroundColor as string}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
