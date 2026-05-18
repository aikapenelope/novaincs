/**
 * Database migration runner.
 *
 * Applies pending SQL migrations from the drizzle/ directory in order.
 * Uses a _migrations_applied tracking table to know which migrations
 * have already been applied. Idempotent and safe to re-run.
 *
 * On first run against an existing database (bootstrapped manually),
 * detects the presence of the 'tenants' table and seeds the tracker
 * with migrations 0000-0003 so they aren't re-applied.
 *
 * Called by the entrypoint script before the API starts.
 * Uses MIGRATION_DATABASE_URL (superuser) for DDL operations that
 * require GRANT, RLS, and role privileges.
 *
 * Usage:
 *   node dist/run-migrations.js
 *
 * Environment:
 *   MIGRATION_DATABASE_URL — superuser connection (required for GRANT/RLS)
 *   DATABASE_URL           — fallback if MIGRATION_DATABASE_URL not set
 */

import postgres from "postgres";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

// Migrations applied during the manual bootstrap phase (before auto-migrate).
// These are seeded into the tracker on first run so they aren't re-applied.
const PRE_EXISTING_MIGRATIONS = [
  "0000_init.sql",
  "0001_rls_policies.sql",
  "0002_roles_and_triggers.sql",
  "0003_schema_hardening.sql",
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(): Promise<postgres.Sql> {
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Neither MIGRATION_DATABASE_URL nor DATABASE_URL is set");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const sql = postgres(url, {
        max: 1,
        connect_timeout: Math.floor(CONNECT_TIMEOUT_MS / 1000),
        idle_timeout: 10,
      });
      // Verify the connection works.
      await sql`SELECT 1`;
      return sql;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        console.log(
          `[migrate] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        throw new Error(`Failed to connect after ${MAX_RETRIES} attempts: ${message}`);
      }
    }
  }
  throw new Error("Unreachable");
}

async function run(): Promise<void> {
  console.log("[migrate] Connecting to database...");
  const sql = await connectWithRetry();

  try {
    // Create tracking table if it doesn't exist.
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations_applied (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Get already-applied migrations.
    const applied = await sql`SELECT filename FROM _migrations_applied`;
    const appliedSet = new Set(applied.map((r) => r.filename as string));

    // First-run detection: if tracker is empty but database has tables,
    // seed with pre-existing migrations to avoid re-applying them.
    if (appliedSet.size === 0) {
      const [tenants] = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
      `;
      if (tenants) {
        console.log("[migrate] Existing database detected — seeding migration tracker.");
        for (const file of PRE_EXISTING_MIGRATIONS) {
          await sql`
            INSERT INTO _migrations_applied (filename)
            VALUES (${file})
            ON CONFLICT (filename) DO NOTHING
          `;
          appliedSet.add(file);
        }
        console.log(`[migrate] Seeded ${PRE_EXISTING_MIGRATIONS.length} pre-existing migrations.`);
      }
    }

    // Find pending SQL migration files.
    if (!existsSync(MIGRATIONS_DIR)) {
      console.log("[migrate] No migrations directory found, skipping.");
      return;
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log(`[migrate] All ${files.length} migrations up to date.`);
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s) to apply.`);

    for (const file of pending) {
      console.log(`[migrate] Applying: ${file}`);
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

      // Apply the migration. Each file runs as a single statement batch.
      // If a migration fails, we stop — don't apply subsequent migrations
      // that may depend on the failed one.
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations_applied (filename) VALUES (${file})`;
      console.log(`[migrate] Applied: ${file}`);
    }

    console.log(`[migrate] Successfully applied ${pending.length} migration(s).`);
  } finally {
    await sql.end();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[migrate] Fatal error: ${err instanceof Error ? err.message : err}`);
    // Exit with 0 so the entrypoint continues to start the API.
    // The API will work for existing tables; new features may be degraded.
    process.exit(0);
  });
