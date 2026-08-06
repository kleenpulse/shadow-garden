import { isControlsLocked } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import FullscreenStage from "./FullscreenStage";

// Fullscreen twin of WorkspaceSection. Without it the /full route is a bypass: same
// controls, same nuqs state, no gate. The await sits below the page's Suspense
// boundary for the same PPR reason the workspace one does. Same GATE_CONTROLS flag —
// one helper, so the twin can never drift out of step with the workspace.
export default async function FullscreenSection({ entry }: { entry: ComponentEntry }) {
  const controlsLocked = await isControlsLocked(entry.tier);
  return <FullscreenStage entry={entry} controlsLocked={controlsLocked} />;
}
