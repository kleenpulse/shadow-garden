"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Anima from "./anima";

export default function AnimaPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full w-full">
      <Anima
        src="/anima/plate.webp"
        mapSrc="/anima/map.webp"
        sway={values.sway as number}
        speed={values.speed as number}
        motes={values.motes as number}
        moteSize={values.moteSize as number}
        glint={values.glint as number}
        glow={values.glow as number}
        breath={values.breath as number}
        parallax={values.parallax as number}
        focus={values.focus as number}
        moteColor={values.moteColor as string}
        lightColor={values.lightColor as string}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
