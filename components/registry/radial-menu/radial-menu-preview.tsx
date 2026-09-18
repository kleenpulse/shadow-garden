"use client";

import { useState } from "react";
import {
  Copy,
  Link2,
  Pencil,
  Scissors,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import RadialMenu, { type RadialMenuItem } from "./radial-menu";

// Icons and actions live here: the shipped component takes `icon` as a ReactNode
// and `onSelect` as a callback, so the file a customer pastes has no icon
// dependency and no opinion about what the options do.
const ACTIONS = [
  { key: "edit", label: "Edit", icon: <Pencil /> },
  { key: "copy", label: "Copy", icon: <Copy /> },
  { key: "cut", label: "Cut", icon: <Scissors /> },
  { key: "link", label: "Link", icon: <Link2 /> },
  { key: "share", label: "Share", icon: <Share2 /> },
  { key: "star", label: "Star", icon: <Star /> },
  { key: "delete", label: "Delete", icon: <Trash2 /> },
];

export default function RadialMenuPreview({ values, reducedMotion }: PreviewProps) {
  // The last commit is echoed back so a release genuinely resolving to an option
  // is distinguishable from one that landed in the dead zone.
  const [chosen, setChosen] = useState<string | null>(null);

  const items: RadialMenuItem[] = ACTIONS.map((action) => ({
    ...action,
    onSelect: () => setChosen(action.label),
  }));

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <RadialMenu
        items={items}
        radius={values.radius as number}
        startAngle={values.startAngle as number}
        sweep={values.sweep as number}
        itemCount={values.itemCount as number}
        holdDelay={values.holdDelay as number}
        stagger={values.stagger as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        centerCancel={values.centerCancel as number}
        accent={values.accent as string}
        reducedMotion={reducedMotion}
        className="h-72 w-full max-w-lg"
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <p className="font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
            press and hold anywhere
          </p>
          <p className="font-display text-lg tracking-tight text-ink">
            {chosen ?? "—"}
          </p>
          <p className="text-[11px] text-ink-mute">
            drag to an option, release to commit
          </p>
        </div>
      </RadialMenu>
    </div>
  );
}
