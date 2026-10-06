/**
 * Small rules engine: Trigger → Condition → Action.
 *
 * Event triggers (status changed, interview scheduled/completed) run right after the triggering operation.
 * Periodic triggers (deadlines, missing documents, ghosting, stale interviews) run from the background scheduler
 * and when the Today view is opened (throttled). Every action is idempotent (task rule keys, notification keys).
 */
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { interviews, opportunities, organizations, pipelineStages, tasks, type Interview, type Opportunity, type PipelineStage } from "@/server/db/schema";
import { familyOf, INTERVIEW_KIND_LABEL } from "@/lib/constants";
import { addDays, diffDays, formatISODate, toISODate, todayISO } from "@/lib/dates";
import { computeNextFollowUp, resolveFollowUpInterval } from "@/lib/followups";
import type { AppSettings } from "@/lib/settings-schema";
import { businessCalendar, getSettings } from "./settings";
import { ensureRuleTask } from "./tasks";
import { dismissNotificationsFor, emitNotification } from "./notifications";

// ---------------------------------------------------------------------------
// Event triggers
// ---------------------------------------------------------------------------

export async function onStatusChanged(opp: Opportunity, from: PipelineStage, to: PipelineStage, settings: AppSettings) {
  const today = todayISO(settings.general.timezone);
  const rules = settings.automation;
  if (to.category === "OFFER" && rules.offer_decision.enabled) {
    await ensureRuleTask(db, `offer_decision:${opp.id}:${to.key}`, {
      opportunityId: opp.id,
      title: familyOf(opp.type) === "EDUCATION" ? "Decide on the admission" : "Decide on the offer",
      kind: "TODO",
      dueDate: addDays(today, rules.offer_decision.days || 7),
      isDemo: opp.isDemo,
    });
  }
  if (to.category === "WON" || to.category === "LOST") await dismissNotificationsFor(opp.id);
  void from;
}

export async function onInterviewScheduled(interview: Interview, settings: AppSettings) {
  const rule = settings.automation.interview_prep_task;
  if (!rule.enabled || !interview.scheduledAt) return;
  const tz = settings.general.timezone;
  const interviewDay = toISODate(interview.scheduledAt, tz);
  const due = addDays(interviewDay, -Math.max(0, rule.days));
  const today = todayISO(tz);
  // No follow-up is needed before an interview that is already planned.
  if (interview.scheduledAt.getTime() > Date.now()) {
    await db
      .update(opportunities)
      .set({ nextFollowUpAt: null })
      .where(and(eq(opportunities.id, interview.opportunityId), sql`(${opportunities.nextFollowUpAt} is not null and ${opportunities.nextFollowUpAt} <= ${interviewDay})`));
  }
  const key = `interview_prep:${interview.id}`;
  const created = await ensureRuleTask(db, key, {
    opportunityId: interview.opportunityId,
    interviewId: interview.id,
    title: `Prepare ${INTERVIEW_KIND_LABEL[interview.kind].toLowerCase()} interview`,
    kind: "PREPARATION",
    dueDate: due < today ? today : due,
    isDemo: interview.isDemo,
  });
  if (!created) {
    // Rescheduled: move the (still open) preparation task.
    await db
      .update(tasks)
      .set({ dueDate: due < today ? today : due })
      .where(and(eq(tasks.ruleKey, key), eq(tasks.done, false)));
  }
}

export async function onInterviewCompleted(interview: Interview, settings: AppSettings) {
  const tz = settings.general.timezone;
  const today = todayISO(tz);
  const rule = settings.automation.post_interview_thanks;
  const day = interview.scheduledAt ? toISODate(interview.scheduledAt, tz) : today;
  // A thank-you note only makes sense right after the interview.
  if (rule.enabled && diffDays(today, day) <= 2) {
    await ensureRuleTask(db, `thanks:${interview.id}`, {
      opportunityId: interview.opportunityId,
      interviewId: interview.id,
      title: "Send a thank-you note",
      kind: "FOLLOW_UP",
      dueDate: addDays(day > today ? day : today, rule.days),
      isDemo: interview.isDemo,
    });
  }
  // Post-interview follow-up.
  const [row] = await db
    .select({ opp: opportunities, category: pipelineStages.category })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(eq(opportunities.id, interview.opportunityId));
  const [next] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(eq(interviews.opportunityId, interview.opportunityId), eq(interviews.status, "SCHEDULED"), sql`${interviews.scheduledAt} > now()`))
    .limit(1);
  // No follow-up needed while another interview is already planned.
  if (row && row.category === "INTERVIEW" && !row.opp.followUpPaused && !next) {
    const interval = resolveFollowUpInterval(row.opp, settings.followUp, { afterInterview: true });
    const next = computeNextFollowUp(day > today ? day : today, interval, { calendar: businessCalendar(settings) });
    await db.update(opportunities).set({ nextFollowUpAt: next, lastContactAt: day }).where(eq(opportunities.id, row.opp.id));
  }
  await dismissNotificationsFor(interview.id, ["stale_interview"]);
}

export async function maybeSuggestGhosted(opp: Opportunity, settings: AppSettings) {
  if (!settings.automation.ghost_suggestion.enabled) return;
  if (opp.firstResponseAt || opp.followUpCount < settings.followUp.maxFollowUps) return;
  await emitNotification({
    key: `ghost:${opp.id}:${opp.followUpCount}`,
    kind: "ghost_suggestion",
    title: `No answer after ${opp.followUpCount} follow-ups`,
    body: `“${opp.title}” — you may want to mark it as ghosted and move on.`,
    entityType: "opportunity",
    entityId: opp.id,
    action: { type: "SET_STATUS", label: "Mark as ghosted", payload: { opportunityId: opp.id, status: "GHOSTED" } },
  });
}

