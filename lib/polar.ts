import "server-only";
import { Polar } from "@polar-sh/sdk";
import { has } from "@/lib/capabilities";

export function polarConfigured() {
  return has("polar");
}

// Node-runtime Polar SDK client. Server chooses sandbox vs production via POLAR_SERVER.
export function getPolar() {
  return new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server:
      (process.env.POLAR_SERVER as "sandbox" | "production" | undefined) ??
      "sandbox",
  });
}
