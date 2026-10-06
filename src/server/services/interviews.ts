import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { interviews, opportunities, organizations, pipelineStages, type Interview } from "@/server/db/schema";
import { interviewInputSchema, interviewPatchSchema, type InterviewInput } from "@/lib/schemas";
import { INTERVIEW_KIND_LABEL, familyOf, type InterviewKind } from "@/lib/constants";
import { formatInstant } from "@/lib/dates";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";
import { getSettings } from "./settings";
import { addEvent } from "./timeline";
import { completeAutoRule } from "./tasks";
import { changeStatus } from "./opportunities";
import { listStages } from "./stages";
import { onInterviewCompleted, onInterviewScheduled } from "./rules";

function interviewTitle(kind: InterviewKind, title?: string | null) {
  return title?.trim() || `${INTERVIEW_KIND_LABEL[kind]} interview`;
}

const JOB_STAGE_FOR_KIND: Record<InterviewKind, string> = {
  HR: "HR_INTERVIEW",
  TECHNICAL: "TECHNICAL_INTERVIEW",
  CASE_STUDY: "TECHNICAL_INTERVIEW",
  MANAGER: "MANAGER_INTERVIEW",
  FOUNDER: "MANAGER_INTERVIEW",
  CULTURE: "MANAGER_INTERVIEW",
  PANEL: "FINAL_INTERVIEW",
  ACADEMIC: "HR_INTERVIEW",
  OTHER: "HR_INTERVIEW",
};

/** Moves the opportunity forward to the matching interview stage (never backwards). */
async function advanceStageForInterview(opportunityId: string, kind: InterviewKind, ctx: Ctx) {
  const [row] = await db
    .select({ opp: opportunities, stage: pipelineStages })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(eq(opportunities.id, opportunityId));
  if (!row) return;
  const { opp, stage } = row;
  if (!["BACKLOG", "TO_APPLY", "PREPARING", "APPLIED", "INTERVIEW"].includes(stage.category)) return;
  const family = familyOf(opp.type);
  const stages = (await listStages()).filter((s) => s.pipeline === family);
  const targetKey = family === "JOB" ? JOB_STAGE_FOR_KIND[kind] : "INTERVIEW";
  const target = stages.find((s) => s.key === targetKey) ?? stages.find((s) => s.category === "INTERVIEW");
  if (!target || target.id === stage.id) return;
  if (stage.category === "INTERVIEW" && target.position <= stage.position) return;
  await changeStatus(opportunityId, { status: target.key, note: "Interview scheduled" }, ctx);
}

export async function createInterview(raw: InterviewInput, ctx: Ctx, options: { advanceStage?: boolean; isDemo?: boolean } = {}) {
  const input = interviewInputSchema.parse(raw);
  const settings = await getSettings();
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, input.opportunityId));
  if (!opp) throw notFound("Opportunity");
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const status = input.status ?? (scheduledAt ? "SCHEDULED" : "TO_SCHEDULE");
  const interview = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(interviews)
      .values({
        opportunityId: input.opportunityId,
        kind: input.kind,
        title: input.title ?? null,
        scheduledAt,
        durationMinutes: input.durationMinutes ?? null,
        location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null,
        participants: input.participants ?? [],
        status,
        preparation: input.preparation ?? null,
        questions: input.questions ?? [],
        notes: input.notes ?? null,
        feedback: input.feedback ?? null,
        outcome: input.outcome ?? "PENDING",
        isDemo: options.isDemo ?? false,
      })
      .returning();
    const when = scheduledAt ? formatInstant(scheduledAt, { timeZone: settings.general.timezone, locale: settings.general.dateLocale }) : "date to be scheduled";
    await addEvent(
      tx,
      {
        opportunityId: input.opportunityId,
        interviewId: row.id,
        type: status === "COMPLETED" ? "INTERVIEW_DONE" : "INTERVIEW_SCHEDULED",
        title: `${interviewTitle(row.kind, row.title)} — ${when}`,
        metadata: { kind: row.kind },
        isDemo: options.isDemo,
      },
      ctx,
    );
    await logAudit(tx, { entityType: "interview", entityId: row.id, action: "CREATE", summary: interviewTitle(row.kind, row.title) }, ctx);
    return row;
  });
  if (options.advanceStage !== false) await advanceStageForInterview(input.opportunityId, input.kind, ctx);
  if (interview.status === "SCHEDULED") await onInterviewScheduled(interview, settings);
  if (interview.status === "COMPLETED") await onInterviewCompleted(interview, settings);
  return interview;
}

