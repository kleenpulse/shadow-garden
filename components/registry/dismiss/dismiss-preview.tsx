"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Dismiss, { type DismissItem } from "./dismiss";

// A notification queue is the honest demo — it is what people actually build this
// for, and it is the only content shape where "throw it away" means something.
const QUEUE: Omit<DismissItem, "id">[] = [
  { title: "Perimeter breached", meta: "Sector 7 · 04:12" },
  { title: "Asset went dark", meta: "Delta · 03:58" },
  { title: "Cipher rotated", meta: "Archive · 03:31" },
  { title: "Shipment intercepted", meta: "Harbour · 02:47" },
  { title: "Contact re-established", meta: "Zeta · 02:05" },
];

const seed = (round: number): DismissItem[] =>
  QUEUE.map((item, i) => ({ ...item, id: `${round}-${i}` }));

export default function DismissPreview({ values, reducedMotion }: PreviewProps) {
  const [round, setRound] = useState(0);
  const [items, setItems] = useState(() => seed(0));

  // The queue refills rather than leaving an empty stage. Restoring lives here
  // and not in the component: `Dismiss` is controlled, and what happens when the
  // last card leaves is the caller's decision, not the gesture's.
  const dismiss = (id: string) =>
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      if (next.length > 0) return next;
      const nextRound = round + 1;
      setRound(nextRound);
      return seed(nextRound);
    });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
      <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
        throw it away
      </p>

      <div className="w-full max-w-sm">
        <Dismiss
          items={items}
          onDismiss={dismiss}
          axis={values.axis as "x" | "y" | "both"}
          threshold={values.threshold as number}
          velocityThreshold={values.velocityThreshold as number}
          rubberBand={values.rubberBand as number}
          stackDepth={values.stackDepth as number}
          stackOffset={values.stackOffset as number}
          stackScale={values.stackScale as number}
          rotateOnDrag={values.rotateOnDrag as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          reducedMotion={reducedMotion}
        />
      </div>

      <p className="font-display text-[10px] tracking-[0.2em] text-ink-mute uppercase">
        {items.length} queued
      </p>
    </div>
  );
}
