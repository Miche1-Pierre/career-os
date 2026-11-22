import path from "node:path";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  documents,
  documentVersions,
  opportunities,
  opportunityDocuments,
  organizations,
  pipelineStages,
  type DocumentRow,
  type DocumentVersion,
} from "@/server/db/schema";
import { attachDocumentSchema, documentInputSchema, documentPatchSchema, type DocumentInput } from "@/lib/schemas";
import { DOCUMENT_KIND_META, DOCUMENT_KINDS, type DocumentKind } from "@/lib/constants";
import { normalizeText } from "@/lib/text";
import { normalizedContains } from "@/server/db/sql-helpers";
import { AppError, notFound, type Ctx } from "@/server/context";
import {
  displayPathFor,
  listLibraryFiles,
  mimeFor,
  resolveLibraryPath,
  saveUpload,
  sha256File,
  snapshotBuffer,
  snapshotFile,
  snapshotPath,
  statSafe,
  toLibraryRelative,
  uploadPath,
} from "@/server/storage";
import { diffFields, logAudit } from "./audit";
import { canonicalizeTags } from "./tags";
import { addEvent } from "./timeline";
import { completeAutoRule } from "./tasks";

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type FileStatus = "ok" | "modified" | "missing" | "external" | "snapshot_only";

export interface VersionWithStatus extends DocumentVersion {
  fileStatus: FileStatus;
  usageCount: number;
}

export interface DocumentListItem extends DocumentRow {
  versions: VersionWithStatus[];
  latest: VersionWithStatus | null;
  usageCount: number;
}

async function fileStatusOf(version: DocumentVersion): Promise<FileStatus> {
  if (version.storage === "EXTERNAL") return version.snapshotKey ? "snapshot_only" : "external";
  if (!version.relativePath) return version.snapshotKey ? "snapshot_only" : "missing";
  const abs = version.storage === "LIBRARY" ? resolveLibraryPath(version.relativePath) : uploadPath(version.relativePath);
  const st = await statSafe(abs);
  if (!st) return version.snapshotKey ? "snapshot_only" : "missing";
  if (version.sizeBytes != null && st.size !== version.sizeBytes) return "modified";
  if (version.fileModifiedAt && Math.abs(st.mtime.getTime() - version.fileModifiedAt.getTime()) > 2000) {
    // Timestamp changed: confirm with the checksum.
    if (version.checksum && (await sha256File(abs)) !== version.checksum) return "modified";
  }
  return "ok";
}

async function usageCounts(versionIds: string[]) {
  if (!versionIds.length) return new Map<string, number>();
  const rows = await db
    .select({ versionId: opportunityDocuments.documentVersionId, count: sql<number>`count(distinct ${opportunityDocuments.opportunityId})::int` })
    .from(opportunityDocuments)
    .innerJoin(opportunities, eq(opportunities.id, opportunityDocuments.opportunityId))
    .where(and(inArray(opportunityDocuments.documentVersionId, versionIds), isNull(opportunities.deletedAt)))
    .groupBy(opportunityDocuments.documentVersionId);
  return new Map(rows.map((r) => [r.versionId, r.count]));
}

