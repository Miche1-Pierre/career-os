import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import { __setDbForTesting } from "@/server/db";
import { bootstrapDefaults } from "@/server/bootstrap";
import { invalidateSettingsCache } from "@/server/services/settings";

/** Fresh in-memory PostgreSQL (PGlite) with migrations + defaults, wired into the services. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  __setDbForTesting(db);
  invalidateSettingsCache();
  await bootstrapDefaults(db as never);
  return { db, client };
}

/** Isolated storage folders (documents library, app data, backups). */
export function useTempStorage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-test-"));
  for (const dir of ["documents", "data", "backups"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  process.env.DOCUMENTS_ROOT = path.join(root, "documents");
  process.env.DOCUMENTS_HOST_PATH = "C:\\Candidature\\documents";
  process.env.APP_DATA_DIR = path.join(root, "data");
  process.env.BACKUPS_DIR = path.join(root, "backups");
  return root;
}
