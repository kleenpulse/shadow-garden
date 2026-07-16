"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ComponentEntry } from "@/lib/registry/types";
import { useTunedProps } from "@/lib/registry/useTunedProps";
import { previews } from "@/components/registry/previews";
import PlaceholderPreview from "./PlaceholderPreview";
import ControlsPanel from "./ControlsPanel";
import WorkspaceTabs from "./WorkspaceTabs";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Owns the tuned-state source (the URL, via nuqs) shared by the preview stage and
// the controls. The Preview/Code tabs sit on top; the controls run full-width
// underneath so dragging a control updates the preview directly above it.
// `code` is a server-rendered node (the gated source panel) passed straight
// through to the Code tab.
export default function LiveWorkspace({
  entry,
  code,
}: {
  entry: ComponentEntry;
  code: ReactNode;
}) {
  const { values, setValue, reset } = useTunedProps(entry.props);
  const reducedMotion = usePrefersReducedMotion();
  const Preview = previews[entry.slug] ?? PlaceholderPreview;

  return (
    <div className="space-y-4">
      <WorkspaceTabs
        slug={entry.slug}
        preview={
          <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-hairline bg-panel">
            <Preview values={values} reducedMotion={reducedMotion} />
          </div>
        }
        code={code}
      />
      <ControlsPanel props={entry.props} values={values} onChange={setValue} onReset={reset} />
    </div>
  );
}
