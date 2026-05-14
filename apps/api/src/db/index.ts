/**
 * Database connection module.
 *
 * Uses Drizzle ORM with the `postgres` driver (postgres.js).
 * Connection is lazy — created on first use.
 *
 * Environment variables:
 *   DATABASE_URL — PostgreSQL connection string for pg-nova.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

// Lazy singleton: connection is created on first access.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const sql = postgres(getDatabaseUrl(), {
      max: 20, // Connection pool size
      idle_timeout: 30,
    });
    _db = drizzle(sql);
  }
  return _db;
}
