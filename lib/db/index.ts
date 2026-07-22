import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// App-runtime DB client over the Supabase transaction pooler (Supavisor, port 6543).
// `prepare: false` is MANDATORY on the transaction pooler — prepared statements break
// across pooled connections. Never import this from `proxy.ts` (edge runtime); all DB
// access stays on the Node runtime.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the socket across dev HMR reloads so we don't exhaust the pool.
const globalForDb = globalThis as unknown as {
  sgPgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.sgPgClient ?? postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sgPgClient = client;
}

export const db = drizzle(client, { schema });
