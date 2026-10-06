/**
 * Objective statistics only — counts and rates, never conclusions.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  documents,
  documentVersions,
  goals,
  interviews,
  opportunities,
  opportunityDocuments,
  organizations,
  pipelineStages,
  timelineEvents,
  type Goal,
} from "@/server/db/schema";
import {
  CLOSED_CATEGORIES,
  OPPORTUNITY_TYPE_META,
  STAGE_CATEGORIES,
  STAGE_CATEGORY_META,
  familyOf,
  sourceLabel,
  type OpportunityFamily,
  type StageCategory,
} from "@/lib/constants";
import { addDays, addMonths, diffDays, startOfMonth, startOfWeek, toISODate, todayISO, type ISODate } from "@/lib/dates";
import { z } from "zod";
import { getSettings } from "./settings";
import { AppError, type Ctx } from "@/server/context";
import { logAudit } from "./audit";

const CATEGORY_RANK: Record<StageCategory, number> = { BACKLOG: 0, TO_APPLY: 1, PREPARING: 2, APPLIED: 3, INTERVIEW: 4, OFFER: 5, WON: 6, LOST: -1 };

interface OppFacts {
  id: string;
  title: string;
  type: string;
  family: OpportunityFamily;
  source: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  remotePolicy: string | null;
  tags: string[];
  category: StageCategory;
  stageKey: string;
  appliedAt: ISODate | null;
  createdDay: ISODate;
  firstResponseAt: ISODate | null;
  reached: Set<StageCategory>;
  firstInterviewDay: ISODate | null;
  followUpCount: number;
  cvDocument: string | null;
  isDemo: boolean;
}

async function loadFacts(tz: string): Promise<OppFacts[]> {
  const rows = await db
    .select({
      opp: opportunities,
      category: pipelineStages.category,
      stageKey: pipelineStages.key,
      industry: organizations.industry,
      size: organizations.size,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(isNull(opportunities.deletedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.opp.id);
  const [statusEvents, ivs, cvs] = await Promise.all([
    db
      .select({ opportunityId: timelineEvents.opportunityId, metadata: timelineEvents.metadata })
      .from(timelineEvents)
      .where(and(eq(timelineEvents.type, "STATUS_CHANGED"), inArray(timelineEvents.opportunityId, ids))),
    db
      .select({ opportunityId: interviews.opportunityId, first: sql<Date | null>`min(${interviews.scheduledAt})` })
      .from(interviews)
      .where(and(inArray(interviews.opportunityId, ids), sql`${interviews.status} <> 'CANCELLED'`))
      .groupBy(interviews.opportunityId),
    db
      .select({ opportunityId: opportunityDocuments.opportunityId, name: documents.name, version: documentVersions.version })
      .from(opportunityDocuments)
      .innerJoin(documentVersions, eq(documentVersions.id, opportunityDocuments.documentVersionId))
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(and(inArray(opportunityDocuments.opportunityId, ids), eq(opportunityDocuments.role, "CV"))),
  ]);
  const reachedMap = new Map<string, Set<StageCategory>>();
  for (const e of statusEvents) {
    if (!e.opportunityId) continue;
    const set = reachedMap.get(e.opportunityId) ?? new Set<StageCategory>();
    const to = (e.metadata as { toCategory?: StageCategory })?.toCategory;
    if (to) set.add(to);
    reachedMap.set(e.opportunityId, set);
  }
  const ivMap = new Map(ivs.map((i) => [i.opportunityId, i.first ? toISODate(new Date(i.first), tz) : null]));
  const cvMap = new Map<string, string>();
  for (const c of cvs) if (!cvMap.has(c.opportunityId)) cvMap.set(c.opportunityId, `${c.name} v${c.version}`);
  return rows.map((r) => {
    const reached = reachedMap.get(r.opp.id) ?? new Set<StageCategory>();
    reached.add(r.category);
    return {
      id: r.opp.id,
      title: r.opp.title,
      type: r.opp.type,
      family: familyOf(r.opp.type),
      source: r.opp.source,
      industry: r.industry,
      companySize: r.size,
      country: r.opp.locationCountry,
      remotePolicy: r.opp.remotePolicy,
      tags: r.opp.tags,
      category: r.category,
      stageKey: r.stageKey,
      appliedAt: r.opp.appliedAt,
      createdDay: toISODate(r.opp.createdAt, tz),
      firstResponseAt: r.opp.firstResponseAt,
      reached,
      firstInterviewDay: ivMap.get(r.opp.id) ?? null,
      followUpCount: r.opp.followUpCount,
      cvDocument: cvMap.get(r.opp.id) ?? null,
      isDemo: r.opp.isDemo,
    };
  });
}

const reachedAtLeast = (f: OppFacts, category: StageCategory) => [...f.reached].some((c) => CATEGORY_RANK[c] >= CATEGORY_RANK[category]);
const isResponded = (f: OppFacts) => !!f.firstResponseAt || reachedAtLeast(f, "INTERVIEW") || f.stageKey === "REJECTED" || f.stageKey === "WAITLIST";
const isInterviewed = (f: OppFacts) => !!f.firstInterviewDay || reachedAtLeast(f, "INTERVIEW");
const isOffered = (f: OppFacts) => reachedAtLeast(f, "OFFER");

function rate(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
}

function avg(values: number[]) {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

function summarize(facts: OppFacts[]) {
  const submitted = facts.filter((f) => f.appliedAt);
  const responded = submitted.filter(isResponded);
  const interviewed = submitted.filter(isInterviewed);
  const offered = submitted.filter(isOffered);
  const accepted = submitted.filter((f) => f.reached.has("WON"));
  const rejected = submitted.filter((f) => f.stageKey === "REJECTED");
  const responseDays = submitted.filter((f) => f.firstResponseAt && f.appliedAt).map((f) => diffDays(f.firstResponseAt!, f.appliedAt!)).filter((d) => d >= 0);
  const interviewDays = submitted.filter((f) => f.firstInterviewDay && f.appliedAt).map((f) => diffDays(f.firstInterviewDay!, f.appliedAt!)).filter((d) => d >= 0);
  return {
    applications: submitted.length,
    responses: responded.length,
    interviews: interviewed.length,
    offers: offered.length,
    accepted: accepted.length,
    rejections: rejected.length,
    pending: submitted.filter((f) => f.category === "APPLIED").length,
    responseRate: rate(responded.length, submitted.length),
    interviewRate: rate(interviewed.length, submitted.length),
    offerRate: rate(offered.length, submitted.length),
    avgResponseDays: avg(responseDays),
    avgDaysToInterview: avg(interviewDays),
    followUps: submitted.reduce((n, f) => n + f.followUpCount, 0),
    followUpsPerApplication: submitted.length ? Math.round((submitted.reduce((n, f) => n + f.followUpCount, 0) / submitted.length) * 10) / 10 : null,
  };
}

export const SEGMENTS = {
  source: { label: "Source", get: (f: OppFacts) => [sourceLabel(f.source)] },
  type: { label: "Type", get: (f: OppFacts) => [OPPORTUNITY_TYPE_META[f.type as keyof typeof OPPORTUNITY_TYPE_META]?.label ?? f.type] },
  industry: { label: "Industry", get: (f: OppFacts) => [f.industry ?? "Unknown"] },
  country: { label: "Location", get: (f: OppFacts) => [f.country ?? "Unknown"] },
  remote: { label: "Remote policy", get: (f: OppFacts) => [f.remotePolicy ?? "Unknown"] },
  cv: { label: "CV version", get: (f: OppFacts) => [f.cvDocument ?? "No CV attached"] },
  size: { label: "Company size", get: (f: OppFacts) => [f.companySize ?? "Unknown"] },
  tag: { label: "Tag", get: (f: OppFacts) => (f.tags.length ? f.tags : ["No tag"]) },
} as const;
export type SegmentKey = keyof typeof SEGMENTS;

export async function getAnalytics(options: { family?: OpportunityFamily | "ALL"; segment?: SegmentKey; from?: ISODate | null; to?: ISODate | null } = {}) {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = todayISO(tz);
  let facts = await loadFacts(tz);
  if (options.family && options.family !== "ALL") facts = facts.filter((f) => f.family === options.family);
  if (options.from) facts = facts.filter((f) => (f.appliedAt ?? f.createdDay) >= options.from!);
  if (options.to) facts = facts.filter((f) => (f.appliedAt ?? f.createdDay) <= options.to!);

  // Applications per month (last 12 months)
  const months: { month: string; label: string; applications: number; added: number }[] = [];
  const firstMonth = startOfMonth(addMonths(today, -11));
  for (let i = 0; i < 12; i++) {
    const m = addMonths(firstMonth, i).slice(0, 7);
    months.push({
      month: m,
      label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`)),
      applications: facts.filter((f) => f.appliedAt?.startsWith(m)).length,
      added: facts.filter((f) => f.createdDay.startsWith(m)).length,
    });
  }

  const segmentKey = options.segment ?? "source";
  const segment = SEGMENTS[segmentKey];
  const groups = new Map<string, OppFacts[]>();
  for (const f of facts) for (const key of segment.get(f)) groups.set(key, [...(groups.get(key) ?? []), f]);
  const segments = [...groups.entries()]
    .map(([key, list]) => ({ key, ...summarize(list) }))
    .filter((s) => s.applications > 0)
    .sort((a, b) => b.applications - a.applications);

  const byCategory = STAGE_CATEGORIES.map((c) => ({ category: c, label: STAGE_CATEGORY_META[c].label, count: facts.filter((f) => f.category === c).length }));

  const education = facts.filter((f) => f.family === "EDUCATION");
  const educationStats = {
    tracked: education.length,
    applications: education.filter((f) => f.appliedAt).length,
    admissions: education.filter((f) => reachedAtLeast(f, "OFFER")).length,
    accepted: education.filter((f) => f.reached.has("WON")).length,
    rejections: education.filter((f) => f.stageKey === "REJECTED").length,
    waiting: education.filter((f) => f.category === "APPLIED").length,
  };

  return {
    overall: summarize(facts),
    months,
    segmentKey,
    segmentLabel: segment.label,
    segments,
    byCategory,
    education: educationStats,
    funnel: [
      { key: "applications", label: "Applications sent" },
      { key: "responses", label: "Responses" },
      { key: "interviews", label: "Interviews" },
      { key: "offers", label: "Offers / admissions" },
      { key: "accepted", label: "Accepted" },
    ],
    totalTracked: facts.length,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard() {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = todayISO(tz);
  const facts = await loadFacts(tz);
  const monthPrefix = today.slice(0, 7);
  const lastMonthPrefix = addMonths(today, -1).slice(0, 7);
  const active = facts.filter((f) => !CLOSED_CATEGORIES.includes(f.category));

  const [opps] = await db
    .select({
      followUpsDue: sql<number>`count(*) filter (where ${opportunities.nextFollowUpAt} <= ${today} and not ${opportunities.followUpPaused} and ${pipelineStages.category} not in ('WON','LOST'))::int`,
      deadlinesSoon: sql<number>`count(*) filter (where ${opportunities.deadline} between ${today} and ${addDays(today, 7)} and ${pipelineStages.category} in ('BACKLOG','TO_APPLY','PREPARING'))::int`,
      overdueDeadlines: sql<number>`count(*) filter (where ${opportunities.deadline} < ${today} and ${opportunities.deadline} >= ${addDays(today, -30)} and ${pipelineStages.category} in ('BACKLOG','TO_APPLY','PREPARING'))::int`,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(and(isNull(opportunities.deletedAt), isNull(opportunities.archivedAt)));

  const [iv] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviews)
    .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
    .where(and(eq(interviews.status, "SCHEDULED"), gte(interviews.scheduledAt, new Date()), isNull(opportunities.deletedAt)));

  const recent = await db
    .select({ event: timelineEvents, opportunityTitle: opportunities.title, organizationName: organizations.name })
    .from(timelineEvents)
    .leftJoin(opportunities, eq(opportunities.id, timelineEvents.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(sql`${opportunities.deletedAt} is null`)
    .orderBy(desc(timelineEvents.occurredAt))
    .limit(12);

  const pipeline = STAGE_CATEGORIES.map((c) => ({
    category: c,
    label: STAGE_CATEGORY_META[c].label,
    jobs: facts.filter((f) => f.category === c && f.family === "JOB").length,
    education: facts.filter((f) => f.category === c && f.family === "EDUCATION").length,
  }));

  return {
    today,
    kpis: {
      active: active.length,
      appliedThisMonth: facts.filter((f) => f.appliedAt?.startsWith(monthPrefix)).length,
      appliedLastMonth: facts.filter((f) => f.appliedAt?.startsWith(lastMonthPrefix)).length,
      interviewsUpcoming: iv?.count ?? 0,
      followUpsDue: opps?.followUpsDue ?? 0,
      offers: facts.filter((f) => f.category === "OFFER" || f.category === "WON").length,
      rejections: facts.filter((f) => f.stageKey === "REJECTED").length,
      pending: facts.filter((f) => f.category === "APPLIED").length,
      deadlinesSoon: opps?.deadlinesSoon ?? 0,
      overdueDeadlines: opps?.overdueDeadlines ?? 0,
      jobsActive: active.filter((f) => f.family === "JOB").length,
      educationActive: active.filter((f) => f.family === "EDUCATION").length,
    },
    pipeline,
    recent,
    goals: await getGoalsProgress(facts, today),
    hasDemo: facts.some((f) => f.isDemo),
    total: facts.length,
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const GOAL_METRICS = {
  APPLICATIONS_SENT: "Applications sent",
  OPPORTUNITIES_ADDED: "Opportunities added",
  INTERVIEWS: "Interviews",
  FOLLOW_UPS: "Follow-ups sent",
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;

export const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  metric: z.enum(Object.keys(GOAL_METRICS) as [GoalMetric, ...GoalMetric[]]),
  target: z.number().int().min(1).max(10_000),
  period: z.enum(["WEEK", "MONTH", "QUARTER", "CUSTOM"]).default("MONTH"),
  filters: z
    .object({ family: z.enum(["JOB", "EDUCATION"]).optional(), types: z.array(z.string()).optional(), tags: z.array(z.string()).optional() })
    .default({}),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export function goalWindow(goal: Pick<Goal, "period" | "startDate" | "endDate">, today: ISODate): { from: ISODate; to: ISODate } {
  switch (goal.period) {
    case "WEEK": {
      const from = startOfWeek(today, 1);
      return { from, to: addDays(from, 6) };
    }
    case "QUARTER": {
      const month = Number(today.slice(5, 7));
      const qStart = `${today.slice(0, 4)}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
      return { from: qStart, to: addDays(addMonths(qStart, 3), -1) };
    }
    case "CUSTOM":
      return { from: goal.startDate ?? today, to: goal.endDate ?? today };
    default: {
      const from = startOfMonth(today);
      return { from, to: addDays(addMonths(from, 1), -1) };
    }
  }
}

async function getGoalsProgress(facts: OppFacts[], today: ISODate) {
  const rows = await db.select().from(goals).where(eq(goals.archived, false)).orderBy(goals.createdAt);
  const result = [];
  for (const goal of rows) {
    const { from, to } = goalWindow(goal, today);
    const f = goal.filters ?? {};
    const scoped = facts.filter(
      (x) => (!f.family || x.family === f.family) && (!f.types?.length || f.types.includes(x.type)) && (!f.tags?.length || x.tags.some((t) => f.tags!.map((y) => y.toLowerCase()).includes(t.toLowerCase()))),
    );
    let current = 0;
    if (goal.metric === "APPLICATIONS_SENT") current = scoped.filter((x) => x.appliedAt && x.appliedAt >= from && x.appliedAt <= to).length;
    else if (goal.metric === "OPPORTUNITIES_ADDED") current = scoped.filter((x) => x.createdDay >= from && x.createdDay <= to).length;
    else if (goal.metric === "INTERVIEWS") {
      const ids = scoped.map((s) => s.id);
      if (ids.length) {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(interviews)
          .where(and(inArray(interviews.opportunityId, ids), gte(interviews.scheduledAt, new Date(`${from}T00:00:00Z`)), lte(interviews.scheduledAt, new Date(`${to}T23:59:59Z`))));
        current = row?.count ?? 0;
      }
    } else if (goal.metric === "FOLLOW_UPS") {
      const ids = scoped.map((s) => s.id);
      if (ids.length) {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(timelineEvents)
          .where(
            and(
              eq(timelineEvents.type, "FOLLOW_UP_SENT"),
              inArray(timelineEvents.opportunityId, ids),
              gte(timelineEvents.occurredAt, new Date(`${from}T00:00:00Z`)),
              lte(timelineEvents.occurredAt, new Date(`${to}T23:59:59Z`)),
            ),
          );
        current = row?.count ?? 0;
      }
    }
    result.push({ goal, from, to, current, percent: Math.min(100, Math.round((current / goal.target) * 100)) });
  }
  return result;
}

export async function listGoals() {
  return db.select().from(goals).orderBy(goals.createdAt);
}

export async function createGoal(raw: z.input<typeof goalInputSchema>, ctx: Ctx) {
  const input = goalInputSchema.parse(raw);
  const [row] = await db.insert(goals).values(input).returning();
  await logAudit(db, { entityType: "settings", entityId: row.id, action: "CREATE_GOAL", summary: row.title }, ctx);
  return row;
}

export async function updateGoal(id: string, raw: Partial<z.input<typeof goalInputSchema>> & { archived?: boolean }, ctx: Ctx) {
  const input = goalInputSchema.partial().extend({ archived: z.boolean().optional() }).parse(raw);
  const [row] = await db.update(goals).set(input).where(eq(goals.id, id)).returning();
  if (!row) throw new AppError("NOT_FOUND", "Goal not found");
  await logAudit(db, { entityType: "settings", entityId: id, action: "UPDATE_GOAL", summary: row.title }, ctx);
  return row;
}

export async function deleteGoal(id: string, ctx: Ctx) {
  await db.delete(goals).where(eq(goals.id, id));
  await logAudit(db, { entityType: "settings", entityId: id, action: "DELETE_GOAL" }, ctx);
}
