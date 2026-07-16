"use client";

import type { PreviewProps } from "@/lib/registry/types";
import { MarqueeText } from "./MarqueeText";

// Reduced motion is honored by the global CSS backstop (the marquee runs on a CSS
// keyframe animation, which that media query freezes).
export default function MarqueeTextPreview({ values }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-md border border-hairline bg-raised px-3 py-2 font-mono text-sm text-ink">
        <MarqueeText
          text="Shadow Garden — the eminence operates from the shadows · atomic · violet · "
          speed={values.speed as number}
          gap={values.gap as number}
          pause={values.pause as number}
        />
      </div>
    </div>
  );
}
