import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "./context";

/**
 * File storage layout
 *  - DOCUMENTS_ROOT: the user's documents library (bind-mounted host folder). Career OS never overwrites or deletes
 *    files there; uploads create new files with unique names.
 *  - APP_DATA_DIR/snapshots: content-addressed copies (sha256) of every registered document version.
 *  - APP_DATA_DIR/uploads: uploads when the library is not writable.
 *  - BACKUPS_DIR: automatic and manual backups.
 */
export const storageConfig = {
  get documentsRoot() {
    return path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENTS_ROOT || "./documents");
  },
  get documentsHostRoot() {
    return process.env.DOCUMENTS_HOST_PATH || process.env.DOCUMENTS_DIR || path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENTS_ROOT || "./documents");
  },
  get dataDir() {
    return path.resolve(/*turbopackIgnore: true*/ process.env.APP_DATA_DIR || "./data");
  },
  get backupsDir() {
    return path.resolve(/*turbopackIgnore: true*/ process.env.BACKUPS_DIR || "./backups");
  },
  get maxUploadBytes() {
    return (Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024;
  },
};

export const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".csv", ".key", ".pages", ".eml",
]);

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".rtf": "application/rtf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".csv": "text/csv; charset=utf-8",
  ".eml": "message/rfc822",
};

/** Types that are safe to display inline in the browser. Everything else is served as an attachment. */
const INLINE_SAFE = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md", ".csv"]);

