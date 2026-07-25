"use client";

import { createBrowserClient } from "@supabase/ssr";
import { has, supabaseKey, supabaseUrl } from "@/lib/capabilities";

// Browser client for client islands (AuthMenu). NEXT_PUBLIC_* vars inline at build;
// callers check `supabaseConfiguredClient` before instantiating so an unconfigured
// build never calls createBrowserClient with empty args (which throws).

export const supabaseConfiguredClient = has("supabase");

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl()!, supabaseKey()!);
}
