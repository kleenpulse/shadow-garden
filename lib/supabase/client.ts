"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client for client islands (AuthMenu). NEXT_PUBLIC_* vars inline at build;
// callers check `supabaseConfiguredClient` before instantiating so an unconfigured
// build never calls createBrowserClient with empty args (which throws).
// Prefer the new publishable key; fall back to the legacy anon key.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfiguredClient = Boolean(SUPABASE_URL && SUPABASE_KEY);

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!);
}