export async function listDocuments(filters: { kind?: DocumentKind; q?: string; includeArchived?: boolean; deleted?: boolean; withStatus?: boolean } = {}) {
  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        filters.deleted ? isNotNull(documents.deletedAt) : isNull(documents.deletedAt),
        filters.includeArchived || filters.deleted ? undefined : isNull(documents.archivedAt),
        filters.kind ? eq(documents.kind, filters.kind) : undefined,
        filters.q ? sql`(${normalizedContains(documents.name, filters.q)} or ${normalizedContains(sql`array_to_string(${documents.tags}, ' ')`, filters.q)})` : undefined,
      ),
    )
    .orderBy(asc(documents.kind), asc(documents.name));
  if (!docs.length) return [] as DocumentListItem[];
  const versions = await db
    .select()
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, docs.map((d) => d.id)))
    .orderBy(desc(documentVersions.version));
  const counts = await usageCounts(versions.map((v) => v.id));
  const docUsage = await db
    .select({ documentId: documentVersions.documentId, count: sql<number>`count(distinct ${opportunityDocuments.opportunityId})::int` })
    .from(opportunityDocuments)
    .innerJoin(documentVersions, eq(documentVersions.id, opportunityDocuments.documentVersionId))
    .innerJoin(opportunities, eq(opportunities.id, opportunityDocuments.opportunityId))
    .where(and(inArray(documentVersions.documentId, docs.map((d) => d.id)), isNull(opportunities.deletedAt)))
    .groupBy(documentVersions.documentId);
  const docUsageMap = new Map(docUsage.map((d) => [d.documentId, d.count]));
  const withStatus = filters.withStatus !== false;
  const enriched: VersionWithStatus[] = await Promise.all(
    versions.map(async (v, index) => ({
      ...v,
      // Only the latest version of each document needs a filesystem check.
      fileStatus: withStatus && versions.findIndex((x) => x.documentId === v.documentId) === index ? await fileStatusOf(v) : v.snapshotKey ? "ok" : "external",
      usageCount: counts.get(v.id) ?? 0,
    })),
  );
  return docs.map((d) => {
    const vs = enriched.filter((v) => v.documentId === d.id);
    return { ...d, versions: vs, latest: vs[0] ?? null, usageCount: docUsageMap.get(d.id) ?? 0 };
  });
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) throw notFound("Document");
  const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.version));
  const counts = await usageCounts(versions.map((v) => v.id));
  const usages = versions.length
    ? await db
        .select({
          linkId: opportunityDocuments.id,
          role: opportunityDocuments.role,
          attachedAt: opportunityDocuments.attachedAt,
          versionId: opportunityDocuments.documentVersionId,
          opportunityId: opportunities.id,
          opportunityTitle: opportunities.title,
          organizationName: organizations.name,
          stageLabel: pipelineStages.label,
          stageCategory: pipelineStages.category,
          appliedAt: opportunities.appliedAt,
        })
        .from(opportunityDocuments)
        .innerJoin(opportunities, eq(opportunities.id, opportunityDocuments.opportunityId))
        .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
        .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
        .where(and(inArray(opportunityDocuments.documentVersionId, versions.map((v) => v.id)), isNull(opportunities.deletedAt)))
        .orderBy(desc(opportunityDocuments.attachedAt))
    : [];
  const withStatus = await Promise.all(versions.map(async (v) => ({ ...v, fileStatus: await fileStatusOf(v), usageCount: counts.get(v.id) ?? 0 })));
  return { document: doc, versions: withStatus, usages };
}

