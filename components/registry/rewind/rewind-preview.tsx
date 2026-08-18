"use client";

import { useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import Rewind, {
  type RewindBranch,
  type RewindNode,
  type RewindOrientation,
  type RewindTicks,
} from "./rewind";

const MODULES = ["ingest", "queue", "worker", "cache", "egress"] as const;

interface Snapshot extends RewindNode {
  state: boolean[];
}

interface Branch extends RewindBranch {
  nodes: Snapshot[];
}

const ORIGIN: Snapshot = {
  id: "s0",
  label: "initial",
  state: [true, false, true, false, false],
};

export default function RewindPreview({ values, reducedMotion }: PreviewProps) {
  const [trunk, setTrunk] = useState<Snapshot[]>([ORIGIN]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [index, setIndex] = useState(0);
  const [seq, setSeq] = useState(1);

  const current = trunk[Math.min(index, trunk.length - 1)];

  const toggle = (i: number) => {
    // The snapshot is a copy. Pushing the live array would put the *same*
    // object at every point in the history — the scrubber would work perfectly
    // and every past state would display the present one.
    const next = [...current.state];
    next[i] = !next[i];

    const snapshot: Snapshot = {
      id: `s${seq}`,
      label: `${next[i] ? "enable" : "disable"} ${MODULES[i]}`,
      state: next,
    };

    if (index < trunk.length - 1) {
      // slice(0, index + 1) keeps the state we are standing on; slice(0, index)
      // would silently drop it and the first edit after a scrub would lose a step.
      setBranches((prev) => [
        { at: index, nodes: trunk.slice(index + 1) },
        ...prev,
      ]);
      setTrunk([...trunk.slice(0, index + 1), snapshot]);
    } else {
      setTrunk([...trunk, snapshot]);
    }
    setIndex(index + 1);
    setSeq(seq + 1);
  };

  const enterBranch = (b: number) => {
    const branch = branches[b];
    if (!branch) return;
    const restored = [...trunk.slice(0, branch.at + 1), ...branch.nodes];
    setBranches((prev) => prev.filter((_, i) => i !== b));
    setTrunk(restored);
    setIndex(restored.length - 1);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-7 px-8">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {MODULES.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle(i)}
            aria-pressed={current.state[i]}
            className={`rounded-md border px-3 py-2 font-display text-[10px] tracking-[0.16em] uppercase transition-colors ${
              current.state[i]
                ? "border-transparent bg-accent/15 text-accent"
                : "border-hairline bg-raised/60 text-ink-mute hover:text-ink-dim"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md">
        <Rewind
          nodes={trunk}
          branches={branches}
          index={index}
          onScrub={setIndex}
          onEnterBranch={enterBranch}
          orientation={values.orientation as RewindOrientation}
          scrubSnap={values.scrubSnap as boolean}
          branching={values.branching as boolean}
          branchDepth={values.branchDepth as number}
          stiffness={values.stiffness as number}
          damping={values.damping as number}
          tickDensity={values.tickDensity as RewindTicks}
          showLabels={values.showLabels as boolean}
          railHeight={values.railHeight as number}
          accentColor={values.accentColor as string}
          branchColor={values.branchColor as string}
          reducedMotion={reducedMotion}
        />
      </div>

      <p className="max-w-sm text-center font-display text-[10px] leading-relaxed tracking-[0.2em] text-ink-mute uppercase">
        toggle a few · drag the head back · toggle again
        <br />
        the future you left stays on the rail
      </p>
    </div>
  );
}
