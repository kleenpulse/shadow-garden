import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI does not auto-load .env files — load .env.local ourselves
// (Node 20.12+ / Bun both expose process.loadEnvFile). Guarded so it's a no-op if
// the runtime lacks it or the file is absent (env may be supplied another way).
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local or runtime without loadEnvFile — rely on ambient process.env
}

// Migrations run against the DIRECT connection (port 5432), not the transaction
// pooler — DDL doesn't run cleanly over a transaction-pooled connection.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
});
