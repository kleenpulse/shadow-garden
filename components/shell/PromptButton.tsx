import { getPrompt } from "@/lib/registry/prompt";
import type { ComponentEntry } from "@/lib/registry/types";
import CopyPromptButton, { PromptLocked } from "./CopyPromptButton";

// Server-side, so the entitlement answer arrives with the RSC payload: no
// useIsPro(), no unresolved flash, and no client-held prompt text for a visitor
// who isn't entitled to the same bytes on the Code tab.
//
// `pending` means a variant file isn't on disk yet. A prompt missing one of its
// files is worse than no prompt at all, so that case renders nothing.
export default async function PromptButton({ entry }: { entry: ComponentEntry }) {
  const result = await getPrompt(entry);

  if (result.status === "pending") return null;

  // Keyed by slug so a client-side nav between components remounts the button
  // instead of inheriting a stale "Copied" label.
  if (result.status === "locked") {
    return <PromptLocked key={entry.slug} name={entry.name} />;
  }

  return (
    <CopyPromptButton
      key={entry.slug}
      text={result.text}
      slug={entry.slug}
      name={entry.name}
    />
  );
}
