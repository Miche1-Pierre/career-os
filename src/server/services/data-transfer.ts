import fs from "node:fs/promises";
import path from "node:path";
import { getTableColumns, sql, type Table } from "drizzle-orm";
import { gunzipSync, gzipSync, strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import { APP_NAME, EXPORT_SCHEMA_VERSION, sourceLabel } from "@/lib/constants";
import { AppError, type Ctx } from "@/server/context";
import { listSnapshotKeys, snapshotPath, statSafe, storageConfig } from "@/server/storage";
import { logAudit } from "./audit";
import { invalidateSettingsCache } from "./settings";

/** Insertion order (dependencies first). Deletion uses the reverse order. */
const TABLES: [string, Table][] = [
  ["settings", s.settings],
  ["tags", s.tags],
  ["pipelineStages", s.pipelineStages],
  ["organizations", s.organizations],
  ["contacts", s.contacts],
  ["inboxItems", s.inboxItems],
  ["opportunities", s.opportunities],
  ["opportunityContacts", s.opportunityContacts],
  ["documents", s.documents],
  ["documentVersions", s.documentVersions],
  ["opportunityDocuments", s.opportunityDocuments],
  ["interviews", s.interviews],
  ["tasks", s.tasks],
  ["timelineEvents", s.timelineEvents],
  ["auditLogs", s.auditLogs],
  ["savedViews", s.savedViews],
  ["goals", s.goals],
  ["notifications", s.notifications],
];

export interface ExportFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  data: Record<string, Record<string, unknown>[]>;
}

export async function exportAll(): Promise<ExportFile> {
  const data: ExportFile["data"] = {};
  const counts: Record<string, number> = {};
  for (const [name, table] of TABLES) {
    const rows = (await db.select().from(table as never)) as Record<string, unknown>[];
    data[name] = rows;
    counts[name] = rows.length;
  }
  return { app: "career-os", schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts, data };
}

function reviveRows(table: Table, rows: Record<string, unknown>[]) {
  const columns = getTableColumns(table);
  const timestampKeys = Object.entries(columns)
    .filter(([, col]) => (col as { columnType: string }).columnType === "PgTimestamp")
    .map(([key]) => key);
  const known = new Set(Object.keys(columns));
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!known.has(key)) continue; // ignore fields from future versions
      out[key] = timestampKeys.includes(key) && typeof value === "string" ? new Date(value) : value;
    }
    return out;
  });
}

/** Upgrades older export formats to the current schema version. */
function upgradeExport(file: ExportFile): ExportFile {
  if (file.schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new AppError("VALIDATION", `This export was made by a newer Career OS (schema v${file.schemaVersion}). Update the app first.`);
  }
  // v1 is the first format — future migrations go here (e.g. if (file.schemaVersion === 1) { … file.schemaVersion = 2 }).
  return file;
}

export function parseExport(raw: unknown): ExportFile {
  if (!raw || typeof raw !== "object") throw new AppError("VALIDATION", "Invalid export file");
  const file = raw as ExportFile;
  if (file.app !== "career-os" || typeof file.schemaVersion !== "number" || !file.data || typeof file.data !== "object") {
    throw new AppError("VALIDATION", "Not a Career OS export (missing app/schemaVersion/data)");
  }
  return upgradeExport(file);
}

