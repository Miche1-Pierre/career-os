import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { opportunities, organizations, pipelineStages, tasks, type Opportunity, type Task } from "@/server/db/schema";
import { taskInputSchema, taskPatchSchema, type TaskInput } from "@/lib/schemas";
import type { DocumentKind, TaskKind } from "@/lib/constants";
import { DOCUMENT_KIND_META } from "@/lib/constants";
import type { AppSettings, ChecklistTemplateItem } from "@/lib/settings-schema";
import { normalizeText } from "@/lib/text";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";

// ---------------------------------------------------------------------------
// Required documents → document roles (deterministic keyword mapping, FR + EN)
// ---------------------------------------------------------------------------

const DOC_ROLE_PATTERNS: [DocumentKind, RegExp][] = [
  ["CV", /\b(cv|curriculum|resume|résumé)\b/],
  ["COVER_LETTER", /(lettre de motivation|cover letter|motivation letter|letter of motivation|statement of purpose|personal statement|research statement|lettre de candidature)/],
  ["RECOMMENDATION", /(recommand|recommendation|reference letter|letters? of reference|referee)/],
  ["TRANSCRIPT", /(releve|transcript|bulletin|notes? (de|des) (licence|semestre|l[123]|m1)|grades)/],
  ["LANGUAGE_CERT", /(toefl|ielts|toeic|cambridge|dele|goethe|delf|dalf|tcf|language certificate|certificat de langue|niveau de langue|english test)/],
  ["DIPLOMA", /(diplome|diploma|degree certificate|attestation de reussite)/],
  ["PORTFOLIO", /(portfolio|github|book)/],
  ["ID_DOCUMENT", /(passport|passeport|carte d.identite|identity|id card|piece d.identite)/],
  ["CERTIFICATE", /(certificat|certificate|attestation)/],
  ["PRESENTATION", /(presentation|slides|pitch)/],
];

export function documentRoleFor(text: string): DocumentKind | null {
  const t = normalizeText(text);
  for (const [role, re] of DOC_ROLE_PATTERNS) if (re.test(t)) return role;
  return null;
}

function templateItemApplies(item: ChecklistTemplateItem, opp: Pick<Opportunity, "details" | "requiredDocuments">): boolean {
  if (!item.when) return true;
  const path = item.when.replace(/^details\./, "");
  const value = (opp.details as Record<string, unknown>)[path];
  if (value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)) return true;
  // Also true when the requirement shows up in the required documents.
  const role = item.autoRule?.startsWith("doc:") ? item.autoRule.slice(4) : null;
  return !!role && (opp.requiredDocuments ?? []).some((d) => documentRoleFor(d) === role);
}

/** Creates checklist tasks from the template of the type + required documents (deduplicated by role). */
export async function applyChecklist(
  tx: DBOrTx,
  opp: Pick<Opportunity, "id" | "type" | "details" | "requiredDocuments" | "isDemo">,
  settings: AppSettings,
  ctx: Ctx,
) {
  const template = (settings.templates[opp.type] ?? []).filter((item) => templateItemApplies(item, opp));
  const rows: (typeof tasks.$inferInsert)[] = [];
  const rolesCovered = new Set(template.filter((t) => t.autoRule?.startsWith("doc:")).map((t) => t.autoRule!.slice(4)));
  template.forEach((item, index) => {
    rows.push({
      opportunityId: opp.id,
      title: item.title,
      kind: item.kind,
      autoRule: item.autoRule,
      position: index * 10,
      origin: "TEMPLATE",
      isDemo: opp.isDemo,
    });
  });
  let position = rows.length * 10;
  const seenTitles = new Set(rows.map((r) => normalizeText(r.title)));
  for (const doc of opp.requiredDocuments ?? []) {
    const role = documentRoleFor(doc);
    if (role && rolesCovered.has(role)) continue;
    const title = role ? `${DOCUMENT_KIND_META[role].label}: ${doc}`.slice(0, 300) : doc.slice(0, 300);
    if (seenTitles.has(normalizeText(title))) continue;
    seenTitles.add(normalizeText(title));
    if (role) rolesCovered.add(role);
    // Insert required documents before "Submit application".
    const submitIndex = rows.findIndex((r) => r.autoRule === "status:APPLIED");
    const row = {
      opportunityId: opp.id,
      title,
      kind: "DOCUMENT" as TaskKind,
      autoRule: role ? `doc:${role}` : null,
      position: submitIndex >= 0 ? (rows[submitIndex].position ?? 0) - 5 : (position += 10),
      origin: (ctx.actor === "USER" ? "TEMPLATE" : ctx.actor) as Task["origin"],
      isDemo: opp.isDemo,
    };
    rows.push(row);
  }
  if (rows.length) await tx.insert(tasks).values(rows);
  return rows.length;
}

