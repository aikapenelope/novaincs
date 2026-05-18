#!/bin/sh
# Qyne API — Entrypoint with automatic database migrations.
#
# Runs all pending SQL migrations against pg-nova before starting the API.
# Uses a tracking table (_migrations_applied) to know which migrations
# have already been applied. Safe to re-run — skips already-applied files.
#
# On first run, detects if the database already has tables (from manual
# bootstrap) and seeds the tracking table with previously-applied migrations
# so they aren't re-applied.
#
# Environment variables:
#   DATABASE_URL           — App connection (qyne_app role, used at runtime)
#   MIGRATION_DATABASE_URL — Superuser connection (nova role, used for migrations)
#                            Required for GRANT, RLS, and role operations.
#                            Falls back to DATABASE_URL if not set.

set -e

MIGRATIONS_DIR="/app/apps/api/drizzle"

# --- Run migrations if DATABASE_URL is set ---
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Checking for pending migrations..."

  MIGRATE_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}"

  MIGRATE_URL="$MIGRATE_URL" node -e "
    const postgres = require('postgres');
    const sql = postgres(process.env.MIGRATE_URL, { max: 1 });

    async function run() {
      // Create tracking table if it doesn't exist.
      await sql\`
        CREATE TABLE IF NOT EXISTS _migrations_applied (
          filename VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      \`;

      // Check if this is a first run on an existing database.
      // If the tracking table is empty but the 'tenants' table exists,
      // the database was bootstrapped manually. Seed the tracker with
      // all migrations that predate the auto-migration system.
      const applied = await sql\`SELECT filename FROM _migrations_applied\`;
      const appliedSet = new Set(applied.map(r => r.filename));

      if (appliedSet.size === 0) {
        const [tenants] = await sql\`
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'tenants'
        \`;
        if (tenants) {
          console.log('[entrypoint] Existing database detected — seeding migration tracker.');
          const preExisting = [
            '0000_init.sql',
            '0001_rls_policies.sql',
            '0002_roles_and_triggers.sql',
            '0003_schema_hardening.sql',
          ];
          for (const file of preExisting) {
            await sql\`
              INSERT INTO _migrations_applied (filename)
              VALUES (\${file})
              ON CONFLICT (filename) DO NOTHING
            \`;
            appliedSet.add(file);
          }
          console.log('[entrypoint] Seeded ' + preExisting.length + ' pre-existing migrations.');
        }
      }

      // Find SQL migration files, sorted by name.
      const fs = require('fs');
      const path = require('path');
      const dir = '${MIGRATIONS_DIR}';

      if (!fs.existsSync(dir)) {
        console.log('[entrypoint] No migrations directory found, skipping.');
        await sql.end();
        return;
      }

      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      let count = 0;
      for (const file of files) {
        if (appliedSet.has(file)) continue;

        console.log('[entrypoint] Applying migration: ' + file);
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        await sql.unsafe(content);
        await sql\`INSERT INTO _migrations_applied (filename) VALUES (\${file})\`;
        count++;
      }

      if (count > 0) {
        console.log('[entrypoint] Applied ' + count + ' migration(s).');
      } else {
        console.log('[entrypoint] All migrations up to date.');
      }

      await sql.end();
    }

    run().catch(err => {
      console.error('[entrypoint] Migration failed:', err.message);
      // Don't exit — let the API start anyway so health checks can report the issue.
      // The API will work for existing tables; new features may be degraded.
    });
  "
else
  echo "[entrypoint] DATABASE_URL not set, skipping migrations."
fi

# --- Start the API ---
echo "[entrypoint] Starting Qyne API..."
exec node apps/api/dist/index.js