export async function importAll(raw: unknown, mode: "replace" | "merge", ctx: Ctx) {
  const file = parseExport(raw);
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    if (mode === "replace") {
      for (const [, table] of [...TABLES].reverse()) await tx.delete(table as never);
    }
    for (const [name, table] of TABLES) {
      const rows = reviveRows(table, file.data[name] ?? []);
      counts[name] = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        if (!chunk.length) continue;
        const query = tx.insert(table as never).values(chunk as never);
        const inserted =
          name === "settings"
            ? await query.onConflictDoUpdate({ target: s.settings.key, set: { value: sql`excluded.value` } }).returning()
            : await query.onConflictDoNothing().returning();
        counts[name] += (inserted as unknown[]).length;
      }
    }
  });
  invalidateSettingsCache();
  await logAudit(db, { entityType: "settings", entityId: "00000000-0000-0000-0000-000000000000", action: `IMPORT_${mode.toUpperCase()}`, summary: JSON.stringify(counts) }, ctx);
  return counts;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join("; ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? Object.keys(rows[0]);
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export async function csvFiles(file?: ExportFile): Promise<Record<string, string>> {
  const exp = file ?? (await exportAll());
  const d = exp.data;
  const orgs = new Map(d.organizations.map((o) => [o.id, o]));
  const stages = new Map(d.pipelineStages.map((st) => [st.id, st]));
  const opportunities = d.opportunities.map((o) => {
    const org = orgs.get(o.organizationId as string);
    const stage = stages.get(o.stageId as string);
    const details = (o.details ?? {}) as Record<string, unknown>;
    return {
      id: o.id,
      type: o.type,
      title: o.title,
      organization: org?.name ?? "",
      status: stage?.label ?? "",
      category: stage?.category ?? "",
      priority: o.priority,
      source: sourceLabel(o.source as string),
      city: o.locationCity,
      country: o.locationCountry,
      remote: o.remotePolicy,
      contract: details.contractType,
      salaryMin: details.salaryMin,
      salaryMax: details.salaryMax,
      deadline: o.deadline,
      appliedAt: o.appliedAt,
      firstResponseAt: o.firstResponseAt,
      nextFollowUpAt: o.nextFollowUpAt,
      followUpCount: o.followUpCount,
      closedAt: o.closedAt,
      tags: o.tags,
      url: o.url,
      createdAt: o.createdAt,
      deleted: o.deletedAt ? "yes" : "",
    };
  });
  const contacts = d.contacts.map((c) => ({ ...c, organization: orgs.get(c.organizationId as string)?.name ?? "" }));
  const versions = d.documentVersions.map((v) => {
    const doc = d.documents.find((x) => x.id === v.documentId);
    return { document: doc?.name, kind: doc?.kind, version: v.version, label: v.label, path: v.displayPath, checksum: v.checksum, snapshot: v.snapshotKey, createdAt: v.createdAt };
  });
  return {
    "opportunities.csv": toCsv(opportunities),
    "organizations.csv": toCsv(d.organizations, ["id", "kind", "name", "website", "industry", "size", "city", "country", "tags", "createdAt"]),
    "contacts.csv": toCsv(contacts, ["id", "fullName", "organization", "role", "email", "phone", "linkedinUrl", "relationship", "lastContactAt"]),
    "interviews.csv": toCsv(d.interviews, ["id", "opportunityId", "kind", "title", "scheduledAt", "durationMinutes", "location", "meetingUrl", "status", "outcome"]),
    "tasks.csv": toCsv(d.tasks, ["id", "opportunityId", "title", "kind", "dueDate", "done", "doneAt"]),
    "timeline.csv": toCsv(d.timelineEvents, ["id", "opportunityId", "contactId", "type", "occurredAt", "title", "body", "channel", "direction", "actor"]),
    "document-versions.csv": toCsv(versions),
  };
}

// ---------------------------------------------------------------------------
// ZIP (JSON + CSV + document snapshots)
// ---------------------------------------------------------------------------

export async function exportZip(options: { includeFiles?: boolean } = {}): Promise<Uint8Array> {
  const file = await exportAll();
  const entries: Record<string, Uint8Array> = {
    "career-os-export.json": strToU8(JSON.stringify(file, null, 1)),
    "README.txt": strToU8(
      `${APP_NAME} export — ${file.exportedAt}\n\n` +
        "career-os-export.json : full data (schemaVersion " +
        file.schemaVersion +
        "), restorable from Settings → Data.\n" +
        "csv/ : spreadsheets for Excel / LibreOffice.\n" +
        "snapshots/ : exact copies of every document version (file name = sha256).\n",
    ),
  };
  for (const [name, content] of Object.entries(await csvFiles(file))) entries[`csv/${name}`] = strToU8(content);
  if (options.includeFiles !== false) {
    for (const key of await listSnapshotKeys()) {
      try {
        entries[`snapshots/${key}`] = new Uint8Array(await fs.readFile(snapshotPath(key)));
      } catch {
        /* skip unreadable */
      }
    }
  }
  return zipSync(entries, { level: 6 });
}

export async function importZip(buffer: Uint8Array, mode: "replace" | "merge", ctx: Ctx) {
  const entries = unzipSync(buffer);
  const json = entries["career-os-export.json"];
  if (!json) throw new AppError("VALIDATION", "career-os-export.json not found in the archive");
  let restoredFiles = 0;
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith("snapshots/")) continue;
    const key = name.slice("snapshots/".length);
    try {
      const dest = snapshotPath(key);
      if (!(await statSafe(dest))) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, content);
        restoredFiles++;
      }
    } catch {
      /* invalid key */
    }
  }
  const counts = await importAll(JSON.parse(strFromU8(json)), mode, ctx);
  return { counts, restoredFiles };
}

