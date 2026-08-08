"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Aperture from "./aperture";

// An iris needs something worth opening onto, and a photograph would be a prop
// the customer has to supply. This is a lens view built entirely from gradients
// and rules: range rings, a reticle, a coordinate readout.
function LensView() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0810]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 58% at 42% 34%, #a855f755, transparent 70%)," +
            "radial-gradient(90% 90% at 70% 78%, #22d3ee22, transparent 65%)",
        }}
      />
      <svg viewBox="-100 -100 200 200" className="absolute inset-0 h-full w-full">
        {[26, 48, 70].map((r) => (
          <circle
            key={r}
            cx="0"
            cy="0"
            r={r}
            fill="none"
            stroke="#a855f7"
            strokeOpacity="0.28"
            strokeWidth="0.5"
          />
        ))}
        <path
          d="M-78 0H-14M14 0H78M0-78V-14M0 14V78"
          stroke="#a855f7"
          strokeOpacity="0.45"
          strokeWidth="0.6"
        />
        <circle cx="0" cy="0" r="3" fill="#a855f7" fillOpacity="0.8" />
        <text
          x="0"
          y="90"
          textAnchor="middle"
          fill="#a855f7"
          fillOpacity="0.6"
          fontSize="7"
          letterSpacing="2"
          fontFamily="monospace"
        >
          35.68N 139.69E
        </text>
      </svg>
    </div>
  );
}

export default function AperturePreview({ values, reducedMotion }: PreviewProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
      <Aperture
        bladeCount={values.bladeCount as number}
        openness={values.openness as number}
        duration={values.duration as number}
        detent={values.detent as number}
        bladeCurvature={values.bladeCurvature as number}
        edgeHighlight={values.edgeHighlight as number}
        housingInset={values.housingInset as number}
        autoOpen={values.autoOpen as boolean}
        bladeColor={values.bladeColor as string}
        edgeColor={values.edgeColor as string}
        reducedMotion={reducedMotion}
        className="w-full max-w-[340px]"
      >
        <LensView />
      </Aperture>

      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        observation post · seven
      </p>
    </div>
  );
}
