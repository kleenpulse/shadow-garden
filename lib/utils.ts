import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn-style class combiner used by the ported ellumAI components.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
