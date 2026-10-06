import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import {
  contacts,
  interviews,
  opportunities,
  organizations,
  pipelineStages,
  timelineEvents,
  type Organization,
} from "@/server/db/schema";
import { organizationInputSchema, organizationPatchSchema, type OrganizationInput } from "@/lib/schemas";
import type { OrgKind } from "@/lib/constants";
import { normalizeOrgName } from "@/lib/text";
import { normalizedContains } from "@/server/db/sql-helpers";
import { notFound, type Ctx } from "@/server/context";
import { diffFields, logAudit } from "./audit";
import { canonicalizeTags } from "./tags";

export interface OrganizationListItem extends Organization {
  opportunityCount: number;
  activeOpportunityCount: number;
  contactCount: number;
  lastActivityAt: Date | null;
}

export async function listOrganizations(filters: { kind?: OrgKind; q?: string; includeArchived?: boolean; deleted?: boolean } = {}) {
  const conditions = [
    filters.deleted ? isNotNull(organizations.deletedAt) : isNull(organizations.deletedAt),
    filters.kind ? eq(organizations.kind, filters.kind) : undefined,
    filters.includeArchived || filters.deleted ? undefined : isNull(organizations.archivedAt),
    filters.q ? normalizedContains(organizations.name, filters.q) : undefined,
  ];
  const rows = await db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(asc(organizations.name));
  if (!rows.length) return [] as OrganizationListItem[];
  const ids = rows.map((r) => r.id);
  const oppCounts = await db
    .select({
      organizationId: opportunities.organizationId,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${pipelineStages.category} not in ('WON','LOST') and ${opportunities.archivedAt} is null)::int`,
      lastUpdate: sql<Date | null>`max(${opportunities.updatedAt})`,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(and(inArray(opportunities.organizationId, ids), isNull(opportunities.deletedAt)))
    .groupBy(opportunities.organizationId);
  const contactCounts = await db
    .select({ organizationId: contacts.organizationId, total: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(inArray(contacts.organizationId, ids), isNull(contacts.deletedAt)))
    .groupBy(contacts.organizationId);
  const oppMap = new Map(oppCounts.map((c) => [c.organizationId, c]));
  const contactMap = new Map(contactCounts.map((c) => [c.organizationId, c.total]));
  return rows.map((r) => {
    const o = oppMap.get(r.id);
    const last = o?.lastUpdate ? new Date(o.lastUpdate) : null;
    return {
      ...r,
      opportunityCount: o?.total ?? 0,
      activeOpportunityCount: o?.active ?? 0,
      contactCount: contactMap.get(r.id) ?? 0,
      lastActivityAt: last && last > r.updatedAt ? last : r.updatedAt,
    };
  });
}

export async function getOrganization(id: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!org) throw notFound("Organization");
  const [opps, orgContacts, events, orgInterviews] = await Promise.all([
    db
      .select({ opportunity: opportunities, stage: pipelineStages })
      .from(opportunities)
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .where(and(eq(opportunities.organizationId, id), isNull(opportunities.deletedAt)))
      .orderBy(desc(opportunities.updatedAt)),
    db.select().from(contacts).where(and(eq(contacts.organizationId, id), isNull(contacts.deletedAt))).orderBy(asc(contacts.fullName)),
    db
      .select({ event: timelineEvents, opportunityTitle: opportunities.title })
      .from(timelineEvents)
      .leftJoin(opportunities, eq(opportunities.id, timelineEvents.opportunityId))
      .where(sql`${timelineEvents.organizationId} = ${id} or ${opportunities.organizationId} = ${id}`)
      .orderBy(desc(timelineEvents.occurredAt))
      .limit(200),
    db
      .select({ interview: interviews, opportunityTitle: opportunities.title })
      .from(interviews)
      .innerJoin(opportunities, eq(opportunities.id, interviews.opportunityId))
      .where(and(eq(opportunities.organizationId, id), isNull(opportunities.deletedAt)))
      .orderBy(desc(interviews.scheduledAt)),
  ]);
  return { organization: org, opportunities: opps, contacts: orgContacts, events, interviews: orgInterviews };
}

export async function createOrganization(raw: OrganizationInput, ctx: Ctx, tx: DBOrTx = db) {
  const input = organizationInputSchema.parse(raw);
  const tagList = await canonicalizeTags(tx, input.tags);
  const [row] = await tx
    .insert(organizations)
    .values({ ...input, tags: tagList })
    .returning();
  await logAudit(tx, { entityType: "organization", entityId: row.id, action: "CREATE", summary: row.name }, ctx);
  return row;
}

export async function updateOrganization(id: string, raw: Partial<OrganizationInput>, ctx: Ctx) {
  const patch = organizationPatchSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(organizations).where(eq(organizations.id, id));
    if (!before) throw notFound("Organization");
    const values: Partial<typeof organizations.$inferInsert> = { ...patch };
    if (patch.tags) values.tags = await canonicalizeTags(tx, patch.tags);
    const [row] = await tx.update(organizations).set(values).where(eq(organizations.id, id)).returning();
    const changes = diffFields(before, row, Object.keys(patch));
    if (changes.length) await logAudit(tx, { entityType: "organization", entityId: id, action: "UPDATE", changes }, ctx);
    return row;
  });
}

export async function setOrganizationArchived(id: string, archived: boolean, ctx: Ctx) {
  const [row] = await db
    .update(organizations)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(organizations.id, id))
    .returning();
  if (!row) throw notFound("Organization");
  await logAudit(db, { entityType: "organization", entityId: id, action: archived ? "ARCHIVE" : "UNARCHIVE" }, ctx);
  return row;
}

export async function softDeleteOrganization(id: string, ctx: Ctx) {
  const [row] = await db.update(organizations).set({ deletedAt: new Date() }).where(eq(organizations.id, id)).returning();
  if (!row) throw notFound("Organization");
  await logAudit(db, { entityType: "organization", entityId: id, action: "DELETE", summary: row.name }, ctx);
  return row;
}

export async function restoreOrganization(id: string, ctx: Ctx) {
  const [row] = await db.update(organizations).set({ deletedAt: null }).where(eq(organizations.id, id)).returning();
  if (!row) throw notFound("Organization");
  await logAudit(db, { entityType: "organization", entityId: id, action: "RESTORE", summary: row.name }, ctx);
  return row;
}

export async function hardDeleteOrganization(id: string, ctx: Ctx) {
  await db.delete(organizations).where(eq(organizations.id, id));
  await logAudit(db, { entityType: "organization", entityId: id, action: "PURGE" }, ctx);
}

/** Find an organization by (normalized) name, preferring the same kind; create it when missing. */
export async function findOrCreateOrganization(
  tx: DBOrTx,
  input: { name: string; kind: OrgKind; website?: string | null; industry?: string | null; city?: string | null; country?: string | null },
  ctx: Ctx,
): Promise<Organization> {
  const existing = await findOrganizationByName(tx, input.name, input.kind);
  if (existing) {
    // Complete missing facts without overwriting user data.
    const fill: Partial<typeof organizations.$inferInsert> = {};
    if (!existing.website && input.website) fill.website = input.website;
    if (!existing.industry && input.industry) fill.industry = input.industry;
    if (!existing.city && input.city) fill.city = input.city;
    if (!existing.country && input.country) fill.country = input.country;
    if (existing.deletedAt) fill.deletedAt = null;
    if (Object.keys(fill).length) {
      const [row] = await tx.update(organizations).set(fill).where(eq(organizations.id, existing.id)).returning();
      return row;
    }
    return existing;
  }
  return createOrganization(
    {
      kind: input.kind,
      name: input.name.trim(),
      website: input.website ?? null,
      industry: input.industry ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
    },
    ctx,
    tx,
  );
}

export async function findOrganizationByName(tx: DBOrTx, name: string, kind?: OrgKind): Promise<Organization | null> {
  const target = normalizeOrgName(name);
  if (!target) return null;
  const firstWord = target.split(" ")[0];
  const candidates = await tx
    .select()
    .from(organizations)
    .where(normalizedContains(organizations.name, firstWord))
    .limit(200);
  const matches = candidates.filter((c) => normalizeOrgName(c.name) === target);
  if (!matches.length) return null;
  const alive = matches.filter((m) => !m.deletedAt);
  const pool = alive.length ? alive : matches;
  return pool.find((m) => m.kind === kind) ?? pool[0];
}
