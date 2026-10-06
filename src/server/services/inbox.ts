import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { inboxItems, opportunities, organizations, pipelineStages, tags as tagsTable, type InboxItem } from "@/server/db/schema";
import { captureAnalysisLenientSchema, type CaptureAnalysis, type StoredCaptureResult } from "@/lib/capture-schema";
import { CHANNELS, EVENT_TYPES, INTERVIEW_KINDS, PRIORITIES, familyOf, type InboxKind } from "@/lib/constants";
import { opportunityContactRefSchema, opportunityInputSchema, contactInputSchema, type OpportunityInput } from "@/lib/schemas";
import { todayISO, zonedTimeToInstant, isISODate } from "@/lib/dates";
import { truncate } from "@/lib/text";
import { AppError, notFound, type Ctx } from "@/server/context";
import { buildCapture, MAX_AI_CHARS, type CaptureInput } from "@/server/capture";
import { extractJsonLdHints } from "@/server/capture/jsonld";
import { aiStatus, generateStructured } from "@/server/ai";
import { captureSystemPrompt, capturePrompt, captureTask } from "@/server/ai/prompts";
import { verifyCaptureAnalysis } from "@/server/ai/verify";
import { logAudit } from "./audit";
import { getSettings } from "./settings";
import { listStages } from "./stages";
import { createOpportunity, changeStatus, updateOpportunity, getOpportunity } from "./opportunities";
import { createContact, linkContactToOpportunity, upsertContactFromRef } from "./contacts";
import { logCommunication } from "./timeline";
import { createInterview } from "./interviews";
import { createTask } from "./tasks";
import { markFollowUpDone, scheduleFollowUp } from "./followups";
import { enqueueAnalysis } from "@/server/jobs";

const ACTIVE_STATUSES = ["NEW", "QUEUED", "PROCESSING", "READY", "FAILED"] as const;

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export async function createCapture(input: CaptureInput, ctx: Ctx, options: { analyze?: boolean } = {}) {
  const built = await buildCapture(input);
  const [existing] = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.contentHash, built.contentHash), ne(inboxItems.status, "ARCHIVED")))
    .orderBy(desc(inboxItems.createdAt))
    .limit(1);
  if (existing) {
    return { item: existing, duplicate: true as const };
  }
  const [item] = await db
    .insert(inboxItems)
    .values({
      status: "NEW",
      kind: built.kindHint,
      title: built.title,
      sourceType: built.sourceType,
      sourceUrl: built.sourceUrl,
      fileName: built.fileName,
      mimeType: built.mimeType,
      rawText: built.rawText,
      contentHash: built.contentHash,
      extras: built.extras,
    })
    .returning();
  await logAudit(db, { entityType: "inbox", entityId: item.id, action: "CAPTURE", summary: truncate(item.title ?? "", 120) }, ctx);
  const settings = await getSettings();
  const shouldAnalyze = options.analyze ?? settings.ai.autoAnalyzeCaptures;
  if (shouldAnalyze && (await aiStatus()).available) {
    await enqueueAnalysis(item.id);
    return { item: { ...item, status: "QUEUED" as const }, duplicate: false as const };
  }
  return { item, duplicate: false as const };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listInbox(filter: { view?: "active" | "converted" | "archived" | "all"; limit?: number } = {}) {
  const view = filter.view ?? "active";
  const condition =
    view === "active"
      ? inArray(inboxItems.status, [...ACTIVE_STATUSES])
      : view === "converted"
        ? eq(inboxItems.status, "CONVERTED")
        : view === "archived"
          ? eq(inboxItems.status, "ARCHIVED")
          : undefined;
  return db
    .select({
      id: inboxItems.id,
      status: inboxItems.status,
      kind: inboxItems.kind,
      title: inboxItems.title,
      sourceType: inboxItems.sourceType,
      sourceUrl: inboxItems.sourceUrl,
      fileName: inboxItems.fileName,
      preview: sql<string>`left(${inboxItems.rawText}, 280)`,
      error: inboxItems.error,
      resultMeta: inboxItems.resultMeta,
      convertedType: inboxItems.convertedType,
      convertedId: inboxItems.convertedId,
      createdAt: inboxItems.createdAt,
      updatedAt: inboxItems.updatedAt,
      isDemo: inboxItems.isDemo,
    })
    .from(inboxItems)
    .where(condition)
    .orderBy(desc(inboxItems.createdAt))
    .limit(filter.limit ?? 200);
}

