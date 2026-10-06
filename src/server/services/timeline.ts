import { and, desc, eq } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { contacts, opportunities, timelineEvents, type TimelineEvent } from "@/server/db/schema";
import { timelineEventInputSchema, type TimelineEventInput } from "@/lib/schemas";
import { EVENT_TYPE_LABEL, type Channel, type EventType } from "@/lib/constants";
import { DEFAULT_TIMEZONE, maxISO, minISO, toISODate, zonedTimeToInstant } from "@/lib/dates";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";
import { getSettings } from "./settings";

export interface NewEvent {
  opportunityId?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  interviewId?: string | null;
  type: EventType;
  title: string;
  body?: string | null;
  occurredAt?: Date;
  channel?: Channel | string | null;
  direction?: "INBOUND" | "OUTBOUND" | null;
  metadata?: Record<string, unknown>;
  isDemo?: boolean;
}

export async function addEvent(tx: DBOrTx, event: NewEvent, ctx: Ctx): Promise<TimelineEvent> {
  const [row] = await tx
    .insert(timelineEvents)
    .values({
      opportunityId: event.opportunityId ?? null,
      organizationId: event.organizationId ?? null,
      contactId: event.contactId ?? null,
      interviewId: event.interviewId ?? null,
      type: event.type,
      title: event.title,
      body: event.body ?? null,
      occurredAt: event.occurredAt ?? new Date(),
      channel: event.channel ?? null,
      direction: event.direction ?? null,
      actor: ctx.actor,
      metadata: event.metadata ?? {},
      isDemo: event.isDemo ?? false,
    })
    .returning();
  return row;
}

/** A date-only value ("2026-10-06") becomes noon in the user's timezone to keep ordering sensible. */
export function parseOccurredAt(value: string | null | undefined, timeZone: string = DEFAULT_TIMEZONE): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return zonedTimeToInstant(value, "12:00", timeZone);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const RESPONSE_TYPES = new Set<EventType>(["EMAIL", "MESSAGE", "CALL", "MEETING", "RESPONSE_RECEIVED"]);

/**
 * Log a communication / note. Inbound responses update the opportunity's first response and last contact dates;
 * outbound messages update the last contact date.
 */
export async function logCommunication(raw: TimelineEventInput, ctx: Ctx) {
  const input = timelineEventInputSchema.parse(raw);
  const settings = await getSettings();
  const tz = settings.general.timezone;
  return db.transaction(async (tx) => {
    const occurredAt = parseOccurredAt(input.occurredAt, tz);
    const day = toISODate(occurredAt, tz);
    const organizationId = input.organizationId ?? null;
    if (input.opportunityId) {
      const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId));
      if (!opp) throw notFound("Opportunity");
      const updates: Partial<typeof opportunities.$inferInsert> = {};
      if (input.direction === "INBOUND" && RESPONSE_TYPES.has(input.type) && input.countsAsResponse !== false) {
        updates.firstResponseAt = minISO(opp.firstResponseAt, day) ?? day;
        updates.lastContactAt = maxISO(opp.lastContactAt, day) ?? day;
      } else if (input.direction === "OUTBOUND") {
        updates.lastContactAt = maxISO(opp.lastContactAt, day) ?? day;
      }
      if (Object.keys(updates).length) await tx.update(opportunities).set(updates).where(eq(opportunities.id, opp.id));
    }
    if (input.contactId && input.type !== "NOTE") {
      const [contact] = await tx.select().from(contacts).where(eq(contacts.id, input.contactId));
      if (contact) {
        await tx
          .update(contacts)
          .set({ lastContactAt: maxISO(contact.lastContactAt, day) ?? day })
          .where(eq(contacts.id, contact.id));
      }
    }
    const event = await addEvent(
      tx,
      {
        opportunityId: input.opportunityId ?? null,
        organizationId,
        contactId: input.contactId ?? null,
        type: input.type,
        title: input.title?.trim() || EVENT_TYPE_LABEL[input.type],
        body: input.body ?? null,
        occurredAt,
        channel: input.channel ?? null,
        direction: input.direction ?? null,
      },
      ctx,
    );
    if (input.opportunityId) {
      await logAudit(tx, { entityType: "opportunity", entityId: input.opportunityId, action: "LOG_EVENT", summary: event.title }, ctx);
    }
    return event;
  });
}

export async function listEvents(filter: { opportunityId?: string; contactId?: string; organizationId?: string; limit?: number }) {
  return db
    .select()
    .from(timelineEvents)
    .where(
      and(
        filter.opportunityId ? eq(timelineEvents.opportunityId, filter.opportunityId) : undefined,
        filter.contactId ? eq(timelineEvents.contactId, filter.contactId) : undefined,
        filter.organizationId ? eq(timelineEvents.organizationId, filter.organizationId) : undefined,
      ),
    )
    .orderBy(desc(timelineEvents.occurredAt))
    .limit(filter.limit ?? 200);
}

export async function updateEvent(id: string, patch: { title?: string; body?: string | null; occurredAt?: string | null }, ctx: Ctx) {
  const [row] = await db
    .update(timelineEvents)
    .set({
      title: patch.title?.trim() || undefined,
      body: patch.body === undefined ? undefined : patch.body,
      occurredAt: patch.occurredAt ? parseOccurredAt(patch.occurredAt) : undefined,
    })
    .where(eq(timelineEvents.id, id))
    .returning();
  if (!row) throw notFound("Event");
  if (row.opportunityId) await logAudit(db, { entityType: "opportunity", entityId: row.opportunityId, action: "EDIT_EVENT", summary: row.title }, ctx);
  return row;
}

export async function deleteEvent(id: string, ctx: Ctx) {
  const [row] = await db.delete(timelineEvents).where(eq(timelineEvents.id, id)).returning();
  if (!row) throw notFound("Event");
  if (row.opportunityId) await logAudit(db, { entityType: "opportunity", entityId: row.opportunityId, action: "DELETE_EVENT", summary: row.title }, ctx);
  return row;
}