export async function listVersionOptions() {
  const rows = await db
    .select({ version: documentVersions, document: documents })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(isNull(documents.deletedAt), isNull(documents.archivedAt)))
    .orderBy(asc(documents.kind), asc(documents.name), desc(documentVersions.version));
  return rows.map((r) => ({
    versionId: r.version.id,
    documentId: r.document.id,
    documentName: r.document.name,
    kind: r.document.kind,
    version: r.version.version,
    label: r.version.label,
    fileName: r.version.fileName,
    createdAt: r.version.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Documents CRUD
// ---------------------------------------------------------------------------

export async function createDocument(raw: DocumentInput, ctx: Ctx, options: { isDemo?: boolean } = {}) {
  const input = documentInputSchema.parse(raw);
  const [row] = await db
    .insert(documents)
    .values({ ...input, tags: await canonicalizeTags(db, input.tags), isDemo: options.isDemo ?? false })
    .returning();
  await logAudit(db, { entityType: "document", entityId: row.id, action: "CREATE", summary: row.name }, ctx);
  return row;
}

export async function updateDocument(id: string, raw: Partial<DocumentInput>, ctx: Ctx) {
  const patch = documentPatchSchema.parse(raw);
  const [before] = await db.select().from(documents).where(eq(documents.id, id));
  if (!before) throw notFound("Document");
  const values: Partial<typeof documents.$inferInsert> = { ...patch };
  if (patch.tags) values.tags = await canonicalizeTags(db, patch.tags);
  const [row] = await db.update(documents).set(values).where(eq(documents.id, id)).returning();
  const changes = diffFields(before, row, Object.keys(values));
  if (changes.length) await logAudit(db, { entityType: "document", entityId: id, action: "UPDATE", changes }, ctx);
  return row;
}

export async function setDocumentArchived(id: string, archived: boolean, ctx: Ctx) {
  const [row] = await db.update(documents).set({ archivedAt: archived ? new Date() : null }).where(eq(documents.id, id)).returning();
  if (!row) throw notFound("Document");
  await logAudit(db, { entityType: "document", entityId: id, action: archived ? "ARCHIVE" : "UNARCHIVE" }, ctx);
  return row;
}

export async function softDeleteDocument(id: string, ctx: Ctx) {
  const [row] = await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id)).returning();
  if (!row) throw notFound("Document");
  await logAudit(db, { entityType: "document", entityId: id, action: "DELETE", summary: row.name }, ctx);
  return row;
}

export async function restoreDocument(id: string, ctx: Ctx) {
  const [row] = await db.update(documents).set({ deletedAt: null }).where(eq(documents.id, id)).returning();
  if (!row) throw notFound("Document");
  await logAudit(db, { entityType: "document", entityId: id, action: "RESTORE", summary: row.name }, ctx);
  return row;
}

/** Permanent deletion is refused while a version is referenced by an application (history protection). */
export async function hardDeleteDocument(id: string, ctx: Ctx) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunityDocuments)
    .innerJoin(documentVersions, eq(documentVersions.id, opportunityDocuments.documentVersionId))
    .where(eq(documentVersions.documentId, id));
  if (count > 0) throw new AppError("CONFLICT", `This document was used in ${count} application(s); it is kept to preserve history.`);
  await db.delete(documents).where(eq(documents.id, id));
  await logAudit(db, { entityType: "document", entityId: id, action: "PURGE" }, ctx);
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

