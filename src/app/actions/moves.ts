"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { BudgetPlan, ListingInput, ListingPatch, ListingStatus, MoveInput, PlaceInput } from "@/lib/relocation";
import * as shares from "@/server/services/shares";
import type { ShareInput } from "@/server/services/shares";
import * as mv from "@/server/services/moves";
import * as proc from "@/server/services/procedures";

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

// Administrative procedures (P3)

export async function addTemplateProceduresAction(moveId: string, templateKeys?: string[]) {
  return runAction(async () => proc.addProceduresFromTemplates(moveId, templateKeys ?? null, USER));
}

export async function researchProceduresAction(moveId: string) {
  return runAction(async () => proc.researchProcedures(moveId, USER));
}

export async function addProcedureAction(moveId: string, input: Record<string, unknown>) {
  return runAction(async () => proc.addProcedures(moveId, [input], USER, "USER"));
}

export async function updateProcedureAction(id: string, patch: Record<string, unknown>) {
  return runAction(async () => {
    await proc.updateProcedure(id, patch, USER);
    return null;
  });
}

export async function deleteProcedureAction(id: string) {
  return runAction(async () => proc.deleteProcedure(id, USER));
}

export async function addStepAction(procedureId: string, input: Record<string, unknown>) {
  return runAction(async () => {
    await proc.addStep(procedureId, input);
    return null;
  });
}

export async function updateStepAction(stepId: string, patch: Record<string, unknown>) {
  return runAction(async () => {
    await proc.updateStep(stepId, patch);
    return null;
  });
}

export async function deleteStepAction(stepId: string) {
  return runAction(async () => proc.deleteStep(stepId));
}

export async function addPlaceAction(moveId: string, input: PlaceInput) {
  return runAction(() => mv.addPlace(moveId, input, USER));
}

export async function removePlaceAction(moveId: string, placeId: string) {
  return runAction(() => mv.removePlace(moveId, placeId, USER));
}

export async function listSharesAction(moveId: string) {
  return runAction(() => shares.listShares(moveId));
}

export async function createShareAction(moveId: string, input: ShareInput) {
  return runAction(() => shares.createShare(moveId, input, USER));
}

export async function revokeShareAction(id: string) {
  return runAction(async () => {
    await shares.revokeShare(id, USER);
    return null;
  });
}
