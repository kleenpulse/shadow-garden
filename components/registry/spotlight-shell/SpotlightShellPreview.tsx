"use client";

import type { PreviewProps } from "@/lib/registry/types";
import { SpotlightShell } from "./SpotlightShell";

export default function SpotlightShellPreview({ values }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <SpotlightShell accentColor={values.accentColor as string} className="w-72">
        <div className="flex h-48 flex-col justify-end p-5">
          <span className="font-display text-sm uppercase tracking-widest text-ink">
            Shadow Garden
          </span>
          <span className="mt-1 font-sans text-xs text-ink-dim">
            Tilt, glow, and shimmer on hover
          </span>
        </div>
      </SpotlightShell>
    </div>
  );
}
