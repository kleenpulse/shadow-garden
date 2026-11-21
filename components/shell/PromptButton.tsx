import { cachedPrompt } from "@/lib/registry/cached";
import type { ComponentEntry } from "@/lib/registry/types";
import CopyPromptButton from "./CopyPromptButton";

// Server-side, so the prompt text arrives with the RSC payload. The read goes
// through cachedPrompt so it runs once at build time, not on every page view
// (see lib/registry/cached.ts).
//
// `pending` means a variant file isn't on disk yet. A prompt missing one of its
// files is worse than no prompt at all, so that case renders nothing.
export default async function PromptButton({ entry }: { entry: ComponentEntry }) {
  const result = await cachedPrompt(entry.slug);

  if (result.status === "pending") return null;

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
