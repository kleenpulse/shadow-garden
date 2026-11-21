import { cachedSource } from "@/lib/registry/cached";
import type { ComponentEntry } from "@/lib/registry/types";
import CodeBlock from "./CodeBlock";
import CodeTabs from "./CodeTabs";
import CodeTree from "./CodeTree";

// Server component: reads the shipped source from disk (comments stripped) and
// renders the highlighted panel. The read goes through cachedSource so it runs
// once at build time. A plain getSource here would leave a hole that a function
// fills on every page view (see lib/registry/cached.ts).
export default async function CodePanel({ entry }: { entry: ComponentEntry }) {
  const result = await cachedSource(entry.slug);

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
  // highlighted server-side.
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