export async function getInboxItem(id: string): Promise<InboxItem> {
  const [item] = await db.select().from(inboxItems).where(eq(inboxItems.id, id));
  if (!item) throw notFound("Inbox item");
  return item;
}

export async function updateInboxItem(id: string, patch: { title?: string | null; rawText?: string }, ctx: Ctx) {
  const [row] = await db
    .update(inboxItems)
    .set({ title: patch.title === undefined ? undefined : patch.title, rawText: patch.rawText })
    .where(eq(inboxItems.id, id))
    .returning();
  if (!row) throw notFound("Inbox item");
  await logAudit(db, { entityType: "inbox", entityId: id, action: "UPDATE" }, ctx);
  return row;
}

export async function setInboxArchived(id: string, archived: boolean, ctx: Ctx) {
  const item = await getInboxItem(id);
  const status = archived ? "ARCHIVED" : item.convertedId ? "CONVERTED" : item.result ? "READY" : "NEW";
  const [row] = await db.update(inboxItems).set({ status }).where(eq(inboxItems.id, id)).returning();
  await logAudit(db, { entityType: "inbox", entityId: id, action: archived ? "ARCHIVE" : "UNARCHIVE" }, ctx);
  return row;
}

export async function deleteInboxItem(id: string, ctx: Ctx) {
  await db.update(opportunities).set({ captureId: null }).where(eq(opportunities.captureId, id));
  const [row] = await db.delete(inboxItems).where(eq(inboxItems.id, id)).returning();
  if (!row) throw notFound("Inbox item");
  await logAudit(db, { entityType: "inbox", entityId: id, action: "DELETE", summary: row.title }, ctx);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function analysisContext() {
  const settings = await getSettings();
  const [stages, tagRows, candidates] = await Promise.all([
    listStages(),
    db.select({ name: tagsTable.name }).from(tagsTable),
    db
      .select({ id: opportunities.id, title: opportunities.title, organization: organizations.name, status: pipelineStages.key })
      .from(opportunities)
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
      .where(and(isNull(opportunities.deletedAt), sql`${pipelineStages.category} not in ('WON','LOST')`))
      .orderBy(desc(opportunities.updatedAt))
      .limit(80),
  ]);
  return {
    settings,
    today: todayISO(settings.general.timezone),
    timezone: settings.general.timezone,
    stageKeys: { JOB: stages.filter((s) => s.pipeline === "JOB").map((s) => s.key), EDUCATION: stages.filter((s) => s.pipeline === "EDUCATION").map((s) => s.key) },
    existingTags: tagRows.map((t) => t.name),
    candidates,
  };
}

/** Background job body: runs the capture_analysis prompt on an inbox item. */
export async function runCaptureAnalysis(id: string) {
  const item = await getInboxItem(id);
  await db.update(inboxItems).set({ status: "PROCESSING", error: null }).where(eq(inboxItems.id, id));
  try {
    const ctx = await analysisContext();
    const hints = item.extras?.jsonLd?.length ? extractJsonLdHints(item.extras.jsonLd) : null;
    const content = item.rawText.slice(0, MAX_AI_CHARS);
    const { data, meta } = await generateStructured({
      ...captureTask,
      system: captureSystemPrompt(ctx.settings.ai.outputLanguage),
      prompt: capturePrompt({
        today: ctx.today,
        timezone: ctx.timezone,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        fileName: item.fileName,
        pageTitle: item.extras?.pageTitle ?? null,
        jsonLdHints: hints,
        existingTags: ctx.existingTags,
        stageKeys: ctx.stageKeys,
        candidates: ctx.candidates,
        content,
        truncated: item.rawText.length > MAX_AI_CHARS || !!item.extras?.truncated,
      }),
    });
    const verified = verifyCaptureAnalysis(data, {
      sourceText: item.rawText,
      timeZone: ctx.timezone,
      hints,
      candidateIds: ctx.candidates.map((c) => c.id),
      stageKeys: [...ctx.stageKeys.JOB, ...ctx.stageKeys.EDUCATION],
      sourceUrl: item.sourceUrl,
    });
    const [row] = await db
      .update(inboxItems)
      .set({
        status: "READY",
        kind: verified.kind as InboxKind,
        title: verified.title?.trim() || item.title,
        result: verified as unknown as Record<string, unknown>,
        resultMeta: { ...meta, analyzedAt: new Date().toISOString(), by: "AI" },
        error: null,
      })
      .where(eq(inboxItems.id, id))
      .returning();
    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inboxItems).set({ status: "FAILED", error: message.slice(0, 2000) }).where(eq(inboxItems.id, id));
    throw error;
  }
}

