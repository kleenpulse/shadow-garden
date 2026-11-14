import { getSource } from "@/lib/registry/source";
import type { ComponentEntry } from "@/lib/registry/types";
import CodeBlock from "./CodeBlock";
import CodeTabs from "./CodeTabs";
import CodeTree from "./CodeTree";

// Server component: reads the shipped source from disk (comments stripped) and
// renders the highlighted panel. Callers render this inside <Suspense> so the
// disk read and highlighting stream in without holding up the static shell.
export default async function CodePanel({ entry }: { entry: ComponentEntry }) {
  const result = await getSource(entry);

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

  // A template ships its whole directory, so it browses as a tree; a component
  // ships a handful of files, so it stays a strip.
  if (entry.kind === "template") {
    return <CodeTree files={result.files} slug={entry.slug} />;
  }

  return <CodeTabs files={result.files} slug={entry.slug} />;
}
