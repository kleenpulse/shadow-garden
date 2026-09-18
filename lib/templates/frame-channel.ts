import type { TunedValues } from "@/lib/registry/types";

// Bench ↔ frame transport. Both halves live here rather than inside a template,
// so none of it reaches the bytes a buyer copies (§V59).

export const TEMPLATE_MESSAGE = "sg:template-skin";

export interface TemplateSkinMessage {
  type: typeof TEMPLATE_MESSAGE;
  values: TunedValues;
  paused: boolean;
  reducedMotion: boolean;
}

/**
 * Narrow an untrusted `MessageEvent.data`. The origin check is the caller's job
 * and is not optional — a frame that trusts any sender is a frame anyone can
 * repaint.
 */
export function isSkinMessage(data: unknown): data is TemplateSkinMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === TEMPLATE_MESSAGE
  );
}

/**
 * Sent frame → parent once the bridge has mounted. Without it the parent would
 * have to guess when the iframe is listening: posting on load fires before the
 * React tree exists, and posting on a timer races a cold document.
 */
export const TEMPLATE_READY = "sg:template-ready";

export function isReadyMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === TEMPLATE_READY
  );
}