async function nextVersionNumber(documentId: string) {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${documentVersions.version}), 0)::int` })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId));
  return (max ?? 0) + 1;
}

async function assertDocument(documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw notFound("Document");
  return doc;
}

/** Registers a library file (relative path or host path inside the library) as a new version, with a snapshot. */
export async function addVersionFromPath(
  documentId: string,
  input: { path: string; label?: string | null; notes?: string | null },
  ctx: Ctx,
  options: { isDemo?: boolean } = {},
) {
  await assertDocument(documentId);
  const relative = toLibraryRelative(input.path);
  if (!relative) return addExternalVersion(documentId, input, ctx, options);
  const abs = resolveLibraryPath(relative);
  const st = await statSafe(abs);
  if (!st) throw new AppError("NOT_FOUND", `File not found in the documents library: ${relative}`);
  const checksum = await sha256File(abs);
  const [latest] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  if (latest?.checksum === checksum && latest.relativePath === relative) {
    throw new AppError("CONFLICT", `This file is identical to v${latest.version}. Modify it before creating a new version.`);
  }
  const snapshotKey = await snapshotFile(abs, checksum);
  const [row] = await db
    .insert(documentVersions)
    .values({
      documentId,
      version: await nextVersionNumber(documentId),
      label: input.label ?? null,
      notes: input.notes ?? null,
      storage: "LIBRARY",
      relativePath: relative,
      displayPath: displayPathFor(relative),
      fileName: path.posix.basename(relative),
      mimeType: mimeFor(relative),
      sizeBytes: st.size,
      checksum,
      snapshotKey,
      fileModifiedAt: st.mtime,
      isDemo: options.isDemo ?? false,
    })
    .returning();
  await db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));
  await logAudit(db, { entityType: "document", entityId: documentId, action: "NEW_VERSION", summary: `v${row.version} — ${relative}` }, ctx);
  return row;
}

/** A reference to a file the app cannot read (outside the library): kept as a path only. */
export async function addExternalVersion(documentId: string, input: { path: string; label?: string | null; notes?: string | null }, ctx: Ctx, options: { isDemo?: boolean } = {}) {
  await assertDocument(documentId);
  const displayPath = input.path.trim().replace(/^["']|["']$/g, "");
  const [row] = await db
    .insert(documentVersions)
    .values({
      documentId,
      version: await nextVersionNumber(documentId),
      label: input.label ?? null,
      notes: input.notes ?? null,
      storage: "EXTERNAL",
      displayPath,
      fileName: displayPath.split(/[\\/]/).pop() ?? displayPath,
      mimeType: mimeFor(displayPath),
      isDemo: options.isDemo ?? false,
    })
    .returning();
  await logAudit(db, { entityType: "document", entityId: documentId, action: "NEW_VERSION", summary: `v${row.version} — external path` }, ctx);
  return row;
}

export async function addVersionFromUpload(
  documentId: string,
  input: { buffer: Buffer; fileName: string; label?: string | null; notes?: string | null; originalPath?: string | null },
  ctx: Ctx,
) {
  const doc = await assertDocument(documentId);
  const saved = await saveUpload(input.buffer, input.fileName, DOCUMENT_KIND_META[doc.kind].folder);
  const { key, checksum } = await snapshotBuffer(input.buffer, input.fileName);
  const st = await statSafe(saved.absolutePath);
  const [row] = await db
    .insert(documentVersions)
    .values({
      documentId,
      version: await nextVersionNumber(documentId),
      label: input.label ?? null,
      notes: input.notes ?? (input.originalPath ? `Original path: ${input.originalPath}` : null),
      storage: saved.storage,
      relativePath: saved.relativePath,
      displayPath: saved.storage === "LIBRARY" ? displayPathFor(saved.relativePath) : (input.originalPath ?? saved.relativePath),
      fileName: path.posix.basename(saved.relativePath),
      mimeType: mimeFor(saved.relativePath),
      sizeBytes: input.buffer.byteLength,
      checksum,
      snapshotKey: key,
      fileModifiedAt: st?.mtime ?? new Date(),
    })
    .returning();
  await db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));
  await logAudit(db, { entityType: "document", entityId: documentId, action: "NEW_VERSION", summary: `v${row.version} — upload ${row.fileName}` }, ctx);
  return row;
}

export async function updateVersion(id: string, patch: { label?: string | null; notes?: string | null }, ctx: Ctx) {
  const [row] = await db.update(documentVersions).set(patch).where(eq(documentVersions.id, id)).returning();
  if (!row) throw notFound("Version");
  await logAudit(db, { entityType: "document", entityId: row.documentId, action: "EDIT_VERSION", summary: `v${row.version}` }, ctx);
  return row;
}

export async function deleteVersion(id: string, ctx: Ctx) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunityDocuments)
    .where(eq(opportunityDocuments.documentVersionId, id));
  if (count > 0) throw new AppError("CONFLICT", `This version was used in ${count} application(s) and is kept to preserve history.`);
  const [row] = await db.delete(documentVersions).where(eq(documentVersions.id, id)).returning();
  if (!row) throw notFound("Version");
  await logAudit(db, { entityType: "document", entityId: row.documentId, action: "DELETE_VERSION", summary: `v${row.version}` }, ctx);
}

/** Creates a document and its first version in one step. */
export async function createDocumentWithVersion(
  input: DocumentInput & { path?: string | null; label?: string | null },
  upload: { buffer: Buffer; fileName: string; originalPath?: string | null } | null,
  ctx: Ctx,
) {
  const doc = await createDocument(input, ctx);
  try {
    if (upload) await addVersionFromUpload(doc.id, { ...upload, label: input.label }, ctx);
    else if (input.path) await addVersionFromPath(doc.id, { path: input.path, label: input.label }, ctx);
  } catch (error) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    throw error;
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Attach to opportunities
// ---------------------------------------------------------------------------

export async function attachDocument(raw: { opportunityId: string; documentVersionId: string; role: DocumentKind; notes?: string | null }, ctx: Ctx) {
  const input = attachDocumentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({ version: documentVersions, document: documents })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(eq(documentVersions.id, input.documentVersionId));
    if (!version) throw notFound("Document version");
    const [opp] = await tx.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, input.opportunityId));
    if (!opp) throw notFound("Opportunity");
    const [link] = await tx
      .insert(opportunityDocuments)
      .values({ opportunityId: input.opportunityId, documentVersionId: input.documentVersionId, role: input.role, notes: input.notes ?? null })
      .onConflictDoNothing()
      .returning();
    const label = `${DOCUMENT_KIND_META[input.role].label}: ${version.document.name} v${version.version.version}`;
    if (link) {
      await addEvent(
        tx,
        { opportunityId: input.opportunityId, type: "DOCUMENT_ATTACHED", title: label, metadata: { documentVersionId: input.documentVersionId, role: input.role } },
        ctx,
      );
      await completeAutoRule(tx, input.opportunityId, `doc:${input.role}`);
      await logAudit(tx, { entityType: "opportunity", entityId: input.opportunityId, action: "ATTACH_DOCUMENT", summary: label }, ctx);
    }
    return link ?? null;
  });
}

export async function detachDocument(linkId: string, ctx: Ctx) {
  const [row] = await db.delete(opportunityDocuments).where(eq(opportunityDocuments.id, linkId)).returning();
  if (!row) throw notFound("Attachment");
  await logAudit(db, { entityType: "opportunity", entityId: row.opportunityId, action: "DETACH_DOCUMENT", summary: row.documentVersionId }, ctx);
  return row;
}

// ---------------------------------------------------------------------------
// Library scan
// ---------------------------------------------------------------------------

export function guessKindFromPath(relativePath: string): DocumentKind {
  const p = normalizeText(relativePath);
  const rules: [DocumentKind, RegExp][] = [
    ["COVER_LETTER", /(cover|lettre|motivation|letter)/],
    ["CV", /(^|\/|[^a-z])(cv|resume|curriculum)([^a-z]|$)/],
    ["TRANSCRIPT", /(transcript|releve|bulletin|notes)/],
    ["DIPLOMA", /(diplom|degree)/],
    ["RECOMMENDATION", /(recommand|recommend|reference)/],
    ["LANGUAGE_CERT", /(toefl|ielts|toeic|cambridge|langue|language)/],
    ["PORTFOLIO", /portfolio/],
    ["CERTIFICATE", /(certif|attestation)/],
    ["PRESENTATION", /(presentation|slides|pitch|deck)/],
    ["ID_DOCUMENT", /(passport|passeport|identite|identity)/],
  ];
  for (const [kind, re] of rules) if (re.test(p)) return kind;
  return "OTHER";
}

export function suggestedNameFromPath(relativePath: string): string {
  return path.posix
    .basename(relativePath, path.posix.extname(relativePath))
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scanLibrary() {
  const files = await listLibraryFiles();
  const versions = await db
    .select({ version: documentVersions, document: documents })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(documentVersions.storage, "LIBRARY"), isNull(documents.deletedAt)));
  const byPath = new Map<string, (typeof versions)[number][]>();
  for (const v of versions) {
    if (!v.version.relativePath) continue;
    const list = byPath.get(v.version.relativePath) ?? [];
    list.push(v);
    byPath.set(v.version.relativePath, list);
  }
  const newFiles: { relativePath: string; displayPath: string; size: number; modifiedAt: Date; suggestedKind: DocumentKind; suggestedName: string }[] = [];
  const modified: { documentId: string; documentName: string; version: number; relativePath: string; displayPath: string; modifiedAt: Date }[] = [];
  for (const file of files) {
    const known = byPath.get(file.relativePath);
    if (!known) {
      newFiles.push({
        relativePath: file.relativePath,
        displayPath: displayPathFor(file.relativePath),
        size: file.size,
        modifiedAt: file.modifiedAt,
        suggestedKind: guessKindFromPath(file.relativePath),
        suggestedName: suggestedNameFromPath(file.relativePath),
      });
      continue;
    }
    const latest = known.sort((a, b) => b.version.version - a.version.version)[0];
    const latestOfDoc = versions.filter((v) => v.document.id === latest.document.id).sort((a, b) => b.version.version - a.version.version)[0];
    if (latestOfDoc.version.id !== latest.version.id) continue; // an older version points here; the doc moved on.
    const sizeChanged = latest.version.sizeBytes != null && latest.version.sizeBytes !== file.size;
    const timeChanged = latest.version.fileModifiedAt && Math.abs(latest.version.fileModifiedAt.getTime() - file.modifiedAt.getTime()) > 2000;
    if (sizeChanged || timeChanged) {
      const checksum = await sha256File(resolveLibraryPath(file.relativePath));
      if (checksum !== latest.version.checksum) {
        modified.push({
          documentId: latest.document.id,
          documentName: latest.document.name,
          version: latest.version.version,
          relativePath: file.relativePath,
          displayPath: displayPathFor(file.relativePath),
          modifiedAt: file.modifiedAt,
        });
      }
    }
  }
  const present = new Set(files.map((f) => f.relativePath));
  const missing = [...byPath.entries()]
    .filter(([p]) => !present.has(p))
    .map(([p, list]) => {
      const v = list.sort((a, b) => b.version.version - a.version.version)[0];
      return { documentId: v.document.id, documentName: v.document.name, version: v.version.version, relativePath: p, hasSnapshot: !!v.version.snapshotKey };
    });
  return { newFiles, modified, missing, totalFiles: files.length };
}

export async function registerLibraryFiles(items: { relativePath: string; name: string; kind: DocumentKind; documentId?: string | null; tags?: string[] }[], ctx: Ctx) {
  const results: { relativePath: string; documentId: string; version: number }[] = [];
  for (const item of items) {
    if (!(DOCUMENT_KINDS as readonly string[]).includes(item.kind)) throw new AppError("VALIDATION", `Invalid kind ${item.kind}`);
    const documentId = item.documentId ?? (await createDocument({ name: item.name, kind: item.kind, tags: item.tags }, ctx)).id;
    const version = await addVersionFromPath(documentId, { path: item.relativePath }, ctx);
    results.push({ relativePath: item.relativePath, documentId, version: version.version });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

/** Absolute path to serve for a version: the snapshot (what was actually registered/sent) or the current file. */
export async function resolveVersionFile(versionId: string, source: "snapshot" | "current" = "snapshot") {
  const [version] = await db.select().from(documentVersions).where(eq(documentVersions.id, versionId));
  if (!version) throw notFound("Version");
  const fileName = version.fileName ?? "document";
  const candidates: string[] = [];
  const current =
    version.relativePath && version.storage === "LIBRARY"
      ? resolveLibraryPath(version.relativePath)
      : version.relativePath && version.storage === "UPLOAD"
        ? uploadPath(version.relativePath)
        : null;
  const snapshot = version.snapshotKey ? snapshotPath(version.snapshotKey) : null;
  if (source === "snapshot") candidates.push(...[snapshot, current].filter((p): p is string => !!p));
  else candidates.push(...[current, snapshot].filter((p): p is string => !!p));
  for (const candidate of candidates) {
    const st = await statSafe(candidate);
    if (st) return { path: candidate, fileName, size: st.size, version };
  }
  throw new AppError("NOT_FOUND", version.storage === "EXTERNAL" ? "This version is an external path that Career OS cannot read." : "File not found");
}
