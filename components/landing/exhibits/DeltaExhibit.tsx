"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CommandGroupDef } from "@/components/registry/command-palette/CommandPalette";

const CommandPalette = dynamic(
  () => import("@/components/registry/command-palette/CommandPalette"),
  { ssr: false },
);

// ssr:false is load-bearing here, not just a bundle nicety: the reel's seed
// builds real Blobs at module scope.
const FileExplorerReelSection = dynamic(
  () => import("@/components/landing/exhibits/file-explorer-reel"),
  { ssr: false },
);

export interface PaletteCommand {
  id: string;
  label: string;
}

export interface PaletteGroup {
  id: string;
  heading: string;
  commands: PaletteCommand[];
}

const noop = () => {};

// One frame for both branches so the breakpoint swap and the pre-resolve paint
// never shift layout. Graphite below sm, where the palette veil needs a dark
// ground (`.exhibit-plate` is exactly this background); the themed panel above
// it, where FileExplorer's semantic tokens do their own theming.
// border-transparent because each child draws its own hairline.
// Desktop height is set by the detail panel, the tallest thing the reel opens:
// preview + name + the five metadata rows + the action footer need ~480px, on
// top of ~110px of toolbar/breadcrumb/storage chrome. Below that the metadata
// scrolls out of view during beat 02, which is the beat selling the panel.
const FRAME = "h-80 border-transparent max-sm:bg-bench-950 sm:h-150";

// δ — Power-User Systems. Two specimens, split by width rather than ranked: a
// three-pane file manager is unreadable at ~296px of frame, and a centered
// command surface is at its best there. So phones get the CommandPalette pinned
// open under glass, and desktop gets the File Explorer running its own reel.
export default function DeltaExhibit({ groups }: { groups: PaletteGroup[] }) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [resolved, setResolved] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- media-query resolve gate
  useEffect(() => setResolved(true), []);

  // A `hidden sm:block` pair would mount BOTH: the reel's timeline would run
  // invisibly on a phone, and desktop would still pay for the cmdk chunk.
  // useMediaQuery starts false, so hold one paint rather than flash the palette.
  if (!resolved) {
    return <ExhibitFrame className={FRAME}>{() => null}</ExhibitFrame>;
  }

  if (isDesktop) {
    return <FileExplorerReelSection frameClassName={FRAME} />;
  }

  const defs: CommandGroupDef[] = groups.map((group) => ({
    id: group.id,
    heading: group.heading,
    commands: group.commands.map((command) => ({ id: command.id, label: command.label })),
  }));

  return (
    <ExhibitFrame className={FRAME}>
      {() => (
        // `inert` keeps its input from stealing focus, an empty hotkey list
        // stands it down from ⌘K, and pointer events are off — look, don't touch.
        <div inert className="pointer-events-none absolute inset-0 select-none">
          <PreviewBoundary
            slug="command-palette"
            label="CommandPalette"
            variant="stage"
            showRetry={false}
          >
            <CommandPalette
              open
              onOpenChange={noop}
              groups={defs}
              hotkey={[]}
              placeholder="Type a command or search…"
            />
          </PreviewBoundary>
        </div>
      )}
    </ExhibitFrame>
  );
}