export async function updateInterview(id: string, raw: Partial<Omit<InterviewInput, "opportunityId">>, ctx: Ctx) {
  const patch = interviewPatchSchema.parse(raw);
  const settings = await getSettings();
  const [before] = await db.select().from(interviews).where(eq(interviews.id, id));
  if (!before) throw notFound("Interview");
  const values: Partial<typeof interviews.$inferInsert> = { ...patch, scheduledAt: undefined };
  if (patch.scheduledAt !== undefined) values.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
  if (values.scheduledAt && before.status === "TO_SCHEDULE" && !patch.status) values.status = "SCHEDULED";
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(interviews).set(values).where(eq(interviews.id, id)).returning();
    const rescheduled = values.scheduledAt !== undefined && (values.scheduledAt?.getTime() ?? null) !== (before.scheduledAt?.getTime() ?? null);
    if (rescheduled && updated.scheduledAt) {
      await addEvent(
        tx,
        {
          opportunityId: updated.opportunityId,
          interviewId: id,
          type: "INTERVIEW_SCHEDULED",
          title: `${interviewTitle(updated.kind, updated.title)} ${before.scheduledAt ? "rescheduled" : "scheduled"} — ${formatInstant(updated.scheduledAt, {
            timeZone: settings.general.timezone,
            locale: settings.general.dateLocale,
          })}`,
        },
        ctx,
      );
    }
    if (updated.status === "COMPLETED" && before.status !== "COMPLETED") {
      await addEvent(
        tx,
        {
          opportunityId: updated.opportunityId,
          interviewId: id,
          type: "INTERVIEW_DONE",
          title: `${interviewTitle(updated.kind, updated.title)} done${updated.outcome !== "PENDING" ? ` — ${updated.outcome.toLowerCase()}` : ""}`,
          body: updated.feedback ?? null,
        },
        ctx,
      );
      await completeAutoRule(tx, updated.opportunityId, "interview");
    }
    await logAudit(tx, { entityType: "interview", entityId: id, action: "UPDATE", summary: interviewTitle(updated.kind, updated.title) }, ctx);
    return { updated, rescheduled };
  });
  if (row.updated.status === "SCHEDULED" && (row.rescheduled || before.status !== "SCHEDULED")) await onInterviewScheduled(row.updated, settings);
  if (row.updated.status === "COMPLETED" && before.status !== "COMPLETED") await onInterviewCompleted(row.updated, settings);
  return row.updated;
}

export async function deleteInterview(id: string, ctx: Ctx) {
  const [row] = await db.delete(interviews).where(eq(interviews.id, id)).returning();
  if (!row) throw notFound("Interview");
  await logAudit(db, { entityType: "interview", entityId: id, action: "DELETE", summary: interviewTitle(row.kind, row.title) }, ctx);
  return row;
}

export async function getInterview(id: string) {
  const [row] = await db
    .select({ interview: interviews, opportunityTitle: opportunities.title, organizationName: organizations.name, opportunityType: opportunities.type })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(eq(interviews.id, id));
  if (!row) throw notFound("Interview");
  return row;
}

export async function listInterviewsBetween(from: Date, to: Date) {
  return db
    .select({ interview: interviews, opportunityTitle: opportunities.title, organizationName: organizations.name, opportunityId: opportunities.id })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(gte(interviews.scheduledAt, from), lte(interviews.scheduledAt, to), isNull(opportunities.deletedAt)))
    .orderBy(asc(interviews.scheduledAt));
}

export type InterviewRow = Interview;
