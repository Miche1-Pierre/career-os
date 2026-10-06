import { z } from "zod";
import {
  CHANNELS,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_META,
  EVENT_TYPES,
  INTERVIEW_KINDS,
  INTERVIEW_KIND_LABEL,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_META,
  RELATIONSHIPS,
  SOURCES,
  SOURCE_LABEL,
  STAGE_CATEGORIES,
  familyOf,
} from "@/lib/constants";
import {
  contactInputSchema,
  interviewInputSchema,
  interviewPatchSchema,
  opportunityInputSchema,
  opportunityPatchSchema,
  opportunityAnalysisSchema,
  organizationInputSchema,
  profileSchema,
} from "@/lib/schemas";
import { captureAnalysisStrictSchema } from "@/lib/capture-schema";
import { draftFromCapture } from "@/lib/capture-mapping";
import { renderTemplate, firstName } from "@/lib/text";
import { isISODate, formatISODate, todayISO, zonedTimeToInstant } from "@/lib/dates";
import { AppError, type Ctx } from "@/server/context";
import { getToday } from "@/server/services/today";
import { searchAll } from "@/server/services/search";
import {
  changeStatus,
  createOpportunity,
  findDuplicates,
  getOpportunity,
  listOpportunities,
  updateOpportunity,
} from "@/server/services/opportunities";
import { logCommunication } from "@/server/services/timeline";
import { applyFollowUpAction } from "@/server/services/followups";
import { createInterview, updateInterview } from "@/server/services/interviews";
import { createTask, updateTask } from "@/server/services/tasks";
import { addContactToOpportunity, createContact, updateContact, upsertContactFromRef } from "@/server/services/contacts";
import { createOrganization, findOrganizationByName, updateOrganization } from "@/server/services/organizations";
import { attachDocument, listDocuments } from "@/server/services/documents";
import { applyActions, captureActionSchema, convertToNote, createCapture, getInboxItem, listInbox, setInboxArchived, storedResult, submitAnalysis, analysisContext } from "@/server/services/inbox";
import { saveAnalysis } from "@/server/services/analysis";
import { getSettings, patchSettingsSection } from "@/server/services/settings";
import { listStages } from "@/server/services/stages";
import { listTags } from "@/server/services/tags";
import { getCalendarEvents } from "@/server/services/calendar";
import { getAnalytics, SEGMENTS, type SegmentKey } from "@/server/services/analytics";
import { db } from "@/server/db";

