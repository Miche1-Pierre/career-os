"use server";

import { USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { FollowUpAction, InterviewInput, OpportunityContactRef, OpportunityInput, OpportunityPatch, TaskInput, TimelineEventInput } from "@/lib/schemas";
import type { DocumentKind } from "@/lib/constants";
import * as opp from "@/server/services/opportunities";
import { applyFollowUpAction } from "@/server/services/followups";
import { deleteEvent, logCommunication, updateEvent } from "@/server/services/timeline";
import { createInterview, deleteInterview, updateInterview } from "@/server/services/interviews";
import { createTask, deleteTask, reorderTasks, updateTask } from "@/server/services/tasks";
import { addContactToOpportunity, unlinkContactFromOpportunity } from "@/server/services/contacts";
import { attachDocument, detachDocument } from "@/server/services/documents";
import { analyzeOpportunity, clearAnalysis, interpretCommand } from "@/server/services/analysis";
import { applyActions } from "@/server/services/inbox";

export async function createOpportunityAction(input: OpportunityInput, force = false) {
  return runAction(async () => {
    const r = await opp.createOpportunity(input, USER, { force });
    return { created: r.created, id: r.opportunity?.id ?? null, duplicates: r.duplicates };
  });
}

export async function updateOpportunityAction(id: string, patch: OpportunityPatch) {
  return runAction(async () => {
    const row = await opp.updateOpportunity(id, patch, USER);
    return { id: row.id };
  });
}

export async function changeStatusAction(id: string, status: string, date?: string | null, note?: string | null) {
  return runAction(async () => {
    const r = await opp.changeStatus(id, { status, date: date ?? null, note: note ?? null }, USER);
    return { changed: r.changed, from: r.from.label, to: r.to.label, nextFollowUpAt: r.opportunity.nextFollowUpAt };
  });
}

export async function followUpAction(id: string, action: FollowUpAction) {
  return runAction(async () => {
    const row = await applyFollowUpAction(id, action, USER);
    return { nextFollowUpAt: row.nextFollowUpAt, followUpCount: row.followUpCount };
  });
}

export async function setOpportunityArchivedAction(id: string, archived: boolean) {
  return runAction(async () => {
    await opp.setOpportunityArchived(id, archived, USER);
    return null;
  });
}

export async function deleteOpportunityAction(id: string) {
  return runAction(async () => {
    await opp.softDeleteOpportunity(id, USER);
    return null;
  });
}

export async function restoreOpportunityAction(id: string) {
  return runAction(async () => {
    await opp.restoreOpportunity(id, USER);
    return null;
  });
}

export async function purgeOpportunityAction(id: string) {
  return runAction(async () => {
    await opp.hardDeleteOpportunity(id, USER);
    return null;
  });
}

export async function duplicateOpportunityAction(id: string) {
  return runAction(async () => ({ id: (await opp.duplicateOpportunity(id, USER)).id }));
}

export async function checkDuplicatesAction(query: { title?: string | null; organizationName?: string | null; organizationId?: string | null; url?: string | null; excludeId?: string }) {
  return runAction(() => opp.findDuplicates(query, { excludeId: query.excludeId }), { revalidate: false });
}

export async function logEventAction(input: TimelineEventInput) {
  return runAction(async () => ({ id: (await logCommunication(input, USER)).id }));
}

export async function updateEventAction(id: string, patch: { title?: string; body?: string | null; occurredAt?: string | null }) {
  return runAction(async () => ({ id: (await updateEvent(id, patch, USER)).id }));
}

export async function deleteEventAction(id: string) {
  return runAction(async () => {
    await deleteEvent(id, USER);
    return null;
  });
}

export async function createInterviewAction(input: InterviewInput) {
  return runAction(async () => ({ id: (await createInterview(input, USER)).id }));
}

export async function updateInterviewAction(id: string, patch: Partial<Omit<InterviewInput, "opportunityId">>) {
  return runAction(async () => ({ id: (await updateInterview(id, patch, USER)).id }));
}

export async function deleteInterviewAction(id: string) {
  return runAction(async () => {
    await deleteInterview(id, USER);
    return null;
  });
}

export async function createTaskAction(input: TaskInput) {
  return runAction(async () => ({ id: (await createTask(input, USER)).id }));
}

export async function updateTaskAction(id: string, patch: Partial<TaskInput>) {
  return runAction(async () => ({ id: (await updateTask(id, patch, USER)).id }));
}

export async function deleteTaskAction(id: string) {
  return runAction(async () => {
    await deleteTask(id, USER);
    return null;
  });
}

export async function reorderTasksAction(opportunityId: string, ids: string[]) {
  return runAction(async () => {
    await reorderTasks(opportunityId, ids);
    return null;
  });
}

export async function addContactAction(opportunityId: string, ref: OpportunityContactRef) {
  return runAction(async () => ({ id: (await addContactToOpportunity(opportunityId, ref, USER)).id }));
}

export async function unlinkContactAction(opportunityId: string, contactId: string) {
  return runAction(async () => {
    await unlinkContactFromOpportunity(opportunityId, contactId, USER);
    return null;
  });
}

export async function attachDocumentAction(input: { opportunityId: string; documentVersionId: string; role: DocumentKind; notes?: string | null }) {
  return runAction(async () => ({ attached: !!(await attachDocument(input, USER)) }));
}

export async function detachDocumentAction(linkId: string) {
  return runAction(async () => {
    await detachDocument(linkId, USER);
    return null;
  });
}

export async function analyzeOpportunityAction(id: string) {
  return runAction(async () => {
    await analyzeOpportunity(id, USER);
    return null;
  });
}

export async function clearAnalysisAction(id: string) {
  return runAction(async () => {
    await clearAnalysis(id, USER);
    return null;
  });
}

export async function interpretCommandAction(text: string) {
  return runAction(() => interpretCommand(text), { revalidate: false });
}

export async function applyActionsAction(actions: unknown[], inboxId?: string | null) {
  return runAction(() => applyActions(actions, USER, { inboxId }));
}

export async function renderEmailAction(opportunityId: string, templateId?: string | null) {
  const { renderEmailTemplate } = await import("@/server/services/email-templates");
  return runAction(() => renderEmailTemplate(opportunityId, templateId), { revalidate: false });
}
