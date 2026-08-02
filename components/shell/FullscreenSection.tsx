import { getEntitlement } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import FullscreenStage from "./FullscreenStage";

// Fullscreen twin of WorkspaceSection. Without it the /full route is a bypass: same
// controls, same nuqs state, no gate. The await sits below the page's Suspense
// boundary for the same PPR reason the workspace one does.
export default async function FullscreenSection({ entry }: { entry: ComponentEntry }) {
  let controlsLocked = false;
  if (entry.tier === "pro") {
    const { pro } = await getEntitlement();
    controlsLocked = !pro;
  }
  return <FullscreenStage entry={entry} controlsLocked={controlsLocked} />;
}