// ---------------------------------------------------------------------------
// Periodic evaluation
// ---------------------------------------------------------------------------

const throttle = globalThis as unknown as { __careerOsRulesAt?: number };

export async function evaluateRulesThrottled(minIntervalMs = 5 * 60_000) {
  const now = Date.now();
  if (throttle.__careerOsRulesAt && now - throttle.__careerOsRulesAt < minIntervalMs) return null;
  throttle.__careerOsRulesAt = now;
  try {
    return await evaluatePeriodicRules();
  } catch (error) {
    console.error("[rules] evaluation failed", error);
    return null;
  }
}

export async function evaluatePeriodicRules() {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = todayISO(tz);
  const rules = settings.automation;
  const stats = { deadlines: 0, missingDocuments: 0, ghosted: 0, staleInterviews: 0, followUpsScheduled: 0 };

  const active = await db
    .select({ opp: opportunities, category: pipelineStages.category, orgName: organizations.name })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(isNull(opportunities.deletedAt), isNull(opportunities.archivedAt), sql`${pipelineStages.category} not in ('WON','LOST')`));

  const preSubmit = active.filter((a) => ["BACKLOG", "TO_APPLY", "PREPARING"].includes(a.category));

  // Deadline approaching
  if (rules.deadline_urgent.enabled) {
    for (const { opp, orgName } of preSubmit) {
      if (!opp.deadline) continue;
      const days = diffDays(opp.deadline, today);
      if (days < 0 || days > rules.deadline_urgent.days) continue;
      const created = await emitNotification({
        key: `deadline:${opp.id}:${opp.deadline}`,
        kind: "deadline_urgent",
        title: days === 0 ? "Deadline today" : days === 1 ? "Deadline tomorrow" : `Deadline in ${days} days`,
        body: `${opp.title}${orgName ? ` — ${orgName}` : ""}`,
        entityType: "opportunity",
        entityId: opp.id,
      });
      if (created) stats.deadlines++;
    }
  }

  // Missing documents before the deadline
  if (rules.missing_documents.enabled && preSubmit.length) {
    const withDeadline = preSubmit.filter((a) => a.opp.deadline && diffDays(a.opp.deadline, today) >= 0 && diffDays(a.opp.deadline, today) <= rules.missing_documents.days);
    if (withDeadline.length) {
      const openDocs = await db
        .select({ opportunityId: tasks.opportunityId, title: tasks.title })
        .from(tasks)
        .where(and(inArray(tasks.opportunityId, withDeadline.map((w) => w.opp.id)), eq(tasks.kind, "DOCUMENT"), eq(tasks.done, false)));
      for (const { opp } of withDeadline) {
        const missing = openDocs.filter((d) => d.opportunityId === opp.id);
        if (!missing.length) continue;
        const created = await emitNotification({
          key: `missing_docs:${opp.id}:${opp.deadline}`,
          kind: "missing_documents",
          title: `${missing.length} document${missing.length > 1 ? "s" : ""} missing — deadline ${formatISODate(opp.deadline, "medium", settings.general.dateLocale)}`,
          body: `${opp.title}: ${missing.map((m) => m.title).join(", ")}`,
          entityType: "opportunity",
          entityId: opp.id,
        });
        if (created) stats.missingDocuments++;
      }
    }
  }

  // Applications without any follow-up scheduled (e.g. imported as applied) → schedule one.
  for (const { opp, category } of active) {
    if (category !== "APPLIED" || opp.followUpPaused || opp.nextFollowUpAt || opp.firstResponseAt) continue;
    const from = opp.lastContactAt ?? opp.appliedAt;
    if (!from) continue;
    const interval = resolveFollowUpInterval(opp, settings.followUp);
    const next = computeNextFollowUp(from, interval, { calendar: businessCalendar(settings), expectedResponseAt: opp.expectedResponseAt });
    if (!next) continue;
    await db.update(opportunities).set({ nextFollowUpAt: next }).where(eq(opportunities.id, opp.id));
    stats.followUpsScheduled++;
  }

  // Ghost suggestions
  if (rules.ghost_suggestion.enabled) {
    for (const { opp, category } of active) {
      if (category !== "APPLIED" || opp.firstResponseAt || opp.followUpCount < settings.followUp.maxFollowUps) continue;
      const last = opp.lastContactAt ?? opp.appliedAt;
      if (last && diffDays(today, last) < Math.min(settings.followUp.ghostAfterDays, 7)) continue;
      await maybeSuggestGhosted(opp, settings);
      stats.ghosted++;
    }
  }

  // Past interviews without outcome
  if (rules.stale_interview.enabled) {
    const cutoff = new Date(Date.now() - Math.max(1, rules.stale_interview.days) * 12 * 3600_000);
    const stale = await db
      .select({ interview: interviews, title: opportunities.title })
      .from(interviews)
      .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
      .where(and(eq(interviews.status, "SCHEDULED"), isNotNull(interviews.scheduledAt), lte(interviews.scheduledAt, cutoff), isNull(opportunities.deletedAt)));
    for (const { interview, title } of stale) {
      const created = await emitNotification({
        key: `stale_interview:${interview.id}`,
        kind: "stale_interview",
        title: "How did the interview go?",
        body: `${INTERVIEW_KIND_LABEL[interview.kind]} interview — ${title}. Log notes and outcome.`,
        entityType: "interview",
        entityId: interview.id,
        action: { type: "OPEN_OPPORTUNITY", label: "Log outcome", payload: { opportunityId: interview.opportunityId, interviewId: interview.id } },
      });
      if (created) stats.staleInterviews++;
    }
  }

  return stats;
}