export async function requestAnalysis(id: string) {
  await getInboxItem(id);
  const status = await aiStatus({ fresh: true });
  if (!status.available) throw new AppError("UNAVAILABLE", `AI unavailable: ${status.detail} ${status.setup ?? ""}`.trim());
  await enqueueAnalysis(id);
}

/** Claude (via MCP) or another client submits the structured analysis it produced itself. */
export async function submitAnalysis(id: string, raw: unknown, ctx: Ctx, meta: { model?: string | null } = {}) {
  const item = await getInboxItem(id);
  const parsed = captureAnalysisLenientSchema.parse(raw) as CaptureAnalysis;
  const c = await analysisContext();
  const hints = item.extras?.jsonLd?.length ? extractJsonLdHints(item.extras.jsonLd) : null;
  const verified = verifyCaptureAnalysis(parsed, {
    sourceText: item.rawText,
    timeZone: c.timezone,
    hints,
    candidateIds: c.candidates.map((x) => x.id),
    stageKeys: [...c.stageKeys.JOB, ...c.stageKeys.EDUCATION],
    sourceUrl: item.sourceUrl,
  });
  const [row] = await db
    .update(inboxItems)
    .set({
      status: "READY",
      kind: verified.kind as InboxKind,
      title: verified.title?.trim() || item.title,
      result: verified as unknown as Record<string, unknown>,
      resultMeta: { provider: ctx.actor === "CLAUDE" ? "claude-code (MCP)" : "api", model: meta.model ?? null, promptId: "capture_analysis", promptVersion: verified.version, analyzedAt: new Date().toISOString(), by: ctx.actor },
      error: null,
    })
    .where(eq(inboxItems.id, id))
    .returning();
  await logAudit(db, { entityType: "inbox", entityId: id, action: "ANALYSIS_SUBMITTED" }, ctx);
  return row;
}

export function storedResult(item: InboxItem): StoredCaptureResult | null {
  return (item.result as unknown as StoredCaptureResult | null) ?? null;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

async function markConverted(id: string, type: string, entityId: string | null) {
  await db
    .update(inboxItems)
    .set({ status: "CONVERTED", convertedType: type, convertedId: entityId, convertedAt: new Date() })
    .where(eq(inboxItems.id, id));
}

export async function convertToOpportunity(id: string, input: OpportunityInput, ctx: Ctx, options: { force?: boolean } = {}) {
  await getInboxItem(id);
  const result = await createOpportunity({ ...input, captureId: id }, ctx, options);
  return result;
}

export async function convertToContact(id: string, raw: z.input<typeof contactInputSchema>, ctx: Ctx) {
  await getInboxItem(id);
  const contact = await createContact(contactInputSchema.parse(raw), ctx);
  await markConverted(id, "contact", contact.id);
  return contact;
}

/** Keeps the capture as a note in the timeline of an opportunity, organization or contact. */
export async function convertToNote(id: string, target: { opportunityId?: string | null; organizationId?: string | null; contactId?: string | null; title?: string | null }, ctx: Ctx) {
  const item = await getInboxItem(id);
  const event = await logCommunication(
    {
      opportunityId: target.opportunityId ?? null,
      organizationId: target.organizationId ?? null,
      contactId: target.contactId ?? null,
      type: "NOTE",
      title: target.title?.trim() || item.title || "Note",
      body: item.rawText,
    },
    ctx,
  );
  await markConverted(id, "note", target.opportunityId ?? target.organizationId ?? target.contactId ?? event.id);
  return event;
}

// Generic actions (emails, messages, notes, natural-language commands)

const contactRef = opportunityContactRefSchema;

export const captureActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LOG_EVENT"),
    opportunityId: z.string().uuid().nullable().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    contactRef: contactRef.nullable().optional(),
    eventType: z.enum(EVENT_TYPES).default("EMAIL"),
    title: z.string().max(300).nullable().optional(),
    body: z.string().max(100_000).nullable().optional(),
    occurredAt: z.string().max(40).nullable().optional(),
    direction: z.enum(["INBOUND", "OUTBOUND"]).nullable().optional(),
    channel: z.enum(CHANNELS).nullable().optional(),
  }),
  z.object({ type: z.literal("UPSERT_CONTACT"), opportunityId: z.string().uuid().nullable().optional(), ref: contactRef }),
  z.object({ type: z.literal("SET_STATUS"), opportunityId: z.string().uuid(), status: z.string().min(1).max(60), date: z.string().nullable().optional(), note: z.string().max(5000).nullable().optional() }),
  z.object({
    type: z.literal("ADD_INTERVIEW"),
    opportunityId: z.string().uuid(),
    kind: z.enum(INTERVIEW_KINDS).default("OTHER"),
    date: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    timezone: z.string().max(60).nullable().optional(),
    durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    meetingUrl: z.string().max(2048).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    participants: z.array(z.string().max(200)).max(20).optional(),
    notes: z.string().max(10_000).nullable().optional(),
  }),
  z.object({ type: z.literal("ADD_TASK"), opportunityId: z.string().uuid().nullable().optional(), title: z.string().min(1).max(500), dueDate: z.string().nullable().optional() }),
  z.object({ type: z.literal("SCHEDULE_FOLLOW_UP"), opportunityId: z.string().uuid(), date: z.string().nullable().optional(), days: z.number().int().min(0).max(365).nullable().optional() }),
  z.object({ type: z.literal("FOLLOW_UP_DONE"), opportunityId: z.string().uuid(), date: z.string().nullable().optional(), note: z.string().max(5000).nullable().optional() }),
  z.object({ type: z.literal("ADD_REQUIRED_DOCUMENT"), opportunityId: z.string().uuid(), text: z.string().min(1).max(500) }),
  z.object({ type: z.literal("SET_DEADLINE"), opportunityId: z.string().uuid(), date: z.string(), time: z.string().nullable().optional() }),
  z.object({ type: z.literal("SET_PRIORITY"), opportunityId: z.string().uuid(), priority: z.enum(PRIORITIES) }),
]);
export type CaptureAction = z.infer<typeof captureActionSchema>;

