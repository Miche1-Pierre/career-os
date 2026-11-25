/**
 * Where an install keeps the user's data, and the settings of an install whose app folder is read-only (Microsoft
 * Store): they live with the user's data, in CAREER_OS_HOME (Documents\CareerOS), and the first launch writes them, as
 * the install command does for its `.env`.
 *
 *   <home>\documents\…        the library (CV, letters, diplomas…)
 *   <home>\data\app\          app files, the pasted Claude key, settings.env
 *   <home>\backups\           daily backups
 *   <local>\db\               the live database, on this computer only (%USERPROFILE%\.careeros, see localDir)
 *
 * Documents is often synced (OneDrive "Documents backup", the default on many Windows 11 PCs; iCloud, Dropbox…): fine
 * for documents and backups, not for a database whose hundreds of small files are rewritten while it runs (a sync tool
 * locks them, turns them into online-only placeholders, or merges two computers' copies). Not under %LOCALAPPDATA%
 * either: Windows redirects a Store app's writes there into the package's private storage, deleted on uninstall.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const LIBRARY_FOLDERS = ["Academic", "Admin", "CV", "Certificates", "Contracts", "Cover Letters", "Other", "Portfolio", "Presentations", "Recommendations"];

/** Ports tried for a Store install: away from the usual development ports (3000, 5432/5433) so both can coexist. */
export const APP_PORTS = [3300, 3399];
export const DB_PORTS = [5500, 5599];

/**
 * The folder of this computer that holds the live database (and the lock that guards it): %USERPROFILE%\.careeros.
 * Outside Documents, which sync tools take; outside AppData, which a Store app cannot keep after uninstall.
 * CAREER_OS_LOCAL_DIR overrides it (tests).
 * @param {Record<string, string | undefined>} [env]
 */
export function localDir(env = process.env) {
  return path.resolve(env.CAREER_OS_LOCAL_DIR?.trim() || path.join(os.homedir(), ".careeros"));
}

/** @param {string} local */
const homeReadme = (local) => [
  "Career OS : tes données",
  "",
  "documents\\  tes CV, lettres, diplômes, contrats… rangés par type (Career OS y range aussi ce que tu ajoutes).",
  "data\\app\\   réglages et fichiers de l'application (dont ta clé Claude si tu l'as collée).",
  "backups\\    une sauvegarde complète automatique chaque jour (les 14 dernières).",
  "",
  `Ta base (candidatures, entretiens, logements…) est dans ${path.join(local, "db")}, sur cet ordinateur seulement :`,
  "un dossier synchronisé, comme Documents avec OneDrive, pourrait l'abîmer pendant qu'elle tourne.",
  "",
  `Désinstaller Career OS ne supprime ni ce dossier ni ${local}.`,
  "",
  "Changer d'ordinateur :",
  "1. Dans Career OS : Paramètres > Données et sauvegardes > Sauvegarder maintenant.",
  "2. Copie ce dossier CareerOS dans les Documents du nouvel ordinateur (avec OneDrive, il y est déjà).",
  "3. Installe Career OS sur le nouvel ordinateur, puis Paramètres > Données et sauvegardes > Restaurer la",
  "   sauvegarde la plus récente : tes candidatures, tes documents et tes conversations avec l'assistant reviennent.",
];

/** @param {string} home */
const localReadme = (home) => [
  "Career OS : ta base de données",
  "",
  "db\\  tes candidatures, entretiens, logements… Ne supprime pas ce dossier.",
  "",
  "Elle reste sur cet ordinateur exprès, hors de Documents : OneDrive ou un autre outil de synchronisation pourrait",
  "l'abîmer pendant qu'elle tourne. Ne la déplace pas dans un dossier synchronisé.",
  `Tes documents et tes sauvegardes quotidiennes sont dans ${home} (voir son LISEZ-MOI.txt).`,
  "Désinstaller Career OS ne supprime pas ce dossier.",
];

/**
 * Notepad-friendly text file (BOM, Windows line endings), rewritten only when its text changed.
 * @param {string} file
 * @param {string[]} lines
 */
