"use client";

import { useEffect, useState } from "react";
import { getEngine } from "@/lib/audio/engine";

/**
 * Can the audio engine make sound? `null` while the answer is unresolved — hold
 * a neutral UI until it settles. The engine owns the answer; this only reads it.
 */
export function useAudioAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => getEngine()?.subscribeAvailability(setAvailable), []);

  return available;
}
