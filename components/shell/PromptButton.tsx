import { getPrompt } from "@/lib/registry/prompt";
import type { ComponentEntry } from "@/lib/registry/types";
import CopyPromptButton, { PromptLocked } from "./CopyPromptButton";

// Server-side, so the prompt text arrives with the RSC payload.
//
// `pending` means a variant file isn't on disk yet. A prompt missing one of its
// files is worse than no prompt at all, so that case renders nothing. `locked`
// is inherited from getSource — the prompt gate is never a second ladder.
export default async function PromptButton({ entry }: { entry: ComponentEntry }) {
  const result = await getPrompt(entry);

  if (result.status === "pending") return null;

  if (result.status === "locked") {
    return <PromptLocked key={entry.slug} name={entry.name} />;
  }

  // Keyed by slug so a client-side nav between components remounts the button
  // instead of inheriting a stale "Copied" label.
  return (
    <CopyPromptButton
      key={entry.slug}
      text={result.text}
      slug={entry.slug}
      name={entry.name}
    />
  );
}
