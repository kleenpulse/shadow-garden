"use client";

import type { PreviewProps } from "@/lib/registry/types";
import { AnimatedHamburger } from "./AnimatedHamburger";

export default function AnimatedHamburgerPreview({ values }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="grid h-16 w-16 place-items-center rounded-md border border-hairline bg-panel text-ink">
        <AnimatedHamburger open={values.open as boolean} />
      </div>
    </div>
  );
}