export function mimeFor(fileName: string): string {
  return MIME[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

export function isInlineSafe(fileName: string): boolean {
  return INLINE_SAFE.has(path.extname(fileName).toLowerCase());
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const cleaned = base
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "document";
}

function isWindowsPath(p: string) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/** Host-facing display path of a file of the library. */
export function displayPathFor(relativePath: string): string {
  const root = storageConfig.documentsHostRoot.replace(/[\\/]+$/, "");
  if (isWindowsPath(root)) return `${root.replace(/\//g, "\\")}\\${relativePath.replace(/\//g, "\\")}`;
  return `${root}/${relativePath.replace(/\\/g, "/")}`;
}

/**
 * Accepts a relative library path, a host path inside the library (C:\Candidature\documents\CV\a.pdf)
 * or a container path (/data/documents/CV/a.pdf). Returns the normalized relative path, or null if outside.
 */
export function toLibraryRelative(input: string): string | null {
  const raw = input.trim().replace(/^["']|["']$/g, "");
  if (!raw) return null;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const candidate = norm(raw);
  const roots = [norm(storageConfig.documentsHostRoot), norm(storageConfig.documentsRoot)];
  for (const root of roots) {
    if (!root) continue;
    const insensitive = isWindowsPath(root);
    const c = insensitive ? candidate.toLowerCase() : candidate;
    const r = insensitive ? root.toLowerCase() : root;
    if (c === r) return null;
    if (c.startsWith(`${r}/`)) return safeRelative(candidate.slice(root.length + 1));
  }
  if (isWindowsPath(raw) || raw.startsWith("/")) return null;
  return safeRelative(candidate);
}

function safeRelative(rel: string): string | null {
  const normalized = path.posix.normalize(rel.replace(/\\/g, "/"));
  if (normalized.startsWith("..") || path.posix.isAbsolute(normalized) || normalized.includes("\0")) return null;
  return normalized;
}

/** Absolute path of a library file, refusing anything outside the library root. */
export function resolveLibraryPath(relativePath: string): string {
  const safe = safeRelative(relativePath);
  if (!safe) throw new AppError("FORBIDDEN", "Path outside of the documents library");
  const root = storageConfig.documentsRoot;
  const abs = path.resolve(root, safe);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new AppError("FORBIDDEN", "Path outside of the documents library");
  return abs;
}

export async function statSafe(abs: string) {
  try {
    const st = await fs.stat(abs);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

export async function sha256File(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(abs)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export function sha256Buffer(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function snapshotAbs(key: string) {
  const sha = key.slice(0, 64);
  return path.join(storageConfig.dataDir, "snapshots", sha.slice(0, 2), key);
}

/** Copies a file into the content-addressed snapshot store. Returns the snapshot key (<sha256><ext>). */
export async function snapshotFile(abs: string, checksum?: string): Promise<string> {
  const sha = checksum ?? (await sha256File(abs));
  const key = `${sha}${path.extname(abs).toLowerCase()}`;
  const dest = snapshotAbs(key);
  if (!(await statSafe(dest))) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(abs, dest);
  }
  return key;
}

export async function snapshotBuffer(buffer: Buffer, fileName: string): Promise<{ key: string; checksum: string }> {
  const checksum = sha256Buffer(buffer);
  const key = `${checksum}${path.extname(fileName).toLowerCase()}`;
  const dest = snapshotAbs(key);
  if (!(await statSafe(dest))) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
  }
  return { key, checksum };
}

export function snapshotPath(key: string): string {
  if (!/^[a-f0-9]{64}(\.[a-z0-9]{1,8})?$/.test(key)) throw new AppError("FORBIDDEN", "Invalid snapshot key");
  return snapshotAbs(key);
}

export async function listSnapshotKeys(): Promise<string[]> {
  const root = path.join(storageConfig.dataDir, "snapshots");
  const keys: string[] = [];
  try {
    for (const dir of await fs.readdir(root)) {
      for (const file of await fs.readdir(path.join(root, dir))) keys.push(file);
    }
  } catch {
    // no snapshots yet
  }
  return keys;
}

async function uniqueDestination(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let i = 1; i < 1000 && (await statSafe(candidate)); i++) candidate = path.join(dir, `${stem} (${i})${ext}`);
  return candidate;
}

export async function isLibraryWritable(): Promise<boolean> {
  try {
    await fs.mkdir(storageConfig.documentsRoot, { recursive: true });
    await fs.access(storageConfig.documentsRoot, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function libraryStatus() {
  const root = storageConfig.documentsRoot;
  let exists = false;
  try {
    exists = (await fs.stat(root)).isDirectory();
  } catch {
    exists = false;
  }
  return { root, hostRoot: storageConfig.documentsHostRoot, exists, writable: exists && (await isLibraryWritable()) };
}

/** Saves an upload into the library (folder by document kind) or, if read-only, into app uploads. */
export async function saveUpload(buffer: Buffer, originalName: string, folder: string): Promise<{ storage: "LIBRARY" | "UPLOAD"; relativePath: string; absolutePath: string }> {
  const fileName = sanitizeFileName(originalName);
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new AppError("VALIDATION", `File type ${ext || "(none)"} is not allowed`);
  if (buffer.byteLength > storageConfig.maxUploadBytes) throw new AppError("VALIDATION", `File too large (max ${Math.round(storageConfig.maxUploadBytes / 1024 / 1024)} MB)`);
  const safeFolder = sanitizeFileName(folder || "Other");
  if (await isLibraryWritable()) {
    const dir = path.join(/*turbopackIgnore: true*/ storageConfig.documentsRoot, safeFolder);
    await fs.mkdir(dir, { recursive: true });
    const dest = await uniqueDestination(dir, fileName);
    await fs.writeFile(dest, buffer, { flag: "wx" });
    return { storage: "LIBRARY", relativePath: path.relative(storageConfig.documentsRoot, dest).split(path.sep).join("/"), absolutePath: dest };
  }
  const dir = path.join(storageConfig.dataDir, "uploads", safeFolder);
  await fs.mkdir(dir, { recursive: true });
  const dest = await uniqueDestination(dir, fileName);
  await fs.writeFile(dest, buffer, { flag: "wx" });
  return { storage: "UPLOAD", relativePath: path.relative(path.join(storageConfig.dataDir, "uploads"), dest).split(path.sep).join("/"), absolutePath: dest };
}

export function uploadPath(relativePath: string): string {
  const root = path.join(storageConfig.dataDir, "uploads");
  const safe = safeRelative(relativePath);
  if (!safe) throw new AppError("FORBIDDEN", "Invalid upload path");
  const abs = path.resolve(root, safe);
  if (path.relative(root, abs).startsWith("..")) throw new AppError("FORBIDDEN", "Invalid upload path");
  return abs;
}

export interface LibraryFile {
  relativePath: string;
  size: number;
  modifiedAt: Date;
}

/** Recursive listing of the documents library (bounded). */
export async function listLibraryFiles(options: { maxFiles?: number; maxDepth?: number } = {}): Promise<LibraryFile[]> {
  const maxFiles = options.maxFiles ?? 5000;
  const maxDepth = options.maxDepth ?? 8;
  const root = storageConfig.documentsRoot;
  const out: LibraryFile[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name.startsWith("~$")) continue;
      if (depth === 0 && /^readme\.(md|txt)$/i.test(entry.name)) continue; // the folder's own help file
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs, depth + 1);
      else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const st = await statSafe(abs);
        if (st) out.push({ relativePath: path.relative(root, abs).split(path.sep).join("/"), size: st.size, modifiedAt: st.mtime });
      }
    }
  }
  await walk(root, 0);
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
