"use client";

import type { PreviewProps } from "@/lib/registry/types";
import GradualBlur from "./GradualBlur";

export default function GradualBlurPreview({ values }: PreviewProps) {
  const position = values.position as "top" | "bottom" | "left" | "right";

  return (
    // A transformed ancestor becomes the containing block for position:fixed, so
    // a `target="page"` selection stays inside this stage instead of overlaying
    // the docs shell. The effect is static, so reducedMotion needs no handling.
    <div
      className="relative h-full w-full overflow-hidden rounded-md"
      style={{ transform: "translateZ(0)" }}
    >
      {/* Sample content for the blur to act on. */}
      <div className="absolute inset-0 flex flex-col justify-between gap-4 p-6">
        <div className="h-20 rounded-md bg-gradient-to-r from-accent/70 via-accent-muted/40 to-accent/60" />
        <p className="text-center font-display text-xs uppercase tracking-[0.28em] text-ink-dim">
          Progressive edge blur · {position}
        </p>
        <div className="h-20 rounded-md bg-gradient-to-r from-accent-muted/50 via-accent/70 to-accent/50" />
      </div>

      <GradualBlur
        position={position}
        strength={values.strength as number}
        divCount={values.divCount as number}
        exponential={values.exponential as boolean}
        opacity={values.opacity as number}
        target={values.target as "parent" | "page"}
        tinted={values.tinted as boolean}
        height="6rem"
        curve="bezier"
      />
    </div>
  );
}
