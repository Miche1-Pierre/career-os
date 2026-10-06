import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import {
  contacts,
  opportunities,
  opportunityContacts,
  organizations,
  pipelineStages,
  timelineEvents,
  type Contact,
} from "@/server/db/schema";
import { contactInputSchema, contactPatchSchema, type ContactInput, type OpportunityContactRef } from "@/lib/schemas";
import type { OrgKind } from "@/lib/constants";
import { normalizeText } from "@/lib/text";
import { normalizedContains } from "@/server/db/sql-helpers";
import { notFound, type Ctx } from "@/server/context";
import { diffFields, logAudit } from "./audit";
import { findOrCreateOrganization } from "./organizations";
import { canonicalizeTags } from "./tags";

export interface ContactListItem extends Contact {
  organizationName: string | null;
  opportunityCount: number;
}

export async function listContacts(filters: { q?: string; organizationId?: string; relationship?: string; deleted?: boolean } = {}) {
  const conditions = [
    filters.deleted ? isNotNull(contacts.deletedAt) : isNull(contacts.deletedAt),
    filters.organizationId ? eq(contacts.organizationId, filters.organizationId) : undefined,
    filters.relationship ? eq(contacts.relationship, filters.relationship as Contact["relationship"] & string) : undefined,
    filters.q
      ? sql`(${normalizedContains(contacts.fullName, filters.q)} or ${normalizedContains(contacts.email, filters.q)} or ${normalizedContains(organizations.name, filters.q)} or ${normalizedContains(contacts.role, filters.q)})`
      : undefined,
  ];
  const rows = await db
    .select({ contact: contacts, organizationName: organizations.name })
    .from(contacts)
    .leftJoin(organizations, eq(organizations.id, contacts.organizationId))
    .where(and(...conditions))
    .orderBy(asc(contacts.fullName));
  if (!rows.length) return [] as ContactListItem[];
  const counts = await db
    .select({ contactId: opportunityContacts.contactId, count: sql<number>`count(*)::int` })
    .from(opportunityContacts)
    .where(inArray(opportunityContacts.contactId, rows.map((r) => r.contact.id)))
    .groupBy(opportunityContacts.contactId);
  const countMap = new Map(counts.map((c) => [c.contactId, c.count]));
  return rows.map((r) => ({ ...r.contact, organizationName: r.organizationName, opportunityCount: countMap.get(r.contact.id) ?? 0 }));
}

export async function getContact(id: string) {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, id), with: { organization: true } });
  if (!contact) throw notFound("Contact");
  const [links, events] = await Promise.all([
    db
      .select({ role: opportunityContacts.role, opportunity: opportunities, stage: pipelineStages, organizationName: organizations.name })
      .from(opportunityContacts)
      .innerJoin(opportunities, eq(opportunities.id, opportunityContacts.opportunityId))
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
      .where(and(eq(opportunityContacts.contactId, id), isNull(opportunities.deletedAt)))
      .orderBy(desc(opportunities.updatedAt)),
    db
      .select({ event: timelineEvents, opportunityTitle: opportunities.title })
      .from(timelineEvents)
      .leftJoin(opportunities, eq(opportunities.id, timelineEvents.opportunityId))
      .where(eq(timelineEvents.contactId, id))
      .orderBy(desc(timelineEvents.occurredAt))
      .limit(200),
  ]);
  return { contact, opportunities: links, events };
}

async function resolveOrgId(tx: DBOrTx, input: { organizationId?: string | null; organizationName?: string | null }, kind: OrgKind, ctx: Ctx) {
  if (input.organizationId) return input.organizationId;
  if (input.organizationName) return (await findOrCreateOrganization(tx, { name: input.organizationName, kind }, ctx)).id;
  return input.organizationId === null ? null : undefined;
}

export async function createContact(raw: ContactInput, ctx: Ctx, tx: DBOrTx = db, orgKind: OrgKind = "COMPANY") {
  const input = contactInputSchema.parse(raw);
  const organizationId = (await resolveOrgId(tx, input, orgKind, ctx)) ?? null;
  const { organizationName: _ignored, ...rest } = input;
  void _ignored;
  const [row] = await tx
    .insert(contacts)
    .values({ ...rest, organizationId, tags: await canonicalizeTags(tx, input.tags) })
    .returning();
  await logAudit(tx, { entityType: "contact", entityId: row.id, action: "CREATE", summary: row.fullName }, ctx);
  return row;
}

export async function updateContact(id: string, raw: Partial<ContactInput>, ctx: Ctx) {
  const patch = contactPatchSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(contacts).where(eq(contacts.id, id));
    if (!before) throw notFound("Contact");
    const { organizationName, ...rest } = patch;
    const values: Partial<typeof contacts.$inferInsert> = { ...rest };
    const orgId = await resolveOrgId(tx, { organizationId: patch.organizationId, organizationName }, "COMPANY", ctx);
    if (orgId !== undefined) values.organizationId = orgId;
    if (patch.tags) values.tags = await canonicalizeTags(tx, patch.tags);
    const [row] = await tx.update(contacts).set(values).where(eq(contacts.id, id)).returning();
    const changes = diffFields(before, row, Object.keys(values));
    if (changes.length) await logAudit(tx, { entityType: "contact", entityId: id, action: "UPDATE", changes }, ctx);
    return row;
  });
}

