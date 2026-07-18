import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn-style class combiner used by the ported ellumAI components.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Registry names are PascalCase ("ScrollVelocity"); uppercase display headers
// need word breaks or they render as one run ("SCROLLVELOCITY").
export function displayName(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
