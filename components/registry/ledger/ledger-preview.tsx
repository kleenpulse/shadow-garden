"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Ledger, { type LedgerEntry } from "./ledger";

// One agent's shift, in the order it happened. Deliberately clustered by source
// rather than interleaved evenly — grouping is the component's identity, and a
// demo stream that never puts two `fs` events together would never show it.
//
// A module constant, not state: the component restarts its stream whenever the
// `entries` array changes identity, so an inline literal here would reset the
// log on every render of the preview.
const ENTRIES: LedgerEntry[] = [
  { id: "1", source: "auth", severity: "ok", text: "scope granted · repo only · until revoked" },
  { id: "2", source: "fs", severity: "info", text: "read lib/shadow/authority.ts" },
  { id: "3", source: "fs", severity: "info", text: "read components/shadow/Atomic.tsx" },
  { id: "4", source: "fs", severity: "info", text: "read scripts/seal.ts" },
  { id: "5", source: "plan", severity: "info", text: "3 files in scope, 2 edits proposed" },
  { id: "6", source: "fs", severity: "warn", text: "write lib/shadow/authority.ts · widens grant()" },
  { id: "7", source: "net", severity: "deny", text: "egress to unknown.host blocked · not in scope" },
  { id: "8", source: "net", severity: "deny", text: "retry blocked · same destination" },
  { id: "9", source: "shell", severity: "warn", text: "bun run check:registry" },
  { id: "10", source: "shell", severity: "ok", text: "71 entries · 0 violations" },
  { id: "11", source: "plan", severity: "ok", text: "patch ready · awaiting review" },
];

export default function LedgerPreview({ values, reducedMotion, paused }: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex h-full max-h-[26rem] w-full max-w-2xl flex-col gap-3">
        <p className="shrink-0 font-display text-[10px] tracking-[0.28em] text-ink-mute uppercase">
          shadow garden · activity ledger
        </p>
        <div className="min-h-0 flex-1">
          <Ledger
            entries={ENTRIES}
            speed={values.speed as number}
            charsPerSecond={values.charsPerSecond as number}
            entryGap={values.entryGap as number}
            jitter={values.jitter as number}
            maxEntries={values.maxEntries as number}
            group={values.group as boolean}
            showTimestamps={values.showTimestamps as boolean}
            caret={values.caret as boolean}
            loop={values.loop as boolean}
            density={values.density as "comfortable" | "compact"}
            accentColor={values.accentColor as string}
            warnColor={values.warnColor as string}
            denyColor={values.denyColor as string}
            paused={paused}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>
    </div>
  );
}
