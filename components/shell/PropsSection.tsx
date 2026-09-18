import { getEntitlement } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import PropsLocked from "./PropsLocked";
import PropsTable from "./PropsTable";

// Server wrapper: the Props API table gates with the pro tier, same seam as
// source and install — the documented API is part of the paid artifact. The
// Controls panel deliberately does NOT follow it (GATE_CONTROLS, off): live
// tuning is the demo, and the locked card below promises exactly that ("tune
// the live preview above for free"). A free entry never touches the ladder and
// stays static; a Pro entry reads cookies here (dynamic) → renders inside
// <Suspense>.
//
// This is a presentation gate, NOT a secrecy boundary — unlike getSource(),
// which reads from disk so Pro source never crosses to the client. The registry
// is imported directly by client components (Sidebar, CommandMenu), so every
// PropSchema — descriptions included — is already in the client bundle.
// Stripping it from this page's RSC payload would hide nothing and cost a file.
export default async function PropsSection({ entry }: { entry: ComponentEntry }) {
  if (entry.pro) {
    const { pro } = await getEntitlement();
    if (!pro) {
      return <PropsLocked name={entry.name} propCount={entry.props.length} />;
    }
  }
  return <PropsTable entry={entry} />;
}
