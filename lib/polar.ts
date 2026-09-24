import "server-only";
import { Polar } from "@polar-sh/sdk";
import { has } from "@/lib/capabilities";

export function polarConfigured() {
  return has("polar");
}

// Node-runtime Polar SDK client. Server chooses sandbox vs production via
// POLAR_SERVER. Only the literal "production" goes live: an empty string (seen
// on Vercel) is not nullish, so `??` alone would hand the SDK `server: ""` —
// anything but "production" therefore falls back to sandbox, which can never
// charge a real card by accident.
export function getPolar() {
  return new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });
}
