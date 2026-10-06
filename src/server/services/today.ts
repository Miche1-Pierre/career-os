import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  contacts,
  inboxItems,
  interviews,
  opportunities,
  opportunityContacts,
  organizations,
  pipelineStages,
  tasks,
} from "@/server/db/schema";
import { addDays, diffDays, dueStatus, formatISODate, instantToZonedParts, todayISO, type DueStatus, type ISODate } from "@/lib/dates";
import { INTERVIEW_KIND_LABEL, type OpportunityType, type StageCategory } from "@/lib/constants";
import { getSettings } from "./settings";
import { listNotifications } from "./notifications";

export type TodayItemKind = "FOLLOW_UP" | "TASK" | "INTERVIEW" | "DEADLINE" | "OPENS" | "DECISION" | "WAITING" | "DOCUMENTS" | "OUTCOME";

export interface TodayOpportunityRef {
  id: string;
  title: string;
  type: OpportunityType;
  organizationName: string | null;
  stageLabel: string;
  stageCategory: StageCategory;
  priority: string;
}

export interface TodayItem {
  key: string;
  kind: TodayItemKind;
  date: ISODate;
  time?: string | null;
  title: string;
  subtitle?: string | null;
  due: DueStatus;
  opportunity?: TodayOpportunityRef | null;
  taskId?: string;
  interviewId?: string;
  meetingUrl?: string | null;
  contact?: { id: string; fullName: string; email: string | null } | null;
  meta?: Record<string, unknown>;
}

export interface TodayData {
  today: ISODate;
  overdue: TodayItem[];
  dueToday: TodayItem[];
  upcoming: TodayItem[];
  waiting: TodayItem[];
  missingDocuments: TodayItem[];
  suggestions: Awaited<ReturnType<typeof listNotifications>>;
  counts: {
    overdue: number;
    dueToday: number;
    followUpsDue: number;
    interviewsUpcoming: number;
    deadlinesSoon: number;
    missingDocuments: number;
    waiting: number;
    inbox: number;
  };
}

const PRE_SUBMIT: StageCategory[] = ["BACKLOG", "TO_APPLY", "PREPARING"];

