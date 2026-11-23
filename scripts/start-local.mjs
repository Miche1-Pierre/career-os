#!/usr/bin/env node
/**
 * Starts Career OS without Docker: the local database (when CAREER_OS_DB_DIR is set in .env), the migrations,
 * then the app. Ctrl+C or closing the window stops the app and closes the database cleanly.
 *
 *   npm run build:local     once, and after each update
 *   npm run local           production server (fast)
 *   npm run local -- --dev  development server (hot reload)
 *   --open                  open the browser once the app answers (or right away if it already runs)
 *
 * The Windows install (install.ps1) ships a prebuilt, self-contained server (server.js at the root): it is used
 * when present, with no build step and no node_modules to install.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startLocalDb } from "./local-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // No .env: defaults below.
}

const dev = process.argv.includes("--dev");
const open = process.argv.includes("--open");
const port = process.env.APP_PORT || "3000";
const host = process.env.APP_BIND || "127.0.0.1";
const url = process.env.APP_URL || `http://localhost:${port}`;
const log = (m) => console.log(`[career-os] ${m}`);
process.title = "Career OS (fermer cette fenêtre arrête l'application)";

async function healthy() {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    log(`ouvre ${url} dans ton navigateur`);
  }
}

// Double-click on the shortcut while Career OS already runs: just show it.
if (open && (await healthy())) {
  openBrowser();
  process.exit(0);
}

let db = null;
if (process.env.CAREER_OS_DB_DIR) {
  const dir = path.resolve(process.env.CAREER_OS_DB_DIR);
  const dbPort = Number(process.env.DB_PORT || 5433);
  try {
    db = await startLocalDb({ dir, port: dbPort });
    log(`base locale prête (127.0.0.1:${dbPort}, ${dir})`);
  } catch (error) {
    console.error(`[career-os] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const stopDb = async () => {
  if (db) await db.stop();
  db = null;
};

// Migrations and first-run defaults (bundled script after build:local, TypeScript source otherwise). Never run
// them synchronously: the local database lives in this process and must keep answering meanwhile.
const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
const bundled = path.join(root, "dist", "migrate.mjs");
const migrateCode = await run(fs.existsSync(bundled) ? [bundled] : [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/server/db/migrate.ts"]);
if (migrateCode !== 0) {
  await stopDb();
  console.error("[career-os] les migrations ont échoué, l'application n'est pas lancée.");
  process.exit(1);
}

// Prebuilt self-contained server (Windows install) or a regular build (`npm run build:local`).
const standalone = path.join(root, "server.js");
const prebuilt = !dev && fs.existsSync(standalone);
if (!dev && !prebuilt && !fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
  await stopDb();
  console.error("[career-os] l'application n'est pas construite : lance d'abord « npm run build:local ».");
  process.exit(1);
}

const next = prebuilt
  ? spawn(process.execPath, [standalone], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production", PORT: port, HOSTNAME: host } })
  : spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), dev ? "dev" : "start", "-p", port, "-H", host], { stdio: "inherit", env: process.env });
log(`Career OS démarre sur ${url}`);

if (open) {
  void (async () => {
    for (let i = 0; i < 120; i++) {
      if (await healthy()) return openBrowser();
      await new Promise((r) => setTimeout(r, 1000));
    }
    log(`Career OS ne répond pas encore : ouvre ${url} dans ton navigateur.`);
  })();
}

let quitting = false;
const quit = async (code = 0) => {
  if (quitting) return;
  quitting = true;
  if (next.exitCode === null) next.kill();
  await stopDb();
  log("arrêté, base fermée proprement");
  process.exit(code);
};
next.on("exit", (code) => void quit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => void quit(0));
