"use client";

import { useState } from "react";
import { installCommand, PKG_MANAGERS, type PkgManager } from "@/lib/registry/install";
import type { ComponentEntry } from "@/lib/registry/types";
import { trackEvent } from "@/lib/stats/track";

export default function InstallBlock({ entry }: { entry: ComponentEntry }) {
  const [pm, setPm] = useState<PkgManager>("bun");
  const [copied, setCopied] = useState(false);

  const command = installCommand(pm, entry);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      trackEvent(entry.slug, "install");
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
      {entry.variants.length > 1 ? (
        <div className="border-t border-hairline px-4 py-3">
          <p className="font-mono text-[11px] text-ink-mute">
            Then copy {entry.variants.length} files into your project:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {entry.variants.map((variant) => (
              <li key={variant.file} className="font-mono text-[11px] text-ink-dim">
                {variant.file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