function writeText(file, lines) {
  const text = `﻿${lines.join("\r\n")}\r\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
  fs.writeFileSync(file, text);
}

/** @param {string} home */
export const settingsFile = (home) => path.join(home, "data", "app", "settings.env");

/** @param {string} p */
const slash = (p) => p.replace(/\\/g, "/");

/**
 * Settings owned by the install (rewritten at each launch); anything else in the file is kept.
 * @param {{ home: string, local: string, appPort: number, dbPort: number }} options
 * @returns {Record<string, string>}
 */
export function homeSettings({ home, local, appPort, dbPort }) {
  return {
    APP_PORT: String(appPort),
    APP_BIND: "127.0.0.1",
    APP_URL: `http://localhost:${appPort}`,
    CAREER_OS_DB_DIR: slash(path.join(local, "db")),
    DB_PORT: String(dbPort),
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
    DATABASE_POOL_SIZE: "1",
    DOCUMENTS_DIR: slash(path.join(home, "documents")),
    DOCUMENTS_ROOT: slash(path.join(home, "documents")),
    APP_DATA_DIR: slash(path.join(home, "data", "app")),
    BACKUPS_DIR: slash(path.join(home, "backups")),
    AI_PROVIDER: "claude-code",
    CLAUDE_REQUIRES_KEY: "true",
    CAREER_OS_DISTRIBUTION: "store",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/** Defaults the user may change in settings.env (kept when present). */
const USER_DEFAULTS = { AI_OUTPUT_LANGUAGE: "fr", TZ: "Europe/Paris" };

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    let value = line.slice(i + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

/** @param {Record<string, string>} values */
export function serializeEnv(values) {
  const lines = ["# Career OS : réglages (les ports et dossiers sont réécrits à chaque lancement)."];
  for (const [k, v] of Object.entries(values)) lines.push(`${k}=${v}`);
  return `${lines.join("\n")}\n`;
}

/**
 * Merges what the user set before, the user defaults and the settings the install owns.
 * @param {Record<string, string>} previous
 * @param {Record<string, string>} owned
 * @returns {Record<string, string>}
 */
export function mergeSettings(previous, owned) {
  return { ...USER_DEFAULTS, ...previous, ...owned };
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * @param {number[]} range
 * @param {number[]} [skip]
 */
export async function findPort([from, to], skip = []) {
  for (let port = from; port <= to; port++) if (!skip.includes(port) && (await portFree(port))) return port;
  throw new Error(`aucun port libre entre ${from} et ${to}`);
}

/**
 * Folders and read-mes of the library (Documents) and of the database's folder (this computer); settings are read (or
 * created) and returned, not yet applied. The database folder itself is created when the database first opens.
 * @param {string} home
 * @param {string} [local]
 * @returns {Promise<{ file: string, values: Record<string, string> }>}
 */
export async function prepareHome(home, local = localDir()) {
  for (const f of LIBRARY_FOLDERS) fs.mkdirSync(path.join(home, "documents", f), { recursive: true });
  for (const d of [["data", "app"], ["backups"]]) fs.mkdirSync(path.join(home, ...d), { recursive: true });
  fs.mkdirSync(local, { recursive: true });
  writeText(path.join(home, "LISEZ-MOI.txt"), homeReadme(local));
  writeText(path.join(local, "LISEZ-MOI.txt"), localReadme(home));

  const file = settingsFile(home);
  const previous = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  const appPort = Number(previous.APP_PORT) || (await findPort(APP_PORTS));
  const dbPort = Number(previous.DB_PORT) || (await findPort(DB_PORTS, [appPort]));
  const values = mergeSettings(previous, homeSettings({ home, local, appPort, dbPort }));
  fs.writeFileSync(file, serializeEnv(values));
  return { file, values };
}

/**
 * Before starting (the app is not running): moves to free ports if another program took ours meanwhile.
 * @param {string} home
 * @param {Record<string, string>} values
 * @param {string} [local]
 * @returns {Promise<Record<string, string>>}
 */
export async function ensureFreePorts(home, values, local = localDir()) {
  let appPort = Number(values.APP_PORT);
  let dbPort = Number(values.DB_PORT);
  if (!(await portFree(appPort))) appPort = await findPort(APP_PORTS, [dbPort]);
  if (!(await portFree(dbPort))) dbPort = await findPort(DB_PORTS, [appPort]);
  if (appPort === Number(values.APP_PORT) && dbPort === Number(values.DB_PORT)) return values;
  const next = mergeSettings(values, homeSettings({ home, local, appPort, dbPort }));
  fs.writeFileSync(settingsFile(home), serializeEnv(next));
  return next;
}

/**
 * The lock that keeps a second launch (of this install or another one) from opening the database twice: next to the
 * database folder, so on this computer, never synced to another one. It holds the owner's process id, then its address.
 * @param {string} dbDir
 */
export const lockFile = (dbDir) => path.join(path.dirname(path.resolve(dbDir)), "career-os.lock");

/**
 * @param {string} file
 * @returns {{ pid: number, url: string | null } | null}
 */
export function readLock(file) {
  try {
    const [pid, url] = fs.readFileSync(file, "utf8").split(/\r?\n/);
    return { pid: Number(pid) || 0, url: url?.trim() || null };
  } catch {
    return null;
  }
}

// ── Moving the database folder ───────────────────────────────────────────────────────────────────────────────────

/** @param {string} dir */
const isDatabase = (dir) => fs.existsSync(path.join(dir, "PG_VERSION"));

/** @param {string} p */
const comparable = (p) => {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

/**
 * Same folder, whatever the spelling (Windows ignores case) or the link that leads to it.
 * @param {string} a
 * @param {string} b
 */
function samePlace(a, b) {
  if (comparable(a) === comparable(b)) return true;
  try {
    const x = fs.statSync(a, { bigint: true });
    const y = fs.statSync(b, { bigint: true });
    return x.ino !== 0n && x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

/**
 * @param {string} inner
 * @param {string} outer
 */
const inside = (inner, outer) => comparable(inner).startsWith(comparable(outer) + path.sep);

/**
 * Everything in a folder, relative and sorted; folders end with "/" (empty ones matter: PostgreSQL needs them).
 * @param {string} dir
 * @returns {string[]}
 */
function listTree(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const item = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        out.push(`${item}/`);
        walk(item);
      } else out.push(item);
    }
  };
  walk("");
  return out.sort();
}

/** @param {string} file */
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * null when both folders hold the same files with the same bytes, otherwise what differs.
 * @param {string} a
 * @param {string} b
 * @returns {string | null}
 */
function treeDifference(a, b) {
  const left = listTree(a);
  const right = listTree(b);
  if (left.join("\n") !== right.join("\n")) return `${left.length} éléments d'un côté, ${right.length} de l'autre`;
  for (const item of left) {
    if (item.endsWith("/")) continue;
    const x = path.join(a, item);
    const y = path.join(b, item);
    if (fs.statSync(x).size !== fs.statSync(y).size || digest(x) !== digest(y)) return `${item} diffère`;
  }
  return null;
}

/**
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of listTree(from)) {
    const target = path.join(to, item);
    if (item.endsWith("/")) fs.mkdirSync(target, { recursive: true });
    else fs.copyFileSync(path.join(from, item), target, fs.constants.COPYFILE_EXCL);
  }
}

/** @param {unknown} error */
const reason = (error) => (error instanceof Error ? error.message : String(error));

/**
 * @typedef {{ dir: string, status: "none" | "moved" | "kept-both" | "failed", detail?: string }} MoveResult
 * dir: the database folder to open now. status: nothing to move, moved (detail: the old folder could not be deleted
 * yet), two different databases found (the new one is used, the old one is left alone), or the move failed (detail;
 * the old folder is still used, and the move is tried again at the next launch).
 */

/**
 * Deletes the old folder of a move that went through; the note next to the new folder names it until then.
 * @param {string} src
 * @param {string} dst
 * @param {string} note
 * @returns {MoveResult}
 */
function dropOldFolder(src, dst, note) {
  try {
    fs.rmSync(src, { recursive: true, force: true, maxRetries: 5 });
    if (fs.existsSync(src)) throw new Error("des fichiers sont encore utilisés");
    fs.rmSync(note, { force: true });
    return { dir: dst, status: "moved" };
  } catch (error) {
    return { dir: dst, status: "moved", detail: `ancien dossier ${src} pas encore supprimé (${reason(error)}) : nouvel essai au prochain lancement` };
  }
}

/**
 * Moves the database folder to its new place, once (Career OS closed, the lock held). The copy is written next to the
 * new place, checked file by file (size and SHA-256), then renamed into place; only then is the old folder deleted.
 * If anything fails before that, nothing is deleted: the old folder stays in use and the move is tried again at the
 * next launch. Never replaces a database already at the new place.
 * @param {{ from: string, to: string }} paths
 * @returns {MoveResult}
 */
export function moveDatabase({ from, to }) {
  const src = path.resolve(from);
  const dst = path.resolve(to);
  if (samePlace(src, dst) || inside(src, dst) || inside(dst, src)) return { dir: dst, status: "none" };
  const note = `${dst}.ancien-emplacement.txt`;
  const staging = `${dst}.copie`;

  if (fs.existsSync(note)) {
    const named = fs.readFileSync(note, "utf8").trim();
    if (isDatabase(dst) && named && samePlace(named, src)) return dropOldFolder(src, dst, note);
    if (!isDatabase(dst)) fs.rmSync(note, { force: true }); // left by a move that did not go through
  }
  if (!isDatabase(src)) {
    try {
      if (fs.existsSync(src) && fs.readdirSync(src).length === 0) fs.rmdirSync(src); // empty folder of an older install
    } catch {
      // only tidying
    }
    return { dir: dst, status: "none" };
  }
  if (isDatabase(dst)) {
    // Same bytes: a move stopped right after the copy. Otherwise two real databases: never delete either.
    if (treeDifference(src, dst) === null) return dropOldFolder(src, dst, note);
    return { dir: dst, status: "kept-both", detail: `deux bases trouvées : Career OS utilise ${dst}, l'ancienne reste dans ${src}` };
  }

  try {
    fs.rmSync(staging, { recursive: true, force: true, maxRetries: 3 });
    if (fs.existsSync(dst)) {
      if (fs.readdirSync(dst).length > 0) throw new Error(`${dst} existe déjà et ne contient pas de base`);
      fs.rmdirSync(dst);
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    copyTree(src, staging);
    const difference = treeDifference(src, staging);
    if (difference) throw new Error(`copie différente de l'original (${difference})`);
    // The note first: once the copy is in place, a launch that stops before the old folder is gone finishes the job.
    fs.writeFileSync(note, `${src}\n`);
    fs.renameSync(staging, dst);
  } catch (error) {
    try {
      fs.rmSync(staging, { recursive: true, force: true, maxRetries: 3 });
      fs.rmSync(note, { force: true });
    } catch {
      // the next launch cleans up
    }
    return { dir: src, status: "failed", detail: reason(error) };
  }
  return dropOldFolder(src, dst, note);
}