// ---------------------------------------------------------------------------
// Backups (./backups)
// ---------------------------------------------------------------------------

const BACKUP_RE = /^career-os-(auto|manual|pre-restore)-\d{8}-\d{6}\.json\.gz$/;

function stamp(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export async function createBackup(kind: "auto" | "manual" | "pre-restore" = "manual") {
  const dir = storageConfig.backupsDir;
  await fs.mkdir(dir, { recursive: true });
  const file = await exportAll();
  const name = `career-os-${kind}-${stamp()}.json.gz`;
  await fs.writeFile(path.join(dir, name), gzipSync(strToU8(JSON.stringify(file)), { level: 9 }));
  if (kind === "auto") await pruneBackups(Number(process.env.AUTO_BACKUP_KEEP ?? 14));
  return { name, counts: file.counts };
}

export async function listBackups() {
  const dir = storageConfig.backupsDir;
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!BACKUP_RE.test(name) && !name.endsWith(".dump")) continue;
    const st = await statSafe(path.join(dir, name));
    if (st) out.push({ name, size: st.size, createdAt: st.mtime, kind: name.endsWith(".dump") ? "pg_dump" : name.split("-")[2] });
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function pruneBackups(keep: number) {
  const autos = (await listBackups()).filter((b) => b.kind === "auto");
  for (const b of autos.slice(Math.max(1, keep))) await fs.rm(path.join(storageConfig.backupsDir, b.name), { force: true });
}

export function backupPath(name: string) {
  if (!BACKUP_RE.test(name)) throw new AppError("FORBIDDEN", "Invalid backup name");
  return path.join(storageConfig.backupsDir, name);
}

export async function readBackup(name: string): Promise<ExportFile> {
  const buffer = await fs.readFile(backupPath(name));
  return parseExport(JSON.parse(strFromU8(gunzipSync(new Uint8Array(buffer)))));
}

export async function restoreBackup(name: string, ctx: Ctx) {
  const file = await readBackup(name);
  await createBackup("pre-restore");
  return importAll(file, "replace", ctx);
}

const backupState = globalThis as unknown as { __careerOsLastAutoBackup?: number };

export async function autoBackupIfDue() {
  const hours = Number(process.env.AUTO_BACKUP_HOURS ?? 24);
  if (!hours || hours <= 0) return null;
  const last = backupState.__careerOsLastAutoBackup ?? (await listBackups()).find((b) => b.kind === "auto")?.createdAt.getTime() ?? 0;
  if (Date.now() - last < hours * 3600_000) return null;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.opportunities);
  backupState.__careerOsLastAutoBackup = Date.now();
  if (count === 0) return null;
  return createBackup("auto");
}
