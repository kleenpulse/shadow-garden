"use client";

import { useEffect, useState } from "react";
import { getEngine } from "@/lib/audio/engine";

/**
 * Can the audio engine make sound? `null` while the entitlement check resolves —
 * hold a neutral UI until it settles rather than flashing a lock or a live control.
 *
 * The engine owns the gate (SPEC §V17); this only reads it. Components used to
 * compute `IS_LOCAL_DEV || pro === true` themselves and push the result in, which
 * put the rule in two components and made the engine's answer depend on one of
 * them being mounted.
 */
export function useAudioAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => getEngine()?.subscribeAvailability(setAvailable), []);

  return available;
}