export interface McpTool {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  readOnly?: boolean;
  destructive?: boolean;
  handler: (args: never, ctx: Ctx) => Promise<unknown>;
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const oppUrl = (id: string) => `${appUrl()}/applications/${id}`;

function tool<S extends z.ZodType>(def: { name: string; title: string; description: string; input: S; readOnly?: boolean; destructive?: boolean; handler: (args: z.infer<S>, ctx: Ctx) => Promise<unknown> }): McpTool {
  return def as unknown as McpTool;
}

const opportunityCreateInput = opportunityInputSchema.extend({
  force: z.boolean().optional().describe("Create even if a strong duplicate exists (ask the user first)."),
});

export const TOOLS: McpTool[] = [
  tool({
    name: "get_today",
    title: "Today's actions",
    description:
      "What needs attention: overdue items, today's items, upcoming interviews/deadlines/follow-ups (next N days), applications waiting for an answer, missing documents and automation suggestions. Start here when the user asks what to do.",
    input: z.object({ horizonDays: z.number().int().min(1).max(60).optional() }),
    readOnly: true,
    handler: async ({ horizonDays }) => {
      const t = await getToday({ horizonDays });
      const slim = (items: typeof t.overdue) =>
        items.map((i) => ({
          kind: i.kind,
          date: i.date,
          time: i.time ?? null,
          title: i.title,
          detail: i.subtitle,
          due: i.due.label,
          opportunityId: i.opportunity?.id ?? null,
          url: i.opportunity ? oppUrl(i.opportunity.id) : null,
          taskId: i.taskId,
          interviewId: i.interviewId,
          contact: i.contact ?? null,
        }));
      return {
        today: t.today,
        counts: t.counts,
        overdue: slim(t.overdue),
        today_items: slim(t.dueToday),
        upcoming: slim(t.upcoming),
        waiting: slim(t.waiting),
        missingDocuments: slim(t.missingDocuments),
        suggestions: t.suggestions.map((n) => ({ id: n.id, title: n.title, body: n.body, entityId: n.entityId, action: n.action })),
      };
    },
  }),
  tool({
    name: "search",
    title: "Global search",
    description: "Search everything (opportunities, companies, institutions, contacts, documents, interviews, notes). Accent/case insensitive.",
    input: z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(30).optional() }),
    readOnly: true,
    handler: async ({ query, limit }) => (await searchAll(query, limit ?? 8)).map((h) => ({ ...h, url: `${appUrl()}${h.href}` })),
  }),
  tool({
    name: "list_opportunities",
    title: "List opportunities",
    description: "List jobs / formations with filters. Closed ones (accepted/rejected/withdrawn…) are excluded unless includeClosed=true.",
    input: z.object({
      query: z.string().max(200).optional(),
      family: z.enum(["JOB", "EDUCATION"]).optional(),
      types: z.array(z.enum(OPPORTUNITY_TYPES)).optional(),
      statuses: z.array(z.string()).optional().describe("Stage keys, e.g. APPLIED, TECHNICAL_INTERVIEW"),
      categories: z.array(z.enum(STAGE_CATEGORIES)).optional(),
      tags: z.array(z.string()).optional(),
      organizationId: z.string().uuid().optional(),
      includeClosed: z.boolean().optional(),
      sort: z.enum(["updated", "created", "deadline", "followup", "priority", "title", "applied", "organization"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    readOnly: true,
    handler: async (a) => {
      const rows = await listOpportunities({
        q: a.query,
        family: a.family,
        types: a.types,
        stageKeys: a.statuses,
        categories: a.categories,
        tags: a.tags,
        organizationId: a.organizationId,
        includeClosed: a.includeClosed ?? false,
        sort: a.sort,
        limit: a.limit ?? 100,
      });
      return rows.map((r) => ({
        id: r.id,
        url: oppUrl(r.id),
        type: r.type,
        title: r.title,
        organization: r.organization?.name ?? null,
        status: r.stage.key,
        statusLabel: r.stage.label,
        category: r.stage.category,
        priority: r.priority,
        location: [r.locationCity, r.locationCountry].filter(Boolean).join(", ") || null,
        deadline: r.deadline,
        appliedAt: r.appliedAt,
        nextFollowUpAt: r.nextFollowUpAt,
        followUps: r.followUpCount,
        tags: r.tags,
      }));
    },
  }),
  tool({
    name: "get_opportunity",
    title: "Get an opportunity",
    description: "Full record: fields with provenance, organization, contacts, documents used (exact versions), interviews, checklist/tasks, recent timeline, analysis.",
    input: z.object({ id: z.string().uuid(), includeDescription: z.boolean().optional(), timelineLimit: z.number().int().min(0).max(300).optional() }),
    readOnly: true,
    handler: async ({ id, includeDescription, timelineLimit }) => {
      const o = await getOpportunity(id);
      return {
        ...o,
        url: oppUrl(id),
        description: includeDescription ? o.description : o.description ? `(${o.description.length} chars — pass includeDescription=true)` : null,
        stage: { key: o.stage.key, label: o.stage.label, category: o.stage.category, pipeline: o.stage.pipeline },
        documents: o.documents.map((d) => ({ attachmentId: d.id, role: d.role, document: d.document.name, documentId: d.document.id, version: d.version.version, versionId: d.version.id, path: d.version.displayPath })),
        events: o.events.slice(0, timelineLimit ?? 30).map((e) => ({ id: e.id, type: e.type, occurredAt: e.occurredAt, title: e.title, body: e.body, actor: e.actor, direction: e.direction })),
      };
    },
  }),
  tool({
    name: "check_duplicates",
    title: "Check duplicates",
    description: "Find existing opportunities similar to a new one (same URL, or same organization + similar title). Call before create_opportunity.",
    input: z.object({ title: z.string().min(1), organizationName: z.string().optional(), url: z.string().optional() }),
    readOnly: true,
    handler: async (a) => (await findDuplicates({ title: a.title, organizationName: a.organizationName, url: a.url })).map((d) => ({ ...d, url: oppUrl(d.id) })),
  }),
  tool({
    name: "create_opportunity",
    title: "Create an opportunity",
    description:
      "Create a job/formation/internship/VIE/PhD… from structured data. Organization is matched by name or created. A checklist is generated from the type template + requiredDocuments. " +
      "For every field you fill from a source, add provenance[field] = {source: EXTRACTED|INFERRED, confidence, evidence: short verbatim quote}. Use details.* keys for detail fields (e.g. 'details.salaryMin'), 'organizationId' for the organization name. " +
      "Omit unknown fields (never guess). Returns {created:false, duplicates} if a strong duplicate exists — ask the user, then retry with force=true. Pass captureId when converting an inbox item.",
    input: opportunityCreateInput,
    handler: async (a, ctx) => {
      const { force, ...input } = a;
      const result = await createOpportunity(input, ctx, { force });
      return {
        created: result.created,
        id: result.opportunity?.id ?? null,
        url: result.opportunity ? oppUrl(result.opportunity.id) : null,
        duplicates: result.duplicates.map((d) => ({ ...d, url: oppUrl(d.id) })),
      };
    },
  }),
  tool({
    name: "update_opportunity",
    title: "Update an opportunity",
    description: "Patch fields (undefined = unchanged, null = clear). Include provenance entries for values taken from a source; other edits are recorded as entered by the user/Claude. Use set_status to change the status.",
    input: z.object({ id: z.string().uuid(), patch: opportunityPatchSchema }),
    handler: async ({ id, patch }, ctx) => {
      const row = await updateOpportunity(id, patch, ctx);
      return { id: row.id, url: oppUrl(row.id), updatedAt: row.updatedAt };
    },
  }),
  tool({
    name: "set_status",
    title: "Change status",
    description:
      "Move an opportunity to a pipeline stage (key from get_reference, e.g. APPLIED, HR_INTERVIEW, OFFER, REJECTED; education: APPLICATION_SUBMITTED, ADMITTED…). Side effects are automatic: application date, follow-up scheduling, response date, closing. Confirm with the user before closing (REJECTED/WITHDRAWN/GHOSTED/DECLINED).",
    input: z.object({ id: z.string().uuid(), status: z.string().min(1), date: z.string().optional().describe("YYYY-MM-DD, default today"), note: z.string().max(5000).optional() }),
    handler: async ({ id, status, date, note }, ctx) => {
      const r = await changeStatus(id, { status, date: date && isISODate(date) ? date : null, note: note ?? null }, ctx);
      return { changed: r.changed, from: r.from.key, to: r.to.key, nextFollowUpAt: r.opportunity.nextFollowUpAt, appliedAt: r.opportunity.appliedAt, url: oppUrl(id) };
    },
  }),
  tool({
    name: "log_event",
    title: "Log a communication or note",
    description:
      "Add an entry to a timeline (opportunity, organization and/or contact): EMAIL, MESSAGE, CALL, MEETING, NOTE, RESPONSE_RECEIVED… Inbound responses set the first-response date. Use `contact` to create/link the person by name/email.",
    input: z.object({
      opportunityId: z.string().uuid().optional(),
      organizationId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      contact: z.object({ fullName: z.string().optional(), email: z.string().optional(), role: z.string().optional(), relationship: z.enum(RELATIONSHIPS).optional() }).optional(),
      type: z.enum(EVENT_TYPES).default("NOTE"),
      title: z.string().max(300).optional(),
      body: z.string().max(100_000).optional(),
      occurredAt: z.string().optional().describe("ISO datetime or YYYY-MM-DD"),
      direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
      channel: z.enum(CHANNELS).optional(),
    }),
    handler: async (a, ctx) => {
      let contactId = a.contactId ?? null;
      if (!contactId && a.contact && (a.contact.fullName || a.contact.email)) {
        if (a.opportunityId) contactId = (await addContactToOpportunity(a.opportunityId, { ...a.contact, opportunityRole: a.contact.role }, ctx)).id;
        else contactId = (await db.transaction((tx) => upsertContactFromRef(tx, a.contact!, {}, ctx)))?.id ?? null;
      }
      const event = await logCommunication({ ...a, contactId, title: a.title ?? null, body: a.body ?? null, occurredAt: a.occurredAt ?? null }, ctx);
      return { id: event.id, title: event.title, occurredAt: event.occurredAt };
    },
  }),
  tool({
    name: "follow_up",
    title: "Follow-ups",
    description: "done = a follow-up was sent (schedules the next one automatically), schedule = set next follow-up (date or days), snooze = push by N days, clear, pause, resume. Never send messages yourself — draft them for the user.",
    input: z.object({
      opportunityId: z.string().uuid(),
      action: z.enum(["done", "schedule", "snooze", "clear", "pause", "resume"]),
      date: z.string().optional(),
      days: z.number().int().min(0).max(365).optional(),
      note: z.string().max(10_000).optional(),
      channel: z.enum(CHANNELS).optional(),
    }),
    handler: async (a, ctx) => {
      const row = await applyFollowUpAction(a.opportunityId, { ...a, date: a.date && isISODate(a.date) ? a.date : null }, ctx);
      return { nextFollowUpAt: row.nextFollowUpAt, followUpCount: row.followUpCount, paused: row.followUpPaused, url: oppUrl(a.opportunityId) };
    },
  }),
  tool({
    name: "add_interview",
    title: "Add an interview",
    description:
      "Create an interview (date + time in the user's timezone, or scheduledAt ISO). Moves the application forward to the matching interview stage and creates a preparation task. Kinds: " + INTERVIEW_KINDS.join(", "),
    input: interviewInputSchema.extend({
      date: z.string().optional().describe("YYYY-MM-DD"),
      time: z.string().optional().describe("HH:mm"),
      timezone: z.string().optional(),
    }),
    handler: async (a, ctx) => {
      const settings = await getSettings();
      const { date, time, timezone, ...rest } = a;
      const scheduledAt = rest.scheduledAt ?? (date && isISODate(date) ? zonedTimeToInstant(date, time ?? "09:00", timezone ?? settings.general.timezone).toISOString() : null);
      const row = await createInterview({ ...rest, scheduledAt }, ctx);
      return { id: row.id, scheduledAt: row.scheduledAt, status: row.status, url: `${oppUrl(row.opportunityId)}?tab=interviews` };
    },
  }),
  tool({
    name: "update_interview",
    title: "Update an interview",
    description: "Update preparation notes (Markdown), questions (EXPECTED questions with prepared answers, TO_ASK questions), feedback, outcome, status (COMPLETED when done), time…",
    input: z.object({ id: z.string().uuid(), patch: interviewPatchSchema }),
    handler: async ({ id, patch }, ctx) => {
      const row = await updateInterview(id, patch, ctx);
      return { id: row.id, status: row.status, outcome: row.outcome, url: `${oppUrl(row.opportunityId)}?tab=interviews` };
    },
  }),
  tool({
    name: "add_task",
    title: "Add a task",
    description: "Create a task (optionally linked to an opportunity, optionally due on a date). kind: TODO, CHECKLIST, DOCUMENT, FOLLOW_UP, PREPARATION, DEADLINE.",
    input: z.object({
      opportunityId: z.string().uuid().optional(),
      title: z.string().min(1).max(500),
      dueDate: z.string().optional(),
      kind: z.enum(["TODO", "CHECKLIST", "DOCUMENT", "FOLLOW_UP", "PREPARATION", "DEADLINE"]).optional(),
      notes: z.string().max(10_000).optional(),
    }),
    handler: async (a, ctx) => {
      const row = await createTask({ ...a, dueDate: a.dueDate && isISODate(a.dueDate) ? a.dueDate : null, kind: a.kind ?? "TODO" }, ctx);
      return { id: row.id, title: row.title, dueDate: row.dueDate };
    },
  }),
  tool({
    name: "update_task",
    title: "Update / complete a task",
    description: "Mark a task done/undone or change its title/due date.",
    input: z.object({ id: z.string().uuid(), done: z.boolean().optional(), title: z.string().max(500).optional(), dueDate: z.string().nullable().optional() }),
    handler: async ({ id, ...patch }, ctx) => {
      const row = await updateTask(id, { ...patch, dueDate: patch.dueDate === undefined ? undefined : patch.dueDate && isISODate(patch.dueDate) ? patch.dueDate : null }, ctx);
      return { id: row.id, done: row.done, dueDate: row.dueDate };
    },
  }),
  tool({
    name: "upsert_contact",
    title: "Create or update a contact",
    description: "Create a contact (matched by email or name+organization to avoid duplicates) or update one (id). Optionally link it to an opportunity with a role.",
    input: contactInputSchema.partial().extend({
      id: z.string().uuid().optional(),
      fullName: z.string().min(1).max(200).optional(),
      opportunityId: z.string().uuid().optional(),
      opportunityRole: z.string().max(200).optional(),
    }),
    handler: async (a, ctx) => {
      const { id, opportunityId, opportunityRole, ...fields } = a;
      if (id) {
        const row = await updateContact(id, fields, ctx);
        return { id: row.id, fullName: row.fullName, url: `${appUrl()}/contacts/${row.id}` };
      }
      if (!fields.fullName) throw new AppError("VALIDATION", "fullName is required to create a contact");
      if (opportunityId) {
        const row = await addContactToOpportunity(opportunityId, { ...fields, fullName: fields.fullName, opportunityRole: opportunityRole ?? fields.role ?? null }, ctx);
        return { id: row.id, fullName: row.fullName, url: `${appUrl()}/contacts/${row.id}` };
      }
      const row = await createContact({ ...fields, fullName: fields.fullName }, ctx);
      return { id: row.id, fullName: row.fullName, url: `${appUrl()}/contacts/${row.id}` };
    },
  }),
  tool({
    name: "upsert_organization",
    title: "Create or update a company / institution",
    description: "Find an organization by name (or id) and update it, or create it. kind COMPANY or INSTITUTION.",
    input: organizationInputSchema.partial().extend({ id: z.string().uuid().optional(), name: z.string().min(1).max(200).optional() }),
    handler: async (a, ctx) => {
      const { id, ...fields } = a;
      const existing = id ? { id } : fields.name ? await findOrganizationByName(db, fields.name, fields.kind) : null;
      if (existing) {
        const row = await updateOrganization(existing.id, fields, ctx);
        return { id: row.id, name: row.name, created: false, url: `${appUrl()}/${row.kind === "INSTITUTION" ? "institutions" : "companies"}/${row.id}` };
      }
      if (!fields.name) throw new AppError("VALIDATION", "name is required");
      const row = await createOrganization({ ...fields, name: fields.name, kind: fields.kind ?? "COMPANY" }, ctx);
      return { id: row.id, name: row.name, created: true, url: `${appUrl()}/${row.kind === "INSTITUTION" ? "institutions" : "companies"}/${row.id}` };
    },
  }),
  tool({
    name: "list_documents",
    title: "List documents",
    description: "Documents library (CVs, letters, transcripts…) with versions (id, number, label, path) and how many applications use each.",
    input: z.object({ kind: z.enum(DOCUMENT_KINDS).optional(), query: z.string().optional() }),
    readOnly: true,
    handler: async ({ kind, query }) =>
      (await listDocuments({ kind, q: query, withStatus: false })).map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        tags: d.tags,
        usedBy: d.usageCount,
        versions: d.versions.map((v) => ({ versionId: v.id, version: v.version, label: v.label, path: v.displayPath, createdAt: v.createdAt, usedBy: v.usageCount })),
        url: `${appUrl()}/documents/${d.id}`,
      })),
  }),
  tool({
    name: "attach_document",
    title: "Attach a document to an application",
    description: "Record which exact document version is used for an application (role CV, COVER_LETTER, TRANSCRIPT…). If only documentId is given, the latest version is used. Auto-completes the matching checklist item.",
    input: z.object({ opportunityId: z.string().uuid(), role: z.enum(DOCUMENT_KINDS), documentVersionId: z.string().uuid().optional(), documentId: z.string().uuid().optional() }),
    handler: async (a, ctx) => {
      let versionId = a.documentVersionId;
      if (!versionId && a.documentId) {
        const doc = (await listDocuments({ withStatus: false, includeArchived: true })).find((d) => d.id === a.documentId);
        versionId = doc?.latest?.id;
      }
      if (!versionId) throw new AppError("VALIDATION", "documentVersionId or documentId (with at least one version) is required");
      const link = await attachDocument({ opportunityId: a.opportunityId, documentVersionId: versionId, role: a.role }, ctx);
      return { attached: !!link, attachmentId: link?.id ?? null, role: DOCUMENT_KIND_META[a.role].label };
    },
  }),
  tool({
    name: "list_inbox",
    title: "List inbox captures",
    description: "Raw captures waiting to be classified (NEW = not analyzed yet, READY = analysis ready for review, FAILED…). Process NEW ones with get_inbox_item + submit_inbox_analysis.",
    input: z.object({ view: z.enum(["active", "converted", "archived", "all"]).optional() }),
    readOnly: true,
    handler: async ({ view }) => (await listInbox({ view })).map((i) => ({ ...i, url: `${appUrl()}/inbox/${i.id}` })),
  }),
  tool({
    name: "get_inbox_item",
    title: "Get an inbox capture",
    description: "Full raw text of a capture + context needed to analyze it (today, status keys, existing tags, candidate opportunities for emails/notes) + any existing analysis.",
    input: z.object({ id: z.string().uuid() }),
    readOnly: true,
    handler: async ({ id }) => {
      const item = await getInboxItem(id);
      const c = await analysisContext();
      return {
        id: item.id,
        status: item.status,
        kind: item.kind,
        title: item.title,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        fileName: item.fileName,
        extras: item.extras,
        rawText: item.rawText,
        existingAnalysis: item.result,
        context: { today: c.today, timezone: c.timezone, statusKeys: c.stageKeys, existingTags: c.existingTags, candidateOpportunities: c.candidates },
        url: `${appUrl()}/inbox/${item.id}`,
      };
    },
  }),
  tool({
    name: "submit_inbox_analysis",
    title: "Submit a capture analysis",
    description:
      "Store YOUR structured analysis of a capture so the user can review it in the app (Inbox → Review). Follow the schema strictly: null for unknown, fieldSources with verbatim evidence quotes. The server verifies every quote against the raw text.",
    input: z.object({ id: z.string().uuid(), analysis: captureAnalysisStrictSchema, model: z.string().optional() }),
    handler: async ({ id, analysis, model }, ctx) => {
      const row = await submitAnalysis(id, analysis, ctx, { model });
      const result = storedResult(row);
      return {
        status: row.status,
        kind: row.kind,
        unverifiedFields: result?.fieldSources.filter((f) => !f.verified).map((f) => f.field) ?? [],
        warnings: result?.warnings ?? [],
        reviewUrl: `${appUrl()}/inbox/${id}`,
      };
    },
  }),
  tool({
    name: "convert_inbox_item",
    title: "Convert / archive an inbox capture",
    description:
      "opportunity = create the opportunity from the stored analysis (optionally with overrides, e.g. status), note = attach the raw text as a note to an opportunity/organization/contact, archive = dismiss. For emails, prefer apply_actions with inboxId.",
    input: z.object({
      id: z.string().uuid(),
      to: z.enum(["opportunity", "note", "archive"]),
      overrides: opportunityPatchSchema.optional(),
      force: z.boolean().optional(),
      opportunityId: z.string().uuid().optional(),
      organizationId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
    }),
    handler: async (a, ctx) => {
      const item = await getInboxItem(a.id);
      if (a.to === "archive") {
        await setInboxArchived(a.id, true, ctx);
        return { archived: true };
      }
      if (a.to === "note") {
        const event = await convertToNote(a.id, { opportunityId: a.opportunityId, organizationId: a.organizationId, contactId: a.contactId }, ctx);
        return { noteId: event.id };
      }
      const result = storedResult(item);
      if (!result) throw new AppError("VALIDATION", "This capture has no analysis yet — submit_inbox_analysis first, or use create_opportunity with captureId.");
      const settings = await getSettings();
      const draft = draftFromCapture(result, item, { timeZone: settings.general.timezone, by: ctx.actor });
      if (!draft) throw new AppError("VALIDATION", "The analysis contains no opportunity");
      const created = await createOpportunity({ ...draft.input, ...(a.overrides ?? {}), type: a.overrides?.type ?? draft.input.type, title: a.overrides?.title ?? draft.input.title, contacts: draft.contacts }, ctx, { force: a.force });
      return { created: created.created, id: created.opportunity?.id ?? null, url: created.opportunity ? oppUrl(created.opportunity.id) : null, duplicates: created.duplicates };
    },
  }),
  tool({
    name: "apply_actions",
    title: "Apply actions",
    description:
      "Apply several operations at once (typically after reading an email): LOG_EVENT, UPSERT_CONTACT, SET_STATUS, ADD_INTERVIEW (date+time), ADD_TASK, SCHEDULE_FOLLOW_UP, ADD_REQUIRED_DOCUMENT, SET_DEADLINE, SET_PRIORITY. Pass inboxId to mark the capture as processed.",
    input: z.object({ actions: z.array(captureActionSchema).min(1).max(30), inboxId: z.string().uuid().optional() }),
    handler: async ({ actions, inboxId }, ctx) => applyActions(actions, ctx, { inboxId }),
  }),
  tool({
    name: "save_analysis",
    title: "Save a matching analysis",
    description:
      "Store a DESCRIPTIVE analysis of an opportunity vs the user's profile (get_profile). Never recommend applying or not: dimensions with level/score/rationale/matched/gaps, gaps, questions to clarify, suggested documents, talking points, caveats.",
    input: z.object({ opportunityId: z.string().uuid(), analysis: opportunityAnalysisSchema, model: z.string().optional() }),
    handler: async ({ opportunityId, analysis, model }, ctx) => {
      await saveAnalysis(opportunityId, analysis, ctx, { model: model ?? null, by: ctx.actor });
      return { saved: true, url: `${oppUrl(opportunityId)}?tab=analysis` };
    },
  }),
  tool({
    name: "get_profile",
    title: "Get the user's profile",
    description: "The user's profile used for matching (skills, experience, languages, education, targets) and preferences.",
    input: z.object({}),
    readOnly: true,
    handler: async () => {
      const s = await getSettings();
      return { profile: s.profile, userName: s.general.userName, timezone: s.general.timezone, followUpDefaults: s.followUp.defaultDays };
    },
  }),
  tool({
    name: "update_profile",
    title: "Update the user's profile",
    description: "Merge fields into the profile (e.g. after reading the user's CV). Lists replace the previous lists — include existing items you want to keep.",
    input: z.object({ patch: profileSchema.partial() }),
    handler: async ({ patch }, ctx) => ({ profile: await patchSettingsSection("profile", patch, ctx) }),
  }),
  tool({
    name: "get_reference",
    title: "Reference data",
    description: "Valid values: opportunity types, pipeline stage keys per type, sources, document kinds, interview kinds, relationships, existing tags, email templates.",
    input: z.object({}),
    readOnly: true,
    handler: async () => {
      const [stages, tagList, settings] = await Promise.all([listStages(), listTags(), getSettings()]);
      return {
        opportunityTypes: OPPORTUNITY_TYPES.map((t) => ({ key: t, label: OPPORTUNITY_TYPE_META[t].label, pipeline: familyOf(t) })),
        pipelines: {
          JOB: stages.filter((s) => s.pipeline === "JOB").map((s) => ({ key: s.key, label: s.label, category: s.category, default: s.isDefault })),
          EDUCATION: stages.filter((s) => s.pipeline === "EDUCATION").map((s) => ({ key: s.key, label: s.label, category: s.category, default: s.isDefault })),
        },
        sources: SOURCES.map((k) => ({ key: k, label: SOURCE_LABEL[k] })),
        documentKinds: DOCUMENT_KINDS.map((k) => ({ key: k, label: DOCUMENT_KIND_META[k].label })),
        interviewKinds: INTERVIEW_KINDS.map((k) => ({ key: k, label: INTERVIEW_KIND_LABEL[k] })),
        relationships: RELATIONSHIPS,
        tags: tagList.map((t) => t.name),
        emailTemplates: settings.emailTemplates.map((t) => ({ id: t.id, name: t.name, language: t.language, purpose: t.purpose })),
      };
    },
  }),
  tool({
    name: "render_email_template",
    title: "Render an email template",
    description: "Fill an email template (follow-up, thank-you…) for an opportunity. Returns subject + body for the user to send themselves.",
    input: z.object({ opportunityId: z.string().uuid(), templateId: z.string().optional() }),
    readOnly: true,
    handler: async ({ opportunityId, templateId }) => {
      const [opp, settings] = await Promise.all([getOpportunity(opportunityId), getSettings()]);
      const template = settings.emailTemplates.find((t) => t.id === templateId) ?? settings.emailTemplates.find((t) => t.purpose === "FOLLOW_UP") ?? settings.emailTemplates[0];
      const contact = opp.contacts.find((c) => c.relationship === "RECRUITER") ?? opp.contacts[0];
      const vars = {
        title: opp.title,
        organization: opp.organization?.name ?? "",
        contactFirstName: firstName(contact?.fullName) || (template.language === "fr" ? "Madame, Monsieur" : "there"),
        appliedDate: opp.appliedAt ? formatISODate(opp.appliedAt, "long", template.language === "fr" ? "fr-FR" : "en-GB") : "",
        userName: settings.general.userName || settings.profile.fullName || "",
        today: formatISODate(todayISO(settings.general.timezone), "long", template.language === "fr" ? "fr-FR" : "en-GB"),
      };
      return { template: template.name, to: contact?.email ?? null, subject: renderTemplate(template.subject, vars), body: renderTemplate(template.body, vars) };
    },
  }),
  tool({
    name: "capture",
    title: "Capture into the inbox",
    description: "Put raw content (text or a URL to fetch) into the Career OS inbox. analyze=true lets the in-app AI analyze it (if configured); otherwise analyze it yourself and call submit_inbox_analysis.",
    input: z.object({ text: z.string().max(250_000).optional(), url: z.string().max(2048).optional(), analyze: z.boolean().optional() }),
    handler: async ({ text, url, analyze }, ctx) => {
      const r = await createCapture({ text, url, sourceType: "MCP" }, ctx, { analyze: analyze ?? false });
      return { id: r.item.id, status: r.item.status, duplicate: r.duplicate, title: r.item.title, url: `${appUrl()}/inbox/${r.item.id}` };
    },
  }),
  tool({
    name: "get_calendar",
    title: "Calendar",
    description: "Dated events between two dates: interviews, deadlines, follow-ups, tasks, application openings, expected answers.",
    input: z.object({ from: z.string(), to: z.string() }),
    readOnly: true,
    handler: async ({ from, to }) => {
      if (!isISODate(from) || !isISODate(to)) throw new AppError("VALIDATION", "from/to must be YYYY-MM-DD");
      return (await getCalendarEvents(from, to)).map((e) => ({ ...e, url: `${appUrl()}${e.href}` }));
    },
  }),
  tool({
    name: "get_analytics",
    title: "Statistics",
    description: `Objective statistics (applications, response/interview/offer rates, response times, per month) segmented by: ${Object.keys(SEGMENTS).join(", ")}. Report numbers, never conclusions.`,
    input: z.object({ family: z.enum(["ALL", "JOB", "EDUCATION"]).optional(), segment: z.enum(Object.keys(SEGMENTS) as [SegmentKey, ...SegmentKey[]]).optional() }),
    readOnly: true,
    handler: async ({ family, segment }) => getAnalytics({ family, segment }),
  }),
];

export const MCP_INSTRUCTIONS = `Career OS is the user's personal career and application tracker (jobs, internships, VIE, masters/formations, PhDs). You operate it on the user's behalf.
Conventions:
- Never invent data. Unknown = omit or null. When you create/update from a source (job posting, program page, email, notes), fill provenance per field: EXTRACTED with a short verbatim quote as evidence, or INFERRED.
- Before create_opportunity call check_duplicates; if duplicates exist, ask the user before using force=true.
- Statuses are pipeline stage keys (get_reference). Calendar dates are YYYY-MM-DD in the user's timezone; interviews take date + time (HH:mm).
- Ask for explicit confirmation before irreversible or closing actions (REJECTED/WITHDRAWN/GHOSTED, archiving, bulk changes).
- Never send emails or messages yourself: draft them (render_email_template) for the user.
- Always give the user the record url returned by the tools.
- Matching analyses are descriptive; the user decides whether to apply.`;
