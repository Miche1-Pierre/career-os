"use server";

import { AppError, USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { DocumentInput } from "@/lib/schemas";
import type { DocumentKind } from "@/lib/constants";
import * as docs from "@/server/services/documents";
import { storageConfig } from "@/server/storage";

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!file || typeof file === "string" || (file as File).size === 0) return null;
  const f = file as File;
  if (f.size > storageConfig.maxUploadBytes) throw new AppError("VALIDATION", `File too large (max ${Math.round(storageConfig.maxUploadBytes / 1048576)} MB)`);
  return { buffer: Buffer.from(await f.arrayBuffer()), fileName: f.name, originalPath: (formData.get("originalPath") as string) || null };
}

/** Create a document with its first version: upload (file), library/host path (path) or reference only. */
export async function createDocumentAction(formData: FormData) {
  return runAction(async () => {
    const upload = await readUpload(formData);
    const input = {
      name: String(formData.get("name") || upload?.fileName || "Document").trim(),
      kind: String(formData.get("kind") || "OTHER") as DocumentKind,
      description: (formData.get("description") as string) || null,
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      label: (formData.get("label") as string) || null,
      path: (formData.get("path") as string) || null,
    };
    const doc = await docs.createDocumentWithVersion(input, upload, USER);
    return { id: doc.id };
  });
}

export async function addVersionAction(documentId: string, formData: FormData) {
  return runAction(async () => {
    const upload = await readUpload(formData);
    const label = (formData.get("label") as string) || null;
    const notes = (formData.get("notes") as string) || null;
    const path = (formData.get("path") as string) || null;
    if (upload) return { id: (await docs.addVersionFromUpload(documentId, { ...upload, label, notes }, USER)).id };
    if (path) return { id: (await docs.addVersionFromPath(documentId, { path, label, notes }, USER)).id };
    throw new AppError("VALIDATION", "Choose a file or give a path");
  });
}

export async function updateDocumentAction(id: string, patch: Partial<DocumentInput>) {
  return runAction(async () => ({ id: (await docs.updateDocument(id, patch, USER)).id }));
}

export async function updateVersionAction(id: string, patch: { label?: string | null; notes?: string | null }) {
  return runAction(async () => ({ id: (await docs.updateVersion(id, patch, USER)).id }));
}

export async function deleteVersionAction(id: string) {
  return runAction(async () => {
    await docs.deleteVersion(id, USER);
    return null;
  });
}

export async function archiveDocumentAction(id: string, archived: boolean) {
  return runAction(async () => {
    await docs.setDocumentArchived(id, archived, USER);
    return null;
  });
}

export async function deleteDocumentAction(id: string) {
  return runAction(async () => {
    await docs.softDeleteDocument(id, USER);
    return null;
  });
}

export async function restoreDocumentAction(id: string) {
  return runAction(async () => {
    await docs.restoreDocument(id, USER);
    return null;
  });
}

export async function purgeDocumentAction(id: string) {
  return runAction(async () => {
    await docs.hardDeleteDocument(id, USER);
    return null;
  });
}

export async function scanLibraryAction() {
  return runAction(() => docs.scanLibrary(), { revalidate: false });
}

export async function registerLibraryFilesAction(items: { relativePath: string; name: string; kind: DocumentKind; documentId?: string | null }[]) {
  return runAction(() => docs.registerLibraryFiles(items, USER));
}
