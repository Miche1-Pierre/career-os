"use server";

import { AppError, USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { ContactInput, OpportunityInput } from "@/lib/schemas";
import * as inbox from "@/server/services/inbox";
import { storageConfig } from "@/server/storage";

/** Quick Import: text, URL or file (FormData). */
export async function captureAction(formData: FormData) {
  return runAction(async () => {
    const text = (formData.get("text") as string | null)?.trim() || null;
    const url = (formData.get("url") as string | null)?.trim() || null;
    const analyze = formData.get("analyze") === "true";
    const file = formData.get("file");
    let upload: { buffer: Buffer; fileName: string; mimeType: string | null } | null = null;
    if (file && typeof file !== "string" && (file as File).size > 0) {
      const f = file as File;
      if (f.size > storageConfig.maxUploadBytes) throw new AppError("VALIDATION", "File too large");
      upload = { buffer: Buffer.from(await f.arrayBuffer()), fileName: f.name, mimeType: f.type || null };
    }
    const result = await inbox.createCapture({ text, url, file: upload }, USER, { analyze });
    return { id: result.item.id, status: result.item.status, duplicate: result.duplicate, title: result.item.title };
  });
}

export async function analyzeInboxAction(id: string) {
  return runAction(async () => {
    await inbox.requestAnalysis(id);
    return null;
  });
}

export async function convertInboxToOpportunityAction(id: string, input: OpportunityInput, force = false) {
  return runAction(async () => {
    const r = await inbox.convertToOpportunity(id, input, USER, { force });
    return { created: r.created, id: r.opportunity?.id ?? null, duplicates: r.duplicates };
  });
}

export async function applyInboxActionsAction(id: string, actions: unknown[]) {
  return runAction(() => inbox.applyActions(actions, USER, { inboxId: id }));
}

export async function convertInboxToNoteAction(id: string, target: { opportunityId?: string | null; organizationId?: string | null; contactId?: string | null; title?: string | null }) {
  return runAction(async () => ({ id: (await inbox.convertToNote(id, target, USER)).id }));
}

export async function convertInboxToContactAction(id: string, input: ContactInput) {
  return runAction(async () => ({ id: (await inbox.convertToContact(id, input, USER)).id }));
}

export async function archiveInboxAction(id: string, archived = true) {
  return runAction(async () => {
    await inbox.setInboxArchived(id, archived, USER);
    return null;
  });
}

export async function deleteInboxAction(id: string) {
  return runAction(async () => {
    await inbox.deleteInboxItem(id, USER);
    return null;
  });
}

export async function updateInboxAction(id: string, patch: { title?: string | null; rawText?: string }) {
  return runAction(async () => {
    await inbox.updateInboxItem(id, patch, USER);
    return null;
  });
}
