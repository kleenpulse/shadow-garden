import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn-style class combiner used by the ported ellumAI components.
//
// This file ships to customers — every registry component that imports `cn`
// declares it as a `util` variant, so it lands in a buyer's project verbatim.
// Keep it to exactly that: shell-only helpers belong elsewhere (§V41).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
