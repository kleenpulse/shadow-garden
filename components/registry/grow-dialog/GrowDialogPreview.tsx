"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  Cpu,
  Database,
  FileCode,
  GitBranch,
  Terminal,
} from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import GrowDialog from "./GrowDialog";

type Card = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  blurb: string;
  body: string;
};

const CARDS: Card[] = [
  {
    icon: Terminal,
    label: "shell.exec",
    blurb: "Run a command in the sandbox.",
    body: "Spawns an isolated shell, streams stdout and stderr back live, and reports the exit code when the process settles.",
  },
  {
    icon: Cpu,
    label: "proc.trace",
    blurb: "Stream syscalls as they fire.",
    body: "Attaches to the target process and emits every syscall with its arguments and return value, filterable by name.",
  },
  {
    icon: GitBranch,
    label: "git.graph",
    blurb: "Walk the branch topology.",
    body: "Renders the commit DAG for the current repository — branches, merges, and tags — as a navigable graph.",
  },
  {
    icon: Database,
    label: "db.query",
    blurb: "Inspect tables, run raw SQL.",
    body: "Opens a read-only console against the connected database with schema introspection and query history.",
  },
  {
    icon: Activity,
    label: "net.probe",
    blurb: "Ping hosts and trace routes.",
    body: "Sends ICMP probes to a target host, plots latency over time, and traces each hop along the route.",
  },
  {
    icon: FileCode,
    label: "fs.watch",
    blurb: "Tail file changes live.",
    body: "Watches a directory tree and streams create, modify, and delete events with debounced batching.",
  },
];

export default function GrowDialogPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  const stiffness = values.stiffness as number;
  const damping = values.damping as number;
  const radius = values.radius as number;
  const blurBackdrop = values.blurBackdrop as boolean;
  const autoFocus = values.autoFocus as boolean;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const card = CARDS[active];

  return (
    <div className="grid h-full min-h-155 w-full place-items-center p-8">
      <div className="grid w-full max-w-2xl grid-cols-3 gap-4">
        {/* Plain buttons — pure coordinate sources, no layoutId anywhere. */}
        {CARDS.map((c, i) => {
          const CardIcon = c.icon;
          return (
            <button
              key={c.label}
              type="button"
              onClick={(e) => {
                setActive(i);
                setOrigin(e.currentTarget.getBoundingClientRect());
                setOpen(true);
              }}
              className="flex aspect-square flex-col items-start justify-center gap-3 rounded-xl border border-hairline bg-raised p-5 text-left transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <CardIcon className="size-6 text-accent" />
              <h3 className="font-display text-sm text-ink">{c.label}</h3>
              <span className="font-sans text-xs leading-snug text-ink-mute">
                {c.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {/* Always mounted — {open && …} would kill the shrink-back exit. */}
      <GrowDialog
        open={open}
        onOpenChange={setOpen}
        originRect={origin}
        originMaxWidth={384}
        title={card.label}
        description={card.blurb}
        stiffness={stiffness}
        damping={damping}
        radius={radius}
        blurBackdrop={blurBackdrop}
        autoFocus={autoFocus}
        reducedMotion={reducedMotion}
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 px-5 pb-5">
          <p className="font-sans text-xs leading-relaxed text-ink-dim">
            {card.body}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="self-start rounded-md bg-accent px-3 py-1.5 font-display text-xs text-on-accent transition-opacity hover:opacity-90"
          >
            Run
          </button>
        </div>
      </GrowDialog>
    </div>
  );
}
