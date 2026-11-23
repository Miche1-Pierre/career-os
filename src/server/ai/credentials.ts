/**
 * Anthropic API key pasted in the app (Settings → IA, or the welcome wizard), so nobody has to edit `.env`.
 *
 * Stored in `<APP_DATA_DIR>/secrets.json` (owner-only permissions where the OS supports it): outside the database,
 * so it never ends up in exports, automatic backups or share links. The key is never sent back to the browser, only a
 * hint (sk-ant-…abcd). When present, it is used for every Claude call: the in-app chat, web research and analyses
 * (passed to Claude Code as ANTHROPIC_API_KEY), and the direct API provider.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/server/context";
import { storageConfig } from "@/server/storage";

interface SecretsFile {
  anthropicApiKey?: string;
  savedAt?: string;
}

const FILE = "secrets.json";
const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

const cache = globalThis as unknown as { __careerOsSecrets?: { file: string; mtimeMs: number; value: SecretsFile } };

function secretsPath() {
  return path.join(storageConfig.dataDir, FILE);
}

function readSecrets(): SecretsFile {
  const file = secretsPath();
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = cache.__careerOsSecrets;
    if (hit && hit.file === file && hit.mtimeMs === mtimeMs) return hit.value;
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as SecretsFile;
    cache.__careerOsSecrets = { file, mtimeMs, value };
    return value;
  } catch {
    return {};
  }
}

function writeSecrets(value: SecretsFile) {
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows: permissions follow the user profile folder.
  }
  delete cache.__careerOsSecrets;
}

/** Key pasted in the app, if any. */
export function storedAnthropicKey(): string | null {
  const key = readSecrets().anthropicApiKey?.trim();
  return key && KEY_PATTERN.test(key) ? key : null;
}

/** Key used for Claude calls: the one pasted in the app first, then ANTHROPIC_API_KEY from `.env`. */
export function anthropicKey(): string | null {
  return storedAnthropicKey() ?? (process.env.ANTHROPIC_API_KEY?.trim() || null);
}

/**
 * Environment for a Claude Code process. The key pasted in the app wins over the subscription the CLI may be logged
 * in with; a `.env` key is used the same way when the install chose the API (AI_PROVIDER=anthropic).
 */
export function claudeKeyEnv(): Record<string, string | undefined> | undefined {
  const fromEnv = process.env.AI_PROVIDER?.trim() === "anthropic" ? process.env.ANTHROPIC_API_KEY?.trim() || null : null;
  const key = storedAnthropicKey() ?? fromEnv;
  if (!key) return undefined;
  // A CLI already logged in with a subscription ignores ANTHROPIC_API_KEY: run it with its own, empty configuration
  // folder so the key is the only credential it sees.
  return { ANTHROPIC_API_KEY: key, CLAUDE_CODE_OAUTH_TOKEN: undefined, CLAUDE_CONFIG_DIR: claudeApiConfigDir() };
}

/** Configuration folder of the Claude Code runs made with the API key (sessions, caches), next to the app data. */
export function claudeApiConfigDir() {
  const dir = path.join(storageConfig.dataDir, "claude-api");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Read-only data folder: the CLI reports its own error.
  }
  return dir;
}

export function keyHint(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function apiKeyState() {
  const stored = storedAnthropicKey();
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim() || null;
  return {
    source: stored ? ("app" as const) : fromEnv ? ("env" as const) : null,
    hint: keyHint(stored ?? fromEnv),
    savedAt: stored ? (readSecrets().savedAt ?? null) : null,
  };
}

/** Normalizes what people paste (spaces, quotes, "ANTHROPIC_API_KEY=" prefix) and checks the shape. */
export function normalizeApiKey(raw: string): string {
  const key = raw
    .trim()
    .replace(/^ANTHROPIC_API_KEY\s*=\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");
  if (!KEY_PATTERN.test(key)) {
    throw new AppError("VALIDATION", "Ce n'est pas une clé Claude : elle commence par « sk-ant- ». Copie-la depuis console.anthropic.com → API Keys.");
  }
  return key;
}

/** Asks Anthropic whether the key works (listing models is free). */
export async function checkAnthropicKey(key: string, client?: Pick<Anthropic, "models">) {
  const api = client ?? new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15_000 });
  try {
    await api.models.list({ limit: 1 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AppError("VALIDATION", "Anthropic refuse cette clé : vérifie qu'elle est complète et qu'elle n'a pas été désactivée.");
    if (error instanceof Anthropic.PermissionDeniedError) throw new AppError("VALIDATION", "Cette clé n'a pas accès à l'API Claude.");
    if (error instanceof Anthropic.APIConnectionError) throw new AppError("UNAVAILABLE", "Impossible de joindre Anthropic : vérifie ta connexion internet.");
    if (error instanceof Anthropic.APIError) throw new AppError("UNAVAILABLE", `Anthropic a répondu une erreur (${error.status}). Réessaie dans un instant.`);
    throw error;
  }
}

/** Validates then stores the key. Returns its hint. */
export async function saveAnthropicKey(raw: string, options: { check?: (key: string) => Promise<void> } = {}) {
  const key = normalizeApiKey(raw);
  await (options.check ?? checkAnthropicKey)(key);
  writeSecrets({ ...readSecrets(), anthropicApiKey: key, savedAt: new Date().toISOString() });
  return { hint: keyHint(key) };
}

export function removeAnthropicKey() {
  const rest = { ...readSecrets() };
  delete rest.anthropicApiKey;
  delete rest.savedAt;
  writeSecrets(rest);
}

/** Plain-French version of the errors Claude reports when the API key is the problem; other messages pass through. */
export function explainClaudeError(message: string): string {
  if (/invalid (x-)?api[ -]?key|authentication_error|fix external api key/i.test(message)) {
    return "Ta clé Claude ne fonctionne pas (refusée par Anthropic). Remplace-la dans Paramètres → IA.";
  }
  if (/credit balance is too low|insufficient.?credit|billing/i.test(message)) {
    return "Plus de crédit sur le compte Anthropic de cette clé. Ajoute du crédit sur console.anthropic.com, ou colle une autre clé dans Paramètres → IA.";
  }
  if (/rate.?limit|overloaded|\b529\b|\b429\b/i.test(message)) {
    return "Claude est très sollicité en ce moment : réessaie dans une minute.";
  }
  return message;
}
