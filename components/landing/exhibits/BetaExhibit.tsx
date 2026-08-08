"use client";

import ExhibitFrame from "@/components/landing/ExhibitFrame";
import { MorphingText } from "@/components/registry/morphing-text/morphing-text";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

// β — Text Animations. MorphingText cycles the category's own component names.
// `auto` follows visibility: offscreen or reduced motion → the morph settles.
export default function BetaExhibit({ words }: { words: string[] }) {
  return (
    <ExhibitFrame className="flex h-44 items-center justify-center sm:h-64">
      {({ active }) => (
        <div className="flex h-full w-full items-center justify-center px-6">
          <PreviewBoundary slug="morphing-text" label="MorphingText" variant="stage">
            <MorphingText
              texts={words}
              auto={active}
              className="h-16 font-display text-3xl font-bold uppercase tracking-[0.04em] text-ink sm:h-24 sm:text-6xl lg:text-[4.5rem]"
            />
          </PreviewBoundary>
        </div>
      )}
    </ExhibitFrame>
  );
}
