/**
 * Settings of an install whose app folder is read-only (Microsoft Store): they live with the user's data, in
 * CAREER_OS_HOME (Documents\CareerOS), and the first launch writes them, as the install command does for its `.env`.
 *
 *   <home>\documents\…        the library (CV, letters, diplomas…)
 *   <home>\data\db\           the local database
 *   <home>\data\app\          app files, the pasted Claude key, settings.env
 *   <home>\backups\           daily backups
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const LIBRARY_FOLDERS = ["Academic", "Admin", "CV", "Certificates", "Contracts", "Cover Letters", "Other", "Portfolio", "Presentations", "Recommendations"];

/** Ports tried for a Store install: away from the usual development ports (3000, 5432/5433) so both can coexist. */
export const APP_PORTS = [3300, 3399];
export const DB_PORTS = [5500, 5599];

const README = [
  "Career OS : tes données",
  "",
  "documents\\  tes CV, lettres, diplômes, contrats… rangés par type (Career OS y range aussi ce que tu ajoutes).",
  "data\\db\\    ta base (candidatures, entretiens, logements…). Ne supprime pas ce dossier.",
  "data\\app\\   réglages et fichiers de l'application (dont ta clé Claude si tu l'as collée).",
  "backups\\    une sauvegarde complète automatique chaque jour (les 14 dernières).",
  "",
  "Désinstaller Career OS ne supprime pas ce dossier.",
  "Changer d'ordinateur : copie ce dossier CareerOS, installe Career OS sur le nouvel ordinateur,",
  "puis remplace son dossier CareerOS par ta copie (application fermée).",
];

/** @param {string} home */
export const settingsFile = (home) => path.join(home, "data", "app", "settings.env");

/** @param {string} p */
const slash = (p) => p.replace(/\\/g, "/");

/**
 * Settings owned by the install (rewritten at each launch); anything else in the file is kept.
 * @param {{ home: string, appPort: number, dbPort: number }} options
 * @returns {Record<string, string>}
 */
export function homeSettings({ home, appPort, dbPort }) {
  return {
    APP_PORT: String(appPort),
    APP_BIND: "127.0.0.1",
    APP_URL: `http://localhost:${appPort}`,
    CAREER_OS_DB_DIR: slash(path.join(home, "data", "db")),
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
 * Folders and the read-me of a new library; settings are read (or created) and returned, not yet applied.
 * @param {string} home
 * @returns {Promise<{ file: string, values: Record<string, string> }>}
 */
export async function prepareHome(home) {
  for (const f of LIBRARY_FOLDERS) fs.mkdirSync(path.join(home, "documents", f), { recursive: true });
  for (const d of [["data", "db"], ["data", "app"], ["backups"]]) fs.mkdirSync(path.join(home, ...d), { recursive: true });
  const readme = path.join(home, "LISEZ-MOI.txt");
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, `﻿${README.join("\r\n")}\r\n`);

  const file = settingsFile(home);
  const previous = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  const appPort = Number(previous.APP_PORT) || (await findPort(APP_PORTS));
  const dbPort = Number(previous.DB_PORT) || (await findPort(DB_PORTS, [appPort]));
  const values = mergeSettings(previous, homeSettings({ home, appPort, dbPort }));
  fs.writeFileSync(file, serializeEnv(values));
  return { file, values };
}

/**
 * Before starting (the app is not running): moves to free ports if another program took ours meanwhile.
 * @param {string} home
 * @param {Record<string, string>} values
 * @returns {Promise<Record<string, string>>}
 */
export async function ensureFreePorts(home, values) {
  let appPort = Number(values.APP_PORT);
  let dbPort = Number(values.DB_PORT);
  if (!(await portFree(appPort))) appPort = await findPort(APP_PORTS, [dbPort]);
  if (!(await portFree(dbPort))) dbPort = await findPort(DB_PORTS, [appPort]);
  if (appPort === Number(values.APP_PORT) && dbPort === Number(values.DB_PORT)) return values;
  const next = mergeSettings(values, homeSettings({ home, appPort, dbPort }));
  fs.writeFileSync(settingsFile(home), serializeEnv(next));
  return next;
}
