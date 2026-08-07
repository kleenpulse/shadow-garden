"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Reorder, { type ReorderItemData } from "./Reorder";

// A priority queue is the honest demo: a list where the ORDER is the data, not a
// decoration on top of it. Sorting a playlist or a build pipeline is the reason
// anyone reaches for this.
const QUEUE: ReorderItemData[] = [
  { id: "seal", label: "Seal the perimeter", meta: "Sector 7 · Alpha" },
  { id: "cipher", label: "Rotate the cipher", meta: "Archive · Beta" },
  { id: "ledger", label: "Reconcile the ledger", meta: "Vault · Gamma" },
  { id: "asset", label: "Extract the asset", meta: "Harbour · Delta" },
  { id: "trace", label: "Burn the trace", meta: "Relay · Epsilon" },
];

export default function ReorderPreview({ values, reducedMotion }: PreviewProps) {
  const [items, setItems] = useState(QUEUE);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        drag the grip — or tab to it and press space
      </p>

      {/* A horizontal list needs room the vertical one does not — five rows side
          by side inside a column measure would truncate every label to nothing. */}
      <div className={values.axis === "x" ? "w-full max-w-3xl" : "w-full max-w-md"}>
        <Reorder
          items={items}
          onReorder={setItems}
          axis={values.axis as "y" | "x"}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          handle={values.handle as boolean}
          lift={values.lift as number}
          liftShadow={values.liftShadow as number}
          gap={values.gap as number}
          radius={values.radius as number}
          density={values.density as "comfortable" | "compact"}
          showIndex={values.showIndex as boolean}
          accentColor={values.accentColor as string}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