/** Marks open tasks with the given auto-rule as done (e.g. doc:CV when a CV is attached). */
export async function completeAutoRule(tx: DBOrTx, opportunityId: string, rule: string) {
  const done = await tx
    .update(tasks)
    .set({ done: true, doneAt: new Date() })
    .where(and(eq(tasks.opportunityId, opportunityId), eq(tasks.autoRule, rule), eq(tasks.done, false)))
    .returning({ id: tasks.id });
  return done.length;
}

/** Creates a task once per idempotency key (automation rules). */
export async function ensureRuleTask(tx: DBOrTx, ruleKey: string, task: Omit<typeof tasks.$inferInsert, "ruleKey" | "origin">) {
  const inserted = await tx
    .insert(tasks)
    .values({ ...task, ruleKey, origin: "RULE" })
    .onConflictDoNothing()
    .returning({ id: tasks.id });
  return inserted.length > 0;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface TaskListItem extends Task {
  opportunityTitle: string | null;
  organizationName: string | null;
  opportunityType: string | null;
  opportunityClosed: boolean;
}

export async function listTasks(filter: { opportunityId?: string; status?: "open" | "done" | "all"; dueBefore?: string; includeUndated?: boolean; limit?: number } = {}) {
  const status = filter.status ?? "open";
  const rows = await db
    .select({
      task: tasks,
      opportunityTitle: opportunities.title,
      organizationName: organizations.name,
      opportunityType: opportunities.type,
      category: pipelineStages.category,
      oppDeleted: opportunities.deletedAt,
      oppArchived: opportunities.archivedAt,
    })
    .from(tasks)
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(
      and(
        filter.opportunityId ? eq(tasks.opportunityId, filter.opportunityId) : undefined,
        status === "open" ? eq(tasks.done, false) : status === "done" ? eq(tasks.done, true) : undefined,
        filter.dueBefore
          ? filter.includeUndated
            ? or(lte(tasks.dueDate, filter.dueBefore), isNull(tasks.dueDate))
            : lte(tasks.dueDate, filter.dueBefore)
          : undefined,
        isNull(opportunities.deletedAt),
      ),
    )
    .orderBy(asc(tasks.done), sql`${tasks.dueDate} asc nulls last`, asc(tasks.position), desc(tasks.createdAt))
    .limit(filter.limit ?? 1000);
  return rows.map(
    (r): TaskListItem => ({
      ...r.task,
      opportunityTitle: r.opportunityTitle,
      organizationName: r.organizationName,
      opportunityType: r.opportunityType,
      opportunityClosed: r.category === "WON" || r.category === "LOST" || !!r.oppArchived,
    }),
  );
}

export async function createTask(raw: TaskInput, ctx: Ctx) {
  const input = taskInputSchema.parse(raw);
  let position = 0;
  if (input.opportunityId) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${tasks.position}), 0)::int` })
      .from(tasks)
      .where(eq(tasks.opportunityId, input.opportunityId));
    position = (max ?? 0) + 10;
  }
  const [row] = await db
    .insert(tasks)
    .values({
      ...input,
      position,
      done: input.done ?? false,
      doneAt: input.done ? new Date() : null,
      origin: ctx.actor === "USER" ? "USER" : ctx.actor,
    })
    .returning();
  await logAudit(db, { entityType: "task", entityId: row.id, action: "CREATE", summary: row.title }, ctx);
  return row;
}

export async function updateTask(id: string, raw: Partial<TaskInput>, ctx: Ctx) {
  const patch = taskPatchSchema.parse(raw);
  const values: Partial<typeof tasks.$inferInsert> = { ...patch };
  if (patch.done !== undefined) values.doneAt = patch.done ? new Date() : null;
  const [row] = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning();
  if (!row) throw notFound("Task");
  await logAudit(db, { entityType: "task", entityId: id, action: patch.done === true ? "COMPLETE" : "UPDATE", summary: row.title }, ctx);
  return row;
}

export async function setTaskDone(id: string, done: boolean, ctx: Ctx) {
  return updateTask(id, { done }, ctx);
}

export async function deleteTask(id: string, ctx: Ctx) {
  const [row] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!row) throw notFound("Task");
  await logAudit(db, { entityType: "task", entityId: id, action: "DELETE", summary: row.title }, ctx);
  return row;
}

export async function reorderTasks(opportunityId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(tasks).set({ position: index * 10 }).where(and(eq(tasks.id, id), eq(tasks.opportunityId, opportunityId)));
    }
  });
}

export async function tasksForOpportunities(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(tasks).where(inArray(tasks.opportunityId, ids));
}
