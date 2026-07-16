"use client";

import type { PreviewProps } from "@/lib/registry/types";
import { MorphingText } from "./MorphingText";

const WORDS = ["SHADOW", "GARDEN", "ATOMIC", "EMINENCE", "VIOLET"];

export default function MorphingTextPreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <MorphingText
        texts={WORDS}
        auto={reducedMotion ? false : (values.auto as boolean)}
        className="h-24 text-5xl text-accent sm:text-7xl"
      />
    </div>
  );
}
