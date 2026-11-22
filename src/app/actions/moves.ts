"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { BudgetPlan, ListingInput, ListingPatch, ListingStatus, MoveInput } from "@/lib/relocation";
import * as mv from "@/server/services/moves";

export async function createMoveAction(input: MoveInput) {
  return runAction(async () => ({ id: (await mv.createMove(input, USER)).id }));
}

export async function createMoveFromOpportunityAction(opportunityId: string) {
  return runAction(async () => ({ id: (await mv.createMoveFromOpportunity(opportunityId, USER)).id }));
}

export async function updateMoveAction(id: string, patch: Partial<MoveInput>) {
  return runAction(async () => ({ id: (await mv.updateMove(id, patch, USER)).id }));
}

export async function updateBudgetAction(id: string, plan: Partial<BudgetPlan>) {
  return runAction(async () => ({ id: (await mv.updateBudget(id, plan, USER)).id }));
}

export async function archiveMoveAction(id: string, archived: boolean) {
  return runAction(async () => {
    await mv.archiveMove(id, archived, USER);
    return null;
  });
}

export async function deleteMoveAction(id: string) {
  return runAction(async () => {
    await mv.deleteMove(id, USER);
    return null;
  });
}

export async function createListingAction(input: ListingInput) {
  return runAction(async () => {
    const r = await mv.upsertListing(input, USER);
    return { id: r.listing.id, created: r.created };
  });
}

export async function updateListingAction(id: string, patch: ListingPatch) {
  return runAction(async () => ({ id: (await mv.updateListing(id, patch, USER)).id }));
}

export async function setListingStatusAction(id: string, status: ListingStatus, reason?: string | null) {
  return runAction(async () => ({ id: (await mv.setListingStatus(id, status, USER, reason)).id }));
}

export async function addListingNoteAction(id: string, text: string) {
  return runAction(async () => ({ id: (await mv.addListingNote(id, text, USER)).id }));
}

export async function deleteListingAction(id: string) {
  return runAction(async () => {
    await mv.deleteListing(id, USER);
    return null;
  });
}

export async function draftListingMessageAction(id: string, language: "fr" | "en") {
  return runAction(() => mv.draftListingMessage(id, language), { revalidate: false });
}
