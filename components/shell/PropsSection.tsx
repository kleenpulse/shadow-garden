import { isControlsLocked } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import PropsTable from "./PropsTable";
import SubscribeButton from "./SubscribeButton";

// Server wrapper: the Props API table rides the same GATE_CONTROLS flag as the Controls
// panel — off by default, so the API stays open to everyone unless a deploy turns the
// paywall on. When it is on, the gate is by tier, not global: a free entry's API stays
// open, same as its source, because it is the funnel. A gated Pro entry reads cookies
// here (dynamic) → renders inside <Suspense>; everything else is static.
//
// This is a presentation gate, NOT a secrecy boundary — unlike getSource(), which reads
// from disk so Pro source never crosses to the client. The registry is imported directly
// by client components (Sidebar, CommandMenu, FavoritesGrid), so every PropSchema —
// descriptions included — is already in the client bundle. Stripping it from this page's
// RSC payload would hide nothing and cost a file. If the API docs ever need to be
// genuinely withheld, the fix is a client-safe registry projection, not a filter here.
export default async function PropsSection({ entry }: { entry: ComponentEntry }) {
  if (await isControlsLocked(entry.tier)) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-hairline bg-panel px-6 py-8 text-center">
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
          Pro
        </span>
        <p className="max-w-sm font-sans text-sm text-ink-dim">
          The {entry.props.length}-prop API for {entry.name} — types, defaults and what
          each one does — is available on the Pro tier. Tune the live preview above for
          free.
        </p>
        <SubscribeButton label="View the props →" className="mt-2" />
      </div>
    );
  }

  return <PropsTable entry={entry} />;
}
