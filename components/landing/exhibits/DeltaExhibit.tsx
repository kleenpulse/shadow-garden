"use client";

import dynamic from "next/dynamic";
import ExhibitFrame from "@/components/landing/ExhibitFrame";
import PreviewBoundary from "@/components/shell/PreviewBoundary";
import type { CommandGroupDef } from "@/components/registry/command-palette/CommandPalette";

const CommandPalette = dynamic(
  () => import("@/components/registry/command-palette/CommandPalette"),
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

// δ — Power-User Systems. The CommandPalette pinned open as a specimen under
// glass: `inert` keeps its input from stealing focus, an empty hotkey list
// stands it down from ⌘K, and pointer events are off — look, don't touch.
export default function DeltaExhibit({ groups }: { groups: PaletteGroup[] }) {
  const defs: CommandGroupDef[] = groups.map((group) => ({
    id: group.id,
    heading: group.heading,
    commands: group.commands.map((command) => ({ id: command.id, label: command.label })),
  }));

  return (
    <ExhibitFrame plate className="h-[420px]">
      {() => (
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
