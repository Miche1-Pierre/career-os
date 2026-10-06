import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { opportunities } from "@/server/db/schema";
import { followUpActionSchema, type FollowUpAction } from "@/lib/schemas";
import { familyOf } from "@/lib/constants";
import { addDays, maxISO, todayISO, type ISODate } from "@/lib/dates";
import { computeNextFollowUp, resolveFollowUpInterval } from "@/lib/followups";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";
import { businessCalendar, getSettings } from "./settings";
import { getStage } from "./stages";
import { addEvent } from "./timeline";
import { completeAutoRule } from "./tasks";
import { changeStatus } from "./opportunities";
import { maybeSuggestGhosted } from "./rules";

export async function applyFollowUpAction(opportunityId: string, raw: FollowUpAction, ctx: Ctx) {
  const action = followUpActionSchema.parse(raw);
  switch (action.action) {
    case "done":
      return markFollowUpDone(opportunityId, action, ctx);
    case "schedule":
      return scheduleFollowUp(opportunityId, { date: action.date ?? null, days: action.days ?? null }, ctx);
    case "snooze":
      return snoozeFollowUp(opportunityId, action.days ?? 3, ctx);
    case "clear":
      return setFollowUpDate(opportunityId, null, ctx, "Follow-up cleared");
    case "pause":
    case "resume": {
      const [row] = await db
        .update(opportunities)
        .set({ followUpPaused: action.action === "pause" })
        .where(eq(opportunities.id, opportunityId))
        .returning();
      if (!row) throw notFound("Opportunity");
      await logAudit(db, { entityType: "opportunity", entityId: opportunityId, action: action.action === "pause" ? "PAUSE_FOLLOW_UPS" : "RESUME_FOLLOW_UPS" }, ctx);
      return row;
    }
  }
}

/** Records a follow-up (sent today by default) and schedules the next one. */
export async function markFollowUpDone(
  opportunityId: string,
  input: { date?: ISODate | null; note?: string | null; channel?: string | null; contactId?: string | null },
  ctx: Ctx,
) {
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  const date = input.date ?? today;
  const result = await db.transaction(async (tx) => {
    const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) throw notFound("Opportunity");
    const interval = resolveFollowUpInterval(opp, settings.followUp);
    const next = opp.followUpPaused
      ? null
      : computeNextFollowUp(date, interval, { calendar: businessCalendar(settings), expectedResponseAt: opp.expectedResponseAt });
    const count = opp.followUpCount + 1;
    const [row] = await tx
      .update(opportunities)
      .set({ followUpCount: count, lastContactAt: maxISO(opp.lastContactAt, date), nextFollowUpAt: next })
      .where(eq(opportunities.id, opportunityId))
      .returning();
    await addEvent(
      tx,
      {
        opportunityId,
        contactId: input.contactId ?? null,
        type: "FOLLOW_UP_SENT",
        title: `Follow-up #${count} sent`,
        body: input.note ?? null,
        channel: input.channel ?? null,
        direction: "OUTBOUND",
        occurredAt: date === today ? new Date() : new Date(`${date}T12:00:00Z`),
        metadata: { count, next },
      },
      ctx,
    );
    await completeAutoRule(tx, opportunityId, "followup");
    await logAudit(
      tx,
      { entityType: "opportunity", entityId: opportunityId, action: "FOLLOW_UP", changes: [{ field: "nextFollowUpAt", from: opp.nextFollowUpAt, to: next }], summary: `Follow-up #${count}` },
      ctx,
    );
    return { opportunity: row, stageId: opp.stageId, type: opp.type };
  });
  // JOB applications move from "Applied" to "Followed up".
  if (settings.followUp.moveToFollowUpStage && familyOf(result.type) === "JOB") {
    const stage = await getStage(result.stageId);
    if (stage.key === "APPLIED") await changeStatus(opportunityId, { status: "FOLLOW_UP", date }, ctx, { skipFollowUpBookkeeping: true, settings });
  }
  await maybeSuggestGhosted(result.opportunity, settings);
  return result.opportunity;
}

export async function scheduleFollowUp(opportunityId: string, input: { date?: ISODate | null; days?: number | null }, ctx: Ctx) {
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  let date = input.date ?? null;
  if (!date) {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) throw notFound("Opportunity");
    const interval = input.days != null ? { ...resolveFollowUpInterval(opp, settings.followUp), days: input.days } : resolveFollowUpInterval(opp, settings.followUp);
    date = computeNextFollowUp(today, interval, { calendar: businessCalendar(settings) }) ?? addDays(today, input.days ?? 7);
  }
  return setFollowUpDate(opportunityId, date, ctx, `Follow-up scheduled for ${date}`);
}

export async function snoozeFollowUp(opportunityId: string, days: number, ctx: Ctx) {
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opp) throw notFound("Opportunity");
  const base = opp.nextFollowUpAt && opp.nextFollowUpAt > today ? opp.nextFollowUpAt : today;
  return setFollowUpDate(opportunityId, addDays(base, days), ctx, `Follow-up snoozed by ${days} day${days > 1 ? "s" : ""}`);
}

async function setFollowUpDate(opportunityId: string, date: ISODate | null, ctx: Ctx, summary: string) {
  const [before] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!before) throw notFound("Opportunity");
  const [row] = await db.update(opportunities).set({ nextFollowUpAt: date }).where(eq(opportunities.id, opportunityId)).returning();
  await logAudit(
    db,
    { entityType: "opportunity", entityId: opportunityId, action: "SCHEDULE_FOLLOW_UP", changes: [{ field: "nextFollowUpAt", from: before.nextFollowUpAt, to: date }], summary },
    ctx,
  );
  return row;
}
