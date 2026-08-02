import type { ReactNode } from "react";
import { getEntitlement } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import LiveWorkspace from "./LiveWorkspace";

// Server gate for the Controls panel, the same seam as source / install / props.
//
// It has to sit HERE rather than in the page: the page is the static PPR shell, and an
// entitlement read is a cookie read, which would drag the whole shell dynamic. Below
// this Suspense boundary the subtree is already dynamic (the workspace reads nuqs), so
// the await costs nothing new — and getPro() is request-memoised, so this is the same
// lookup the Code tab already made, not a second one.
export default async function WorkspaceSection({
  entry,
  code,
  promptSlot,
}: {
  entry: ComponentEntry;
  code: ReactNode;
  promptSlot?: ReactNode;
}) {
  let controlsLocked = false;
  if (entry.tier === "pro") {
    const { pro } = await getEntitlement();
    controlsLocked = !pro;
  }
  return (
    <LiveWorkspace
      entry={entry}
      code={code}
      promptSlot={promptSlot}
      controlsLocked={controlsLocked}
    />
  );
}
