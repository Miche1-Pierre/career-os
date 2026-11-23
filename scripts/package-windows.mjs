#!/usr/bin/env node
/**
 * Assembles the prebuilt Windows app downloaded by install.ps1 (run on Windows, after
 * `NEXT_OUTPUT=standalone npm run build` and `node scripts/build-scripts.mjs`):
 *
 *   release/career-os-windows-x64.zip         self-contained server + static files + migrations + local database
 *   release/career-os-windows-x64.zip.sha256  checksum checked by the installer
 *
 * Node.js and the Claude Code CLI are not bundled: the installer downloads them from their official sources.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "release");
const stage = path.join(outDir, "career-os");
const zipName = "career-os-windows-x64.zip";
const zip = path.join(outDir, zipName);
const log = (m) => console.log(`[package] ${m}`);

const need = (p, hint) => {
  if (!fs.existsSync(path.join(root, p))) {
    console.error(`[package] ${p} manquant : ${hint}`);
    process.exit(1);
  }
};
need(".next/standalone/server.js", "lance d'abord la compilation avec NEXT_OUTPUT=standalone");
need("dist/migrate.mjs", "lance d'abord node scripts/build-scripts.mjs");

const copy = (from, to = from) => fs.cpSync(path.join(root, from), path.join(stage, to), { recursive: true, dereference: true });

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// Self-contained server (traced node_modules included), then what it serves and needs next to it.
fs.cpSync(path.join(root, ".next", "standalone"), stage, { recursive: true, dereference: true });
copy(".next/static");
copy("public");
copy("drizzle");
copy("dist");
for (const f of ["start-local.mjs", "local-db.mjs", "career-os.ico", "uninstall-windows.ps1"]) copy(path.join("scripts", f));
// The local database server is started by start-local.mjs, outside Next.js: its packages are not traced.
for (const pkg of ["@electric-sql/pglite", "@electric-sql/pglite-socket"]) copy(path.join("node_modules", pkg));
for (const f of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) copy(f);
// The installer writes the real .env; a copied one from the build machine must never ship.
fs.rmSync(path.join(stage, ".env"), { force: true });

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
fs.writeFileSync(path.join(stage, "VERSION"), `${version}\n`);

// Windows' own tar (bsdtar) writes zip archives; another tar on the PATH (Git Bash's) does not.
log(`archive ${zipName}`);
const windowsTar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const tar = spawnSync(fs.existsSync(windowsTar) ? windowsTar : "tar", ["-a", "-c", "-f", zip, "-C", stage, "."], { stdio: "inherit" });
if (tar.status !== 0) process.exit(tar.status ?? 1);

const hash = crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
fs.writeFileSync(`${zip}.sha256`, `${hash}  ${zipName}\n`);
log(`${zipName} : ${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} Mo, sha256 ${hash}`);
