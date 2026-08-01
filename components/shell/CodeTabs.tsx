"use client";

import { useState } from "react";
import type { SourceFile } from "@/lib/registry/source";
import CodeBlock from "./CodeBlock";

// Multi-file source view. An entry that uses the animation runtime host ships two
// files — the component and the peer hook — and the customer needs both (§C1b).
// Highlighting already happened server-side; this only switches which pre-rendered
// block is mounted, so no source is re-parsed on the client.
export default function CodeTabs({
  files,
  slug,
}: {
  files: SourceFile[];
  slug: string;
}) {
  const [active, setActive] = useState(0);
  const current = files[active] ?? files[0]!;

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Source files" className="flex flex-wrap gap-0.5">
        {files.map((file, index) => {
          const selected = index === active;
          return (
            <button
              key={file.file}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(index)}
              className={`rounded px-2.5 py-1 font-mono text-[11px] transition-colors ${
                selected ? "bg-raised text-accent" : "text-ink-mute hover:text-ink"
              }`}
            >
              {file.label}
              {file.role === "hook" ? (
                <span className="ml-1.5 text-ink-mute">peer</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Keyed on the file: without it React reuses the instance and an expanded
          80-line hook hands its "expanded" state to a 1600-line component. */}
      <CodeBlock
        key={current.file}
        html={current.html}
        raw={current.raw}
        filename={current.file}
        slug={slug}
        lineCount={current.lineCount}
      />
    </div>
  );
}
