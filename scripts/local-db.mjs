#!/usr/bin/env node
/**
 * Local database for Career OS without Docker: PostgreSQL compiled to WebAssembly (PGlite), stored as files in a
 * folder on disk and served on 127.0.0.1 with the PostgreSQL protocol. The app connects to it like to any
 * PostgreSQL server (DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<port>/postgres), so Docker and local
 * installs run the same code.
 *
 * One process owns the folder: a second start on the same port is refused instead of opening the files twice.
 *
 *   node scripts/local-db.mjs [--dir <folder>] [--port <port>]
 *   env: CAREER_OS_DB_DIR (default ./data/db), DB_PORT (default 5433)
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/** True when something already listens on 127.0.0.1:port. */
export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Opens the database folder and serves it. Returns a stop() that closes the server then the files. */
export async function startLocalDb({ dir, port }) {
  if (await portInUse(port)) throw new Error(`Port ${port} déjà utilisé : la base locale tourne peut-être déjà (ou un autre PostgreSQL).`);
  fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port, maxConnections: 8 });
  await server.start();
  let stopping = null;
  const stop = () =>
    (stopping ??= (async () => {
      await server.stop().catch(() => {});
      await db.close().catch(() => {});
    })());
  return { stop };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// Run as a standalone server (npm run db:local).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(arg("dir") ?? process.env.CAREER_OS_DB_DIR ?? "data/db");
  const port = Number(arg("port") ?? process.env.DB_PORT ?? 5433);
  try {
    const { stop } = await startLocalDb({ dir, port });
    console.log(`[local-db] PostgreSQL (PGlite) sur 127.0.0.1:${port}, données dans ${dir}`);
    const quit = async () => {
      await stop();
      console.log("[local-db] base fermée proprement");
      process.exit(0);
    };
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, quit);
    process.on("message", (m) => m === "shutdown" && quit());
  } catch (error) {
    console.error(`[local-db] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