export async function getToday(options: { horizonDays?: number } = {}): Promise<TodayData> {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = todayISO(tz);
  const horizon = addDays(today, options.horizonDays ?? 7);
  const deadlineHorizon = addDays(today, 14);

  const active = await db
    .select({
      opp: opportunities,
      orgName: organizations.name,
      stageLabel: pipelineStages.label,
      category: pipelineStages.category,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(isNull(opportunities.deletedAt), isNull(opportunities.archivedAt), sql`${pipelineStages.category} not in ('WON','LOST')`));

  const refOf = (a: (typeof active)[number]): TodayOpportunityRef => ({
    id: a.opp.id,
    title: a.opp.title,
    type: a.opp.type,
    organizationName: a.orgName,
    stageLabel: a.stageLabel,
    stageCategory: a.category,
    priority: a.opp.priority,
  });
  const activeIds = active.map((a) => a.opp.id);
  const byId = new Map(active.map((a) => [a.opp.id, a]));

  // First contact per opportunity (for follow-up emails).
  const contactRows = activeIds.length
    ? await db
        .select({ opportunityId: opportunityContacts.opportunityId, id: contacts.id, fullName: contacts.fullName, email: contacts.email, relationship: contacts.relationship })
        .from(opportunityContacts)
        .innerJoin(contacts, eq(contacts.id, opportunityContacts.contactId))
        .where(inArray(opportunityContacts.opportunityId, activeIds))
    : [];
  const contactFor = new Map<string, { id: string; fullName: string; email: string | null }>();
  for (const c of contactRows.sort((a, b) => Number(b.relationship === "RECRUITER") - Number(a.relationship === "RECRUITER"))) {
    if (!contactFor.has(c.opportunityId)) contactFor.set(c.opportunityId, { id: c.id, fullName: c.fullName, email: c.email });
  }

  const items: TodayItem[] = [];

  for (const a of active) {
    const o = a.opp;
    // Follow-ups
    if (o.nextFollowUpAt && !o.followUpPaused && o.nextFollowUpAt <= horizon) {
      items.push({
        key: `followup:${o.id}`,
        kind: "FOLLOW_UP",
        date: o.nextFollowUpAt,
        title: `Follow up — ${a.orgName ?? o.title}`,
        subtitle: `${o.title}${o.followUpCount ? ` · ${o.followUpCount} follow-up${o.followUpCount > 1 ? "s" : ""} sent` : ""}${o.appliedAt ? ` · applied ${diffDays(today, o.appliedAt)} days ago` : ""}`,
        due: dueStatus(o.nextFollowUpAt, today),
        opportunity: refOf(a),
        contact: contactFor.get(o.id) ?? null,
      });
    }
    // Deadlines (only before submission)
    if (o.deadline && PRE_SUBMIT.includes(a.category) && o.deadline <= deadlineHorizon && diffDays(today, o.deadline) <= 30) {
      items.push({
        key: `deadline:${o.id}`,
        kind: "DEADLINE",
        date: o.deadline,
        time: o.deadlineTime,
        title: `Deadline — ${o.title}`,
        subtitle: [a.orgName, a.stageLabel].filter(Boolean).join(" · "), // the time is shown next to the title
        due: dueStatus(o.deadline, today),
        opportunity: refOf(a),
      });
    }
    // Application windows opening
    if (o.applicationOpensAt && PRE_SUBMIT.includes(a.category) && o.applicationOpensAt >= today && o.applicationOpensAt <= horizon) {
      items.push({
        key: `opens:${o.id}`,
        kind: "OPENS",
        date: o.applicationOpensAt,
        title: `Applications open — ${o.title}`,
        subtitle: a.orgName,
        due: dueStatus(o.applicationOpensAt, today),
        opportunity: refOf(a),
      });
    }
    // Announced decision dates
    if (o.expectedResponseAt && o.expectedResponseAt >= addDays(today, -3) && o.expectedResponseAt <= horizon) {
      items.push({
        key: `decision:${o.id}`,
        kind: "DECISION",
        date: o.expectedResponseAt,
        title: `Answer expected — ${a.orgName ?? o.title}`,
        subtitle: o.title,
        due: dueStatus(o.expectedResponseAt, today),
        opportunity: refOf(a),
      });
    }
  }

  // Interviews (scheduled, from 12h ago to horizon)
  const interviewRows = await db
    .select({ interview: interviews, opportunityId: opportunities.id })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .where(
      and(
        eq(interviews.status, "SCHEDULED"),
        gte(interviews.scheduledAt, new Date(Date.now() - 36 * 3600_000)),
        lte(interviews.scheduledAt, new Date(`${addDays(horizon, 1)}T00:00:00Z`)),
        isNull(opportunities.deletedAt),
      ),
    )
    .orderBy(asc(interviews.scheduledAt));
  for (const { interview, opportunityId } of interviewRows) {
    const a = byId.get(opportunityId);
    if (!a || !interview.scheduledAt) continue;
    const parts = instantToZonedParts(interview.scheduledAt, tz);
    const ended = interview.scheduledAt.getTime() + (interview.durationMinutes ?? 60) * 60_000 < Date.now();
    items.push({
      key: `interview:${interview.id}`,
      kind: ended ? "OUTCOME" : "INTERVIEW",
      date: parts.date,
      time: parts.time,
      title: ended ? `Log outcome — ${INTERVIEW_KIND_LABEL[interview.kind]} interview, ${a.orgName ?? a.opp.title}` : `${INTERVIEW_KIND_LABEL[interview.kind]} interview — ${a.orgName ?? a.opp.title}`,
      subtitle: `${a.opp.title}${interview.location ? ` · ${interview.location}` : ""}`,
      due: dueStatus(parts.date, today),
      opportunity: refOf(a),
      interviewId: interview.id,
      meetingUrl: interview.meetingUrl,
    });
  }

  // Tasks with a due date
  const taskRows = await db
    .select({ task: tasks })
    .from(tasks)
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .where(and(eq(tasks.done, false), lte(tasks.dueDate, horizon), isNull(opportunities.deletedAt)))
    .orderBy(asc(tasks.dueDate));
  for (const { task } of taskRows) {
    if (!task.dueDate) continue;
    const a = task.opportunityId ? byId.get(task.opportunityId) : undefined;
    if (task.opportunityId && !a) continue; // closed or archived opportunity
    items.push({
      key: `task:${task.id}`,
      kind: "TASK",
      date: task.dueDate,
      title: task.title,
      subtitle: a ? `${a.orgName ? `${a.orgName} · ` : ""}${a.opp.title}` : null,
      due: dueStatus(task.dueDate, today),
      opportunity: a ? refOf(a) : null,
      taskId: task.id,
      meta: { kind: task.kind },
    });
  }

  const sortItems = (list: TodayItem[]) =>
    list.sort((x, y) => (x.date === y.date ? (x.time ?? "99:99").localeCompare(y.time ?? "99:99") : x.date.localeCompare(y.date)));

  const overdue = sortItems(items.filter((i) => i.date < today && i.kind !== "DECISION"));
  const dueToday = sortItems(items.filter((i) => i.date === today || (i.kind === "OUTCOME" && i.date <= today && !overdue.includes(i))));
  const upcoming = sortItems(items.filter((i) => i.date > today));

  // Waiting for an answer
  const waiting: TodayItem[] = active
    .filter((a) => a.category === "APPLIED" && !a.opp.firstResponseAt && a.opp.appliedAt)
    .map((a) => {
      const since = diffDays(today, a.opp.appliedAt!);
      return {
        key: `waiting:${a.opp.id}`,
        kind: "WAITING" as const,
        date: a.opp.appliedAt!,
        title: `${a.orgName ?? a.opp.title} — applied ${since === 0 ? "today" : since === 1 ? "yesterday" : `${since} days ago`}`,
        subtitle: `${a.opp.title}${a.opp.nextFollowUpAt ? ` · next follow-up ${formatISODate(a.opp.nextFollowUpAt, "medium", settings.general.dateLocale)}` : ""}`,
        due: dueStatus(a.opp.appliedAt!, today),
        opportunity: refOf(a),
        meta: { days: since, followUps: a.opp.followUpCount, nextFollowUpAt: a.opp.nextFollowUpAt, overThreshold: since >= settings.followUp.waitingThresholdDays },
      };
    })
    .sort((x, y) => x.date.localeCompare(y.date));

  // Missing documents (open DOCUMENT tasks on opportunities being prepared)
  const preSubmitIds = active.filter((a) => a.category === "TO_APPLY" || a.category === "PREPARING").map((a) => a.opp.id);
  const docTasks = preSubmitIds.length
    ? await db
        .select({ opportunityId: tasks.opportunityId, title: tasks.title })
        .from(tasks)
        .where(and(inArray(tasks.opportunityId, preSubmitIds), eq(tasks.kind, "DOCUMENT"), eq(tasks.done, false)))
    : [];
  const missingByOpp = new Map<string, string[]>();
  for (const d of docTasks) {
    if (!d.opportunityId) continue;
    missingByOpp.set(d.opportunityId, [...(missingByOpp.get(d.opportunityId) ?? []), d.title]);
  }
  const missingDocuments: TodayItem[] = [...missingByOpp.entries()]
    .map(([id, list]) => {
      const a = byId.get(id)!;
      const date = a.opp.deadline ?? addDays(today, 365);
      return {
        key: `docs:${id}`,
        kind: "DOCUMENTS" as const,
        date,
        title: `${a.opp.title}${a.orgName ? ` — ${a.orgName}` : ""}`,
        subtitle: list.join(" · "),
        due: dueStatus(date, today),
        opportunity: refOf(a),
        meta: { missing: list, hasDeadline: !!a.opp.deadline },
      };
    })
    .sort((x, y) => x.date.localeCompare(y.date));

  const [inboxCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboxItems)
    .where(inArray(inboxItems.status, ["NEW", "QUEUED", "PROCESSING", "READY", "FAILED"]));

  const suggestions = await listNotifications({ limit: 20 });
  const all = [...overdue, ...dueToday, ...upcoming];
  return {
    today,
    overdue,
    dueToday,
    upcoming,
    waiting,
    missingDocuments,
    suggestions,
    counts: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      followUpsDue: all.filter((i) => i.kind === "FOLLOW_UP" && i.date <= today).length,
      interviewsUpcoming: all.filter((i) => i.kind === "INTERVIEW").length,
      deadlinesSoon: all.filter((i) => i.kind === "DEADLINE" && i.due.days <= 7).length,
      missingDocuments: missingDocuments.reduce((n, i) => n + ((i.meta?.missing as string[])?.length ?? 0), 0),
      waiting: waiting.length,
      inbox: inboxCount?.count ?? 0,
    },
  };
}