export interface ActionOutcome {
  type: CaptureAction["type"];
  ok: boolean;
  message: string;
  entityId?: string | null;
}

export async function applyActions(rawActions: unknown[], ctx: Ctx, options: { inboxId?: string | null } = {}): Promise<ActionOutcome[]> {
  const actions = z.array(captureActionSchema).max(30).parse(rawActions);
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const outcomes: ActionOutcome[] = [];
  let primaryOpportunityId: string | null = null;
  for (const action of actions) {
    try {
      switch (action.type) {
        case "UPSERT_CONTACT": {
          const orgId = action.opportunityId ? (await getOpportunity(action.opportunityId)).organizationId : null;
          const contact = await db.transaction(async (tx) => {
            const c = await upsertContactFromRef(tx, action.ref, { organizationId: orgId }, ctx);
            if (c && action.opportunityId) await linkContactToOpportunity(tx, action.opportunityId, c.id, action.ref.opportunityRole ?? action.ref.role ?? null);
            return c;
          });
          outcomes.push({ type: action.type, ok: !!contact, message: contact ? `Contact ${contact.fullName}` : "No contact", entityId: contact?.id });
          break;
        }
        case "LOG_EVENT": {
          let contactId: string | null = null;
          if (action.contactRef?.fullName || action.contactRef?.email || action.contactRef?.contactId) {
            const orgId = action.opportunityId ? (await getOpportunity(action.opportunityId)).organizationId : null;
            const c = await db.transaction(async (tx) => {
              const found = await upsertContactFromRef(tx, action.contactRef!, { organizationId: orgId }, ctx);
              if (found && action.opportunityId) await linkContactToOpportunity(tx, action.opportunityId, found.id, action.contactRef!.opportunityRole ?? action.contactRef!.role ?? null);
              return found;
            });
            contactId = c?.id ?? null;
          }
          const event = await logCommunication(
            {
              opportunityId: action.opportunityId ?? null,
              organizationId: action.organizationId ?? null,
              contactId,
              type: action.eventType,
              title: action.title ?? null,
              body: action.body ?? null,
              occurredAt: action.occurredAt ?? null,
              direction: action.direction ?? null,
              channel: action.channel ?? null,
            },
            ctx,
          );
          outcomes.push({ type: action.type, ok: true, message: event.title, entityId: event.id });
          break;
        }
        case "SET_STATUS": {
          const r = await changeStatus(action.opportunityId, { status: action.status, date: action.date && isISODate(action.date) ? action.date : null, note: action.note ?? null }, ctx);
          outcomes.push({ type: action.type, ok: true, message: r.changed ? `${r.from.label} → ${r.to.label}` : `Already ${r.to.label}`, entityId: action.opportunityId });
          break;
        }
        case "ADD_INTERVIEW": {
          const scheduledAt = action.date && isISODate(action.date) ? zonedTimeToInstant(action.date, action.time && /^\d{2}:\d{2}$/.test(action.time) ? action.time : "09:00", action.timezone || tz).toISOString() : null;
          const interview = await createInterview(
            {
              opportunityId: action.opportunityId,
              kind: action.kind,
              scheduledAt,
              durationMinutes: action.durationMinutes ?? null,
              meetingUrl: action.meetingUrl ?? null,
              location: action.location ?? null,
              participants: (action.participants ?? []).map((name) => ({ name })),
              notes: action.notes ?? null,
            },
            ctx,
          );
          outcomes.push({ type: action.type, ok: true, message: `Interview ${interview.kind.toLowerCase()} ${scheduledAt ? "scheduled" : "to schedule"}`, entityId: interview.id });
          break;
        }
        case "ADD_TASK": {
          const task = await createTask({ opportunityId: action.opportunityId ?? null, title: action.title, dueDate: action.dueDate && isISODate(action.dueDate) ? action.dueDate : null, kind: "TODO" }, ctx);
          outcomes.push({ type: action.type, ok: true, message: task.title, entityId: task.id });
          break;
        }
        case "SCHEDULE_FOLLOW_UP": {
          await scheduleFollowUp(action.opportunityId, { date: action.date && isISODate(action.date) ? action.date : null, days: action.days ?? null }, ctx);
          outcomes.push({ type: action.type, ok: true, message: "Follow-up scheduled", entityId: action.opportunityId });
          break;
        }
        case "FOLLOW_UP_DONE": {
          const row = await markFollowUpDone(action.opportunityId, { date: action.date && isISODate(action.date) ? action.date : null, note: action.note ?? null }, ctx);
          outcomes.push({ type: action.type, ok: true, message: `Follow-up #${row.followUpCount} logged`, entityId: action.opportunityId });
          break;
        }
        case "ADD_REQUIRED_DOCUMENT": {
          const opp = await getOpportunity(action.opportunityId);
          if (!opp.requiredDocuments.some((d) => d.toLowerCase() === action.text.toLowerCase())) {
            await updateOpportunity(action.opportunityId, { requiredDocuments: [...opp.requiredDocuments, action.text] }, ctx);
            await createTask({ opportunityId: action.opportunityId, title: action.text, kind: "DOCUMENT" }, ctx);
          }
          outcomes.push({ type: action.type, ok: true, message: `Required: ${action.text}`, entityId: action.opportunityId });
          break;
        }
        case "SET_DEADLINE": {
          if (!isISODate(action.date)) throw new AppError("VALIDATION", "Invalid date");
          await updateOpportunity(action.opportunityId, { deadline: action.date, deadlineTime: action.time && /^\d{2}:\d{2}$/.test(action.time) ? action.time : undefined }, ctx);
          outcomes.push({ type: action.type, ok: true, message: `Deadline ${action.date}`, entityId: action.opportunityId });
          break;
        }
        case "SET_PRIORITY": {
          await updateOpportunity(action.opportunityId, { priority: action.priority }, ctx);
          outcomes.push({ type: action.type, ok: true, message: `Priority ${action.priority.toLowerCase()}`, entityId: action.opportunityId });
          break;
        }
      }
      if (!primaryOpportunityId && "opportunityId" in action && action.opportunityId) primaryOpportunityId = action.opportunityId;
    } catch (error) {
      outcomes.push({ type: action.type, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (options.inboxId && outcomes.some((o) => o.ok)) await markConverted(options.inboxId, primaryOpportunityId ? "opportunity" : "actions", primaryOpportunityId);
  return outcomes;
}

export function draftInputSchema() {
  return opportunityInputSchema;
}

export function familyForInbox(item: InboxItem) {
  const r = storedResult(item);
  return r?.opportunity ? familyOf(r.opportunity.type) : null;
}
