"use client";

import { useState } from "react";
import { Home, Sparkles, Moon, Palette, Link2 } from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import { useIsMac } from "@/hooks/use-is-mac";
import CommandPalette, { type CommandGroupDef, type Hotkey } from "./command-palette";

const GROUPS: CommandGroupDef[] = [
  {
    id: "navigate",
    heading: "Navigate",
    commands: [
      { id: "catalog", label: "Go to Catalog", icon: Home, keywords: ["catalog", "components", "browse"], hint: "G C" },
      { id: "waves", label: "Open Waves", icon: Sparkles, keywords: ["waves", "background", "webgl"] },
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
  const isMac = useIsMac();
  // cmd+k falls back to Ctrl+K on non-Apple platforms — label what actually fires.
  const hotkeyLabel =
    hotkey === "/"
      ? "/"
      : hotkey === "cmd+k" && !isMac
        ? "CTRL+K"
        : hotkey.toUpperCase();
  return (
    <div className="relative flex h-full min-h-[320px] w-full items-center justify-center">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-hairline bg-panel px-4 py-2 font-mono text-xs text-ink-dim transition-colors hover:text-accent"
      >
        Open palette · {hotkeyLabel}
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={GROUPS}
        hotkey={hotkey}
        loop={values.loop as boolean}
        glass={values.glass as boolean}
        // Render on the root page (viewport-fixed) so the modal isn't clipped by
        // the preview box's overflow-hidden frame.
        fixed
      />
    </div>
  );
}
