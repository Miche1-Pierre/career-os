/**
 * Applies pending migrations and first-run defaults. Runs at container start (bundled to dist/migrate.mjs)
 * and locally with `npm run db:migrate`.
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { bootstrapDefaults } from "../bootstrap";

async function waitForDatabase(url: string, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    const probe = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await probe`select 1`;
      await probe.end();
      return;
    } catch (error) {
      await probe.end({ timeout: 1 }).catch(() => {});
      if (i === attempts) throw error;
      console.log(`[migrate] database not ready (${i}/${attempts}), retrying…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL || "postgres://careeros:careeros@localhost:5433/careeros";
  await waitForDatabase(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const migrationsFolder = process.env.MIGRATIONS_DIR || path.join(process.cwd(), "drizzle");
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  const result = await bootstrapDefaults(db);
  console.log(`[migrate] done (stages +${result.stagesCreated}, tags +${result.tagsCreated}, views +${result.viewsCreated})`);
  await client.end();
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
