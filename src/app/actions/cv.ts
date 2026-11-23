"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import * as cv from "@/server/services/cv";
import type { CvLang } from "@/lib/cv";

export async function createEntryAction(input: Record<string, unknown>) {
  return runAction(async () => cv.createEntry(input, USER));
}

export async function updateEntryAction(id: string, patch: Record<string, unknown>) {
  return runAction(async () => cv.updateEntry(id, patch, USER));
}

export async function deleteEntryAction(id: string) {
  return runAction(async () => cv.deleteEntry(id, USER));
}

export async function createVariantAction(input: Record<string, unknown>) {
  return runAction(async () => ({ id: (await cv.createVariant(input, USER)).id }));
}

export async function updateVariantAction(id: string, patch: Record<string, unknown>) {
  return runAction(async () => {
    await cv.updateVariant(id, patch, USER);
    return null;
  });
}

export async function duplicateVariantAction(id: string) {
  return runAction(async () => ({ id: (await cv.duplicateVariant(id, USER)).id }));
}

export async function deleteVariantAction(id: string) {
  return runAction(async () => cv.deleteVariant(id, USER));
}

export async function exportVariantAction(id: string, opportunityId?: string | null) {
  return runAction(async () => cv.exportVariant(id, USER, { opportunityId }));
}

export async function translateVariantAction(id: string, target: CvLang) {
  return runAction(async () => ({ id: (await cv.translateVariant(id, target, USER)).id }));
}

export async function adaptSummaryAction(id: string, opportunityId: string) {
  return runAction(async () => cv.adaptSummary(id, opportunityId), { revalidate: false });
}
