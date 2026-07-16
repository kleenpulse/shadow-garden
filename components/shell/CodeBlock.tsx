"use client";

import { useState } from "react";

export default function CodeBlock({
  html,
  raw,
  filename,
}: {
  html: string;
  raw: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-panel">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
        <span className="font-mono text-[11px] text-ink-mute">{filename ?? "source"}</span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] text-ink-dim transition-colors hover:text-accent"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div
        className="shiki-wrap overflow-x-auto"
        // Highlighted server-side by Shiki; raw source never re-parsed on the client.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
