import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = PostgresJsDatabase<Schema>;
/** A database handle or an open transaction. */
export type DBOrTx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __careerOsSql?: postgres.Sql; __careerOsDb?: DB };

export const DEFAULT_DATABASE_URL = "postgres://careeros:careeros@localhost:5433/careeros";

function createDb(): DB {
  const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const client =
    globalForDb.__careerOsSql ??
    postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => {},
    });
  globalForDb.__careerOsSql = client;
  return drizzle(client, { schema });
}

/** Lazily-connecting database handle (postgres.js only connects on the first query). */
export let db: DB = globalForDb.__careerOsDb ?? createDb();
globalForDb.__careerOsDb = db;

/** Test hook: swap the database (e.g. for an in-memory PGlite instance). */
export function __setDbForTesting(testDb: unknown) {
  db = testDb as DB;
}

export async function pingDatabase(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export { schema };
