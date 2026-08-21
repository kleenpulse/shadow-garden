"use client";

import type { PreviewProps } from "@/lib/registry/types";
import InfiniteCanvas, { type InfiniteCanvasNode } from "./infinite-canvas";

// Module-level so the node list keeps identity across renders — the component
// reseeds card positions when the array changes, and tuning a control every
// keystroke must not do that.
const DEMO_NODES: InfiniteCanvasNode[] = [
  {
    id: "brief",
    x: 48,
    y: 48,
    width: 220,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          brief
        </span>
        <p className="mt-1">
          Drag the background to pan. Throw it — the glide has momentum.
        </p>
      </>
    ),
  },
  {
    id: "zoom",
    x: 360,
    y: 120,
    width: 190,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          zoom
        </span>
        <p className="mt-1">Wheel zooms to the cursor, pinch works on touch.</p>
      </>
    ),
  },
  {
    id: "cards",
    x: 140,
    y: 300,
    width: 200,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          cards
        </span>
        <p className="mt-1">Each card drags on its own and snaps to the grid.</p>
      </>
    ),
  },
  {
    id: "minimap",
    x: 620,
    y: 40,
    width: 180,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          minimap
        </span>
        <p className="mt-1">The corner map mirrors the extent — click it to jump.</p>
      </>
    ),
  },
  {
    id: "dom",
    x: 560,
    y: 320,
    width: 210,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          real dom
        </span>
        <p className="mt-1">
          One world element under a single transform. Nothing remounts when the
          camera moves.
        </p>
      </>
    ),
  },
  {
    id: "keys",
    x: -220,
    y: 180,
    width: 180,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          keys
        </span>
        <p className="mt-1">Focus the board: arrows pan, + and − zoom.</p>
      </>
    ),
  },
  {
    id: "far",
    x: 300,
    y: 560,
    width: 170,
    content: (
      <>
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          far field
        </span>
        <p className="mt-1">Out here to give the minimap something to show.</p>
      </>
    ),
  },
];

export default function InfiniteCanvasPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <InfiniteCanvas
        nodes={DEMO_NODES}
        friction={values.friction as number}
        zoomSpeed={values.zoomSpeed as number}
        minZoom={values.minZoom as number}
        maxZoom={values.maxZoom as number}
        gridSnap={values.gridSnap as boolean}
        gridSize={values.gridSize as number}
        minimap={values.minimap as boolean}
        backdrop={values.backdrop as "dots" | "lines" | "none"}
        paused={paused}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
