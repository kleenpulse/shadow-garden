"use client";

import { useState } from "react";
import { Home, Sparkles, Moon, Palette, Link2 } from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import CommandPalette, { type CommandGroupDef, type Hotkey } from "./CommandPalette";

const GROUPS: CommandGroupDef[] = [
  {
    id: "navigate",
    heading: "Navigate",
    commands: [
      { id: "catalog", label: "Go to Catalog", icon: Home, keywords: ["catalog", "components", "browse"], hint: "G C" },
      { id: "threads", label: "Open Threads", icon: Sparkles, keywords: ["threads", "background", "webgl"] },
    ],
  },
  {
    id: "actions",
    heading: "Actions",
    commands: [
      { id: "theme", label: "Toggle theme", icon: Moon, keywords: ["dark", "light", "mode"] },
      { id: "accent", label: "Randomize accent", icon: Palette, keywords: ["color", "purple"] },
      { id: "copy", label: "Copy page link", icon: Link2, keywords: ["share", "url", "link"], hint: "⌘ C" },
    ],
  },
];

export default function CommandPalettePreview({ values }: PreviewProps) {
  const [open, setOpen] = useState(false);
  const hotkey = values.hotkey as Hotkey;
  return (
    <div className="relative flex h-full min-h-[320px] w-full items-center justify-center">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-hairline bg-panel px-4 py-2 font-mono text-xs text-ink-dim transition-colors hover:text-accent"
      >
        Open palette · {hotkey === "/" ? "/" : hotkey.toUpperCase()}
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={GROUPS}
        hotkey={hotkey}
        loop={values.loop as boolean}
        glass={values.glass as boolean}
      />
    </div>
  );
}