/** Lightweight counts for the sidebar badges. */
export async function getBadgeCounts() {
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  const [row] = await db
    .select({
      followUps: sql<number>`count(*) filter (where ${opportunities.nextFollowUpAt} <= ${today} and not ${opportunities.followUpPaused})::int`,
      deadlines: sql<number>`count(*) filter (where ${opportunities.deadline} <= ${addDays(today, 1)} and ${opportunities.deadline} >= ${addDays(today, -30)} and ${pipelineStages.category} in ('BACKLOG','TO_APPLY','PREPARING'))::int`,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(and(isNull(opportunities.deletedAt), isNull(opportunities.archivedAt), sql`${pipelineStages.category} not in ('WON','LOST')`));
  const [taskRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(
      and(
        eq(tasks.done, false),
        lte(tasks.dueDate, today),
        isNull(opportunities.deletedAt),
        sql`(${tasks.opportunityId} is null or (${pipelineStages.category} not in ('WON','LOST') and ${opportunities.archivedAt} is null))`,
      ),
    );
  const [inboxRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboxItems)
    .where(inArray(inboxItems.status, ["NEW", "QUEUED", "PROCESSING", "READY", "FAILED"]));
  const [interviewRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .where(
      and(
        eq(interviews.status, "SCHEDULED"),
        gte(interviews.scheduledAt, new Date()),
        lte(interviews.scheduledAt, new Date(`${addDays(today, 2)}T00:00:00Z`)),
        isNull(opportunities.deletedAt),
      ),
    );
  return {
    today: (row?.followUps ?? 0) + (row?.deadlines ?? 0) + (taskRow?.count ?? 0) + (interviewRow?.count ?? 0),
    inbox: inboxRow?.count ?? 0,
  };
}