export async function softDeleteContact(id: string, ctx: Ctx) {
  const [row] = await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, id)).returning();
  if (!row) throw notFound("Contact");
  await logAudit(db, { entityType: "contact", entityId: id, action: "DELETE", summary: row.fullName }, ctx);
  return row;
}

export async function restoreContact(id: string, ctx: Ctx) {
  const [row] = await db.update(contacts).set({ deletedAt: null }).where(eq(contacts.id, id)).returning();
  if (!row) throw notFound("Contact");
  await logAudit(db, { entityType: "contact", entityId: id, action: "RESTORE", summary: row.fullName }, ctx);
  return row;
}

export async function hardDeleteContact(id: string, ctx: Ctx) {
  await db.delete(contacts).where(eq(contacts.id, id));
  await logAudit(db, { entityType: "contact", entityId: id, action: "PURGE" }, ctx);
}

/**
 * Find a contact by id, email or name (+ organization), completing missing fields; create it otherwise.
 */
export async function upsertContactFromRef(
  tx: DBOrTx,
  ref: OpportunityContactRef,
  context: { organizationId?: string | null },
  ctx: Ctx,
): Promise<Contact | null> {
  if (ref.contactId) {
    const [row] = await tx.select().from(contacts).where(eq(contacts.id, ref.contactId));
    return row ?? null;
  }
  const fullName = ref.fullName?.trim();
  const email = ref.email?.trim() || null;
  if (!fullName && !email) return null;
  let existing: Contact | undefined;
  if (email) {
    [existing] = await tx
      .select()
      .from(contacts)
      .where(and(sql`lower(${contacts.email}) = lower(${email})`, isNull(contacts.deletedAt)))
      .limit(1);
  }
  if (!existing && fullName) {
    const candidates = await tx
      .select()
      .from(contacts)
      .where(and(normalizedContains(contacts.fullName, fullName), isNull(contacts.deletedAt)))
      .limit(20);
    existing = candidates.find(
      (c) => normalizeText(c.fullName) === normalizeText(fullName) && (!context.organizationId || !c.organizationId || c.organizationId === context.organizationId),
    );
  }
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  const validLinkedin = ref.linkedinUrl && /^https?:\/\//i.test(ref.linkedinUrl) ? ref.linkedinUrl : null;
  if (existing) {
    const fill: Partial<typeof contacts.$inferInsert> = {};
    if (!existing.email && validEmail) fill.email = validEmail;
    if (!existing.phone && ref.phone) fill.phone = ref.phone;
    if (!existing.role && ref.role) fill.role = ref.role;
    if (!existing.linkedinUrl && validLinkedin) fill.linkedinUrl = validLinkedin;
    if (!existing.relationship && ref.relationship) fill.relationship = ref.relationship;
    if (!existing.organizationId && context.organizationId) fill.organizationId = context.organizationId;
    if (Object.keys(fill).length) {
      const [row] = await tx.update(contacts).set(fill).where(eq(contacts.id, existing.id)).returning();
      return row;
    }
    return existing;
  }
  return createContact(
    {
      fullName: fullName || (validEmail ?? "Unknown contact"),
      organizationId: context.organizationId ?? null,
      role: ref.role ?? null,
      email: validEmail,
      phone: ref.phone ?? null,
      linkedinUrl: validLinkedin,
      relationship: ref.relationship ?? null,
    },
    ctx,
    tx,
  );
}

export async function linkContactToOpportunity(tx: DBOrTx, opportunityId: string, contactId: string, role: string | null | undefined) {
  await tx
    .insert(opportunityContacts)
    .values({ opportunityId, contactId, role: role ?? null })
    .onConflictDoUpdate({
      target: [opportunityContacts.opportunityId, opportunityContacts.contactId],
      set: { role: sql`coalesce(excluded.role, ${opportunityContacts.role})` },
    });
}

export async function unlinkContactFromOpportunity(opportunityId: string, contactId: string, ctx: Ctx) {
  await db
    .delete(opportunityContacts)
    .where(and(eq(opportunityContacts.opportunityId, opportunityId), eq(opportunityContacts.contactId, contactId)));
  await logAudit(db, { entityType: "opportunity", entityId: opportunityId, action: "UNLINK_CONTACT", summary: contactId }, ctx);
}

export async function addContactToOpportunity(opportunityId: string, ref: OpportunityContactRef, ctx: Ctx) {
  return db.transaction(async (tx) => {
    const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) throw notFound("Opportunity");
    const contact = await upsertContactFromRef(tx, ref, { organizationId: opp.organizationId }, ctx);
    if (!contact) throw notFound("Contact");
    await linkContactToOpportunity(tx, opportunityId, contact.id, ref.opportunityRole ?? ref.role ?? null);
    await logAudit(tx, { entityType: "opportunity", entityId: opportunityId, action: "LINK_CONTACT", summary: contact.fullName }, ctx);
    return contact;
  });
}
