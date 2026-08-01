import { getSource } from "@/lib/registry/source";
import type { ComponentEntry } from "@/lib/registry/types";
import CodeBlock from "./CodeBlock";
import CodeTabs from "./CodeTabs";
import SubscribeButton from "./SubscribeButton";

// Server component. The gated read happens here — for a locked Pro component the
// raw source never crosses to the client. For Pro entries this reads cookies and
// is therefore dynamic, so callers must render it inside <Suspense>.
export default async function CodePanel({ entry }: { entry: ComponentEntry }) {
  const result = await getSource(entry);

  if (result.status === "locked") {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-hairline bg-panel text-center">
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
          Pro
        </span>
        <p className="max-w-xs font-sans text-sm text-ink-dim">
          The source for {entry.name} is available on the Pro tier. The preview stays free —
          subscribe to view and copy the code.
        </p>
        <SubscribeButton label="View the source →" className="mt-2" />
      </div>
    );
  }

  if (result.status === "pending") {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-hairline bg-panel text-center">
        <p className="max-w-sm px-6 font-mono text-xs text-ink-mute">
          Source pending — drop {entry.variants[0]?.file ?? "the component file"} into the repo to
          render it here.
        </p>
      </div>
    );
  }

  // One file stays a bare block; a peer hook adds a tab strip. Both are already
  // highlighted server-side, so this stays inside the existing <Suspense> and
  // nothing new becomes dynamic.
  if (result.files.length === 1) {
    const only = result.files[0]!;
    return (
      <CodeBlock
        html={only.html}
        raw={only.raw}
        filename={only.file}
        slug={entry.slug}
        lineCount={only.lineCount}
      />
    );
  }

  return <CodeTabs files={result.files} slug={entry.slug} />;
}
