#!/usr/bin/env node
/**
 * Starts Career OS without Docker: the local database (when CAREER_OS_DB_DIR is set in .env), the migrations,
 * then the app. Ctrl+C or closing the window stops the app and closes the database cleanly.
 *
 *   npm run build:local     once, and after each update
 *   npm run local           production server (fast)
 *   npm run local -- --dev  development server (hot reload)
 *   --open                  open the browser once the app answers (or right away if it already runs)
 *   --idle-exit             stop once no Career OS page has been open for a while (app without a window of its own)
 *
 * The Windows install (install.ps1) ships a prebuilt, self-contained server (server.js at the root): it is used
 * when present, with no build step and no node_modules to install.
 *
 * CAREER_OS_HOME (Microsoft Store install, whose app folder is read-only): the settings live in
 * <home>\data\app\settings.env, written at the first launch, instead of a `.env` next to the app.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startLocalDb } from "./local-db.mjs";
import { ensureFreePorts, parseEnv, prepareHome, settingsFile } from "./app-home.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const home = process.env.CAREER_OS_HOME?.trim() ? path.resolve(process.env.CAREER_OS_HOME) : null;
// Store install: the address of a running Career OS, as its settings say (only the instance holding the lock writes
// them, see below).
const homeUrl = () => {
  try {
    return parseEnv(fs.readFileSync(settingsFile(home), "utf8")).APP_URL || null;
  } catch {
    return null;
  }
};
if (!home) {
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {
    // No .env: defaults below.
  }
}

const dev = process.argv.includes("--dev");
const open = process.argv.includes("--open");
const idleExit = process.argv.includes("--idle-exit");
let port = process.env.APP_PORT || "3000";
let host = process.env.APP_BIND || "127.0.0.1";
let url = (home ? homeUrl() : process.env.APP_URL) || `http://localhost:${port}`;
const log = (m) => console.log(`[career-os] ${m}`);
process.title = idleExit ? "Career OS" : "Career OS (fermer cette fenêtre arrête l'application)";

// node:http rather than fetch: on Windows, exiting right after a fetch can abort Node.js
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), which a second launch does when the app already runs.
function healthy() {
  return new Promise((resolve) => {
    const req = http.get(`${url.replace(/\/$/, "")}/api/health`, { agent: false, timeout: 2000 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode === 200));
      res.on("error", () => resolve(false));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

function openBrowser() {
  if (process.env.CAREER_OS_NO_BROWSER) return; // automated tests
  const [cmd, args] =
    process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    log(`ouvre ${url} dans ton navigateur`);
  }
}

// Double-click on the shortcut while Career OS already runs: just show it. (Store install never launched yet: no
// address of its own, so another Career OS on the default port must not be taken for it.)
if (open && (!home || homeUrl()) && (await healthy())) {
  openBrowser();
  process.exit(0);
}

// Store install: one process owns the database folder. A second launch while the first one is still starting waits
// for it and shows it. Only the lock holder writes the settings and checks the ports, so two launches never race.
let lockFile = null;
process.on("exit", () => {
  if (lockFile) fs.rmSync(lockFile, { force: true });
});
if (home) {
  const lockPath = path.join(home, "data", "app", "career-os.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  };
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      lockFile = lockPath;
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt > 2) throw error;
      const owner = Number(fs.readFileSync(lockPath, "utf8"));
      if (owner && owner !== process.pid && alive(owner)) {
        log("Career OS démarre déjà : ouverture dès qu'il répond");
        for (let i = 0; i < 180; i++) {
          url = homeUrl() ?? url; // the holder may have moved to another port
          if (await healthy()) {
            if (open) openBrowser();
            process.exit(0);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        console.error("[career-os] une autre ouverture de Career OS ne répond pas : ferme-la ou redémarre l'ordinateur.");
        process.exit(1);
      }
      fs.rmSync(lockPath, { force: true }); // left by a run that did not stop cleanly
    }
  }
  const values = await ensureFreePorts(home, (await prepareHome(home)).values);
  Object.assign(process.env, values);
  port = values.APP_PORT;
  host = values.APP_BIND;
  url = values.APP_URL;
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
    const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env, windowsHide: true });
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

// --idle-exit: each open Career OS page touches this file every minute (/api/health?beat=1).
const beatFile = idleExit ? path.join(path.resolve(process.env.APP_DATA_DIR || path.join(root, "data")), ".heartbeat") : null;
if (beatFile) {
  fs.mkdirSync(path.dirname(beatFile), { recursive: true });
  process.env.CAREER_OS_HEARTBEAT_FILE = beatFile;
}

const next = prebuilt
  ? spawn(process.execPath, [standalone], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production", PORT: port, HOSTNAME: host }, windowsHide: true })
  : spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), dev ? "dev" : "start", "-p", port, "-H", host], { stdio: "inherit", env: process.env, windowsHide: true });
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

// No page open for IDLE_MINUTES (tab or browser closed): stop, the database closes cleanly. A long pause between two
// checks means the computer slept: the pages get a fresh delay to check in again.
if (beatFile) {
  const idleMs = Number(process.env.CAREER_OS_IDLE_MINUTES || 10) * 60_000;
  let graceFrom = Date.now();
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - lastTick > 90_000) graceFrom = now;
    lastTick = now;
    let beat = 0;
    try {
      beat = fs.statSync(beatFile).mtimeMs;
    } catch {
      // no page yet
    }
    if (now - Math.max(beat, graceFrom) > idleMs) {
      log("plus aucune page Career OS ouverte : arrêt");
      void quit(0);
    }
  }, 30_000).unref();
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => void quit(0));
