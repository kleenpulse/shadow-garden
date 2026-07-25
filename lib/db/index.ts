import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// App-runtime DB client over the Supabase transaction pooler (Supavisor, port 6543).
// `prepare: false` is MANDATORY on the transaction pooler — prepared statements break
// across pooled connections. Never import this from `proxy.ts` (edge runtime); all DB
// access stays on the Node runtime.
//
// Importing this module is side-effect free. It used to throw at module scope when
// DATABASE_URL was unset, which turned a missing credential into an opaque 500 inside
// whichever caller reached it first — the Polar webhook retried that forever (§B.B4).
// Callers now ask for the handle and branch on `null` (§V.V4).

function connect() {
  const connectionString = process.env.DATABASE_URL as string;

  // Reuse the socket across dev HMR reloads so we don't exhaust the pool.
  const globalForDb = globalThis as unknown as {
    sgPgClient?: ReturnType<typeof postgres>;
  };

  const client =
    globalForDb.sgPgClient ?? postgres(connectionString, { prepare: false });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.sgPgClient = client;
  }

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof connect>;

/** Whether a connection string is present. Sync, never throws. */
export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let handle: Db | undefined;

/**
 * The DB handle, or `null` when the app is running without credentials.
 * Callers must branch — never assert. Connects lazily on first real use.
 */
export function getDb(): Db | null {
  if (!dbConfigured()) return null;
  handle ??= connect();
  return handle;
}
