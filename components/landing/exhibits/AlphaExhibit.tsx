"use client";

import dynamic from "next/dynamic";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";

const DotField = dynamic(() => import("@/components/registry/dot-field/DotField"), {
  ssr: false,
});

// α — Backgrounds. Live DotField (canvas-2D, cheap): ambient wave while in view,
// cursor bulge on hover. Component defaults supply the palette.
export default function AlphaExhibit() {
  return (
    <ExhibitFrame plate className="h-90 sm:h-105">
      {({ active }) => (
        <div className="absolute inset-0">
          <PreviewBoundary slug="dot-field" label="DotField" variant="stage">
            <DotField sparkle={false} waveAmplitude={active ? 6 : 0} />
          </PreviewBoundary>
        </div>
      )}
    </ExhibitFrame>
  );
}
