"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import { AnimatedNumberAdvanced, type AnimationType } from "./AnimatedNumber";

export default function AnimatedNumberPreview({ values, reducedMotion }: PreviewProps) {
  // Bumping this remounts AnimatedNumber, replaying its entrance animation.
  const [replayToken, setReplayToken] = useState(0);

  return (
    <div className="relative flex h-full w-full items-center justify-center p-6 font-display text-6xl text-ink sm:text-8xl">
      <AnimatedNumberAdvanced
        key={replayToken}
        value={Math.round(values.value as number)}
        animationType={values.animationType as AnimationType}
        duration={reducedMotion ? 0 : (values.duration as number)}
        staggerDelay={reducedMotion ? 0 : (values.staggerDelay as number)}
      />
      <button
        type="button"
        aria-label="Replay animation"
        onClick={() => setReplayToken((t) => t + 1)}
        className="absolute bottom-4 right-4 rounded-md border border-hairline bg-panel p-2 text-ink-dim transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <RotateCcw className="size-4" />
      </button>
    </div>
  );
}
