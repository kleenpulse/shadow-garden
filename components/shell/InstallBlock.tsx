"use client";

import { useState } from "react";
import { installCommand, PKG_MANAGERS, type PkgManager } from "@/lib/registry/install";
import type { ComponentEntry } from "@/lib/registry/types";

export default function InstallBlock({
  entry,
  locked = false,
}: {
  entry: ComponentEntry;
  locked?: boolean;
}) {
  const [pm, setPm] = useState<PkgManager>("bun");
  const [copied, setCopied] = useState(false);

  if (locked) {
    return (
      <div className="rounded-lg border border-hairline bg-panel px-4 py-6 text-center">
        <p className="font-mono text-xs text-ink-mute">
          Install commands unlock with the Pro tier.
        </p>
      </div>
    );
  }

  const command = installCommand(pm, entry);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable — no-op.
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-panel">
      <div className="flex items-center justify-between border-b border-hairline px-2 py-1.5">
        <div role="tablist" aria-label="Package manager" className="flex gap-0.5">
          {PKG_MANAGERS.map((manager) => {
            const active = manager === pm;
            return (
              <button
                key={manager}
                role="tab"
                aria-selected={active}
                onClick={() => setPm(manager)}
                className={`rounded px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  active ? "bg-raised text-accent" : "text-ink-mute hover:text-ink"
                }`}
              >
                {manager}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="px-2 font-mono text-[11px] text-ink-dim transition-colors hover:text-accent"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3">
        <code className="font-mono text-xs text-ink">{command}</code>
      </pre>
    </div>
  );
}
