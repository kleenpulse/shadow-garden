import "server-only";
import { Polar } from "@polar-sh/sdk";

export function polarConfigured() {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
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
