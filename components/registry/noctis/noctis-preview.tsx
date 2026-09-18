"use client";

import TemplateFrame from "@/components/shell/template-frame";
import type { PreviewProps } from "@/lib/registry/types";

// Bench preview for the Noctis template. Thin by design: a template renders in an
// iframe of its own route (SPEC §C13), so there is nothing to mount here beyond
// the frame and the slug.
//
// Each token is read off `values` by name rather than spread. That is not style —
// `preview-reads-every-prop` extracts `values.<name>` member reads statically, and
// an `Object.entries(values)` would pass the props through correctly while making
// the rule blind to all five (§V54).
export default function NoctisPreview({
  values,
  paused,
  reducedMotion,
}: PreviewProps) {
  const accent = values.accent;
  const background = values.background;
  const fontPair = values.fontPair;
  const radius = values.radius;
  const motion = values.motion;

  return (
    <TemplateFrame
      slug="noctis"
      values={{ accent, background, fontPair, radius, motion }}
      paused={paused}
      reducedMotion={reducedMotion}
    />
  );
}
