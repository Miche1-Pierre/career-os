/**
 * Personal seed: imports a curated dataset (seed/personal/dataset.json — git-ignored, personal data) into Career OS
 * through the business services, replaying history at its real dates (applied, follow-ups, answers, interviews,
 * rejections) and attaching the exact document versions that were sent.
 *
 * Idempotent: every record has a stable `key`; created ids are remembered in seed/personal/.seed-state.json and
 * existing records are skipped on the next run. Start from scratch: reset the database, delete the state file, re-run.
 *
 *   npm run seed:personal                 # import (host, uses DATABASE_URL / DOCUMENTS_DIR from .env)
 *   npm run seed:personal -- --dry-run    # validate only
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";
import type { Ctx } from "@/server/context";
import {
  CHANNELS,
  DOCUMENT_KINDS,
  EVENT_TYPES,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_STATUSES,
  OPPORTUNITY_TYPES,
  ORG_KINDS,
  PRIORITIES,
  RELATIONSHIPS,
  REMOTE_POLICIES,
  TASK_KINDS,
} from "@/lib/constants";
import { fieldProvenanceSchema, linkSchema, opportunityDetailsSchema, profileSchema } from "@/lib/schemas";
import { zonedTimeToInstant } from "@/lib/dates";
import { sha256File, resolveLibraryPath, toLibraryRelative } from "@/server/storage";
import { getSettings, invalidateSettingsCache, patchSettingsSection, updateSettingsSection } from "@/server/services/settings";
import { createOrganization, findOrganizationByName, updateOrganization } from "@/server/services/organizations";
import { createContact, updateContact, upsertContactFromRef, linkContactToOpportunity } from "@/server/services/contacts";
import { addVersionFromPath, attachDocument, createDocument } from "@/server/services/documents";
import { changeStatus, createOpportunity } from "@/server/services/opportunities";
import { resolveStage } from "@/server/services/stages";
import { familyOf } from "@/lib/constants";
import { logCommunication, updateEvent } from "@/server/services/timeline";
import { markFollowUpDone, scheduleFollowUp } from "@/server/services/followups";
import { createInterview } from "@/server/services/interviews";
import { createTask } from "@/server/services/tasks";
import { evaluatePeriodicRules } from "@/server/services/rules";

const ROOT = path.resolve(__dirname, "..");
const DATASET = path.join(ROOT, "seed", "personal", "dataset.json");
const STATE = path.join(ROOT, "seed", "personal", ".seed-state.json");
const IMPORT: Ctx = { actor: "IMPORT" };
const DRY = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Dataset schema
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const key = z.string().min(1).max(120);

const organizationSchema = z.object({
  key,
  name: z.string().min(1),
  kind: z.enum(ORG_KINDS),
  website: z.string().url().nullable().optional(),
  industry: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const contactSchema = z.object({
  key,
  fullName: z.string().min(1),
  organizationKey: key.nullable().optional(),
  role: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const documentSchema = z.object({
  key,
  name: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS),
  language: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  /** Oldest first. Paths relative to the documents library. Identical files (same checksum) share one version. */
  versions: z.array(z.object({ path: z.string().min(1), label: z.string().nullable().optional(), notes: z.string().nullable().optional() })).min(1),
});

const eventSchema = z.object({
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  type: z.enum(EVENT_TYPES),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).nullable().optional(),
  channel: z.enum(CHANNELS).nullable().optional(),
  contactKey: key.nullable().optional(),
  countsAsResponse: z.boolean().optional(),
});

const interviewSchema = z.object({
  kind: z.enum(INTERVIEW_KINDS),
  date: isoDate.nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeZone: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  status: z.enum(INTERVIEW_STATUSES),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
  title: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  meetingUrl: z.string().url().nullable().optional(),
  participants: z.array(z.object({ name: z.string().min(1), role: z.string().nullable().optional() })).optional(),
  notes: z.string().nullable().optional(),
  feedback: z.string().nullable().optional(),
});

const taskSchema = z.object({
  title: z.string().min(1),
  dueDate: isoDate.nullable().optional(),
  kind: z.enum(TASK_KINDS).optional(),
  notes: z.string().nullable().optional(),
  done: z.boolean().optional(),
});

const opportunitySchema = z.object({
  key,
  type: z.enum(OPPORTUNITY_TYPES),
  title: z.string().min(1),
  organizationKey: key,
  /** Final stage key (APPLIED, REJECTED, TO_APPLY, DISCOVERED, RESEARCHING…). */
  status: z.string().min(1),
  /** Date of the final status change (e.g. the rejection date). */
  statusDate: isoDate.nullable().optional(),
  appliedAt: isoDate.nullable().optional(),
  discoveredAt: isoDate.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  source: z.string().nullable().optional(),
  sourceDetail: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  links: z.array(linkSchema).optional(),
  locationCity: z.string().nullable().optional(),
  locationCountry: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  remotePolicy: z.enum(REMOTE_POLICIES).nullable().optional(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  responsibilities: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  requiredDocuments: z.array(z.string()).optional(),
  details: opportunityDetailsSchema.optional(),
  deadline: isoDate.nullable().optional(),
  deadlineTime: z.string().nullable().optional(),
  applicationOpensAt: isoDate.nullable().optional(),
  expectedResponseAt: isoDate.nullable().optional(),
  /** undefined = computed by the follow-up engine, null = none, date = planned follow-up. */
  nextFollowUpAt: isoDate.nullable().optional(),
  followUpPaused: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  provenance: z.record(z.string(), fieldProvenanceSchema).optional(),
  applyTemplate: z.boolean().optional(),
  contacts: z.array(z.object({ contactKey: key, role: z.string().nullable().optional() })).optional(),
  documents: z.array(z.object({ documentKey: key, path: z.string().nullable().optional(), role: z.enum(DOCUMENT_KINDS), notes: z.string().nullable().optional() })).optional(),
  /** Follow-ups actually sent (moves a JOB application from Applied to Followed up). */
  followUps: z.array(z.object({ date: isoDate, channel: z.enum(CHANNELS).nullable().optional(), note: z.string().nullable().optional(), contactKey: key.nullable().optional() })).optional(),
  events: z.array(eventSchema).optional(),
  interviews: z.array(interviewSchema).optional(),
  tasks: z.array(taskSchema).optional(),
});

const datasetSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  sources: z.array(z.object({ id: z.string(), label: z.string(), path: z.string().nullable().optional(), date: z.string().nullable().optional() })),
  settings: z
    .object({
      followUpDefaultDays: z.record(z.enum(OPPORTUNITY_TYPES), z.number().int().min(0).max(365)).optional(),
    })
    .optional(),
  profile: profileSchema.partial().optional(),
  organizations: z.array(organizationSchema),
  contacts: z.array(contactSchema),
  documents: z.array(documentSchema),
  opportunities: z.array(opportunitySchema),
  tasks: z.array(taskSchema.extend({ key })),
});
type Dataset = z.infer<typeof datasetSchema>;

// ---------------------------------------------------------------------------
// State (key → id)
// ---------------------------------------------------------------------------
interface SeedState {
  organizations: Record<string, string>;
  contacts: Record<string, string>;
  documents: Record<string, string>;
  opportunities: Record<string, string>;
  tasks: Record<string, string>;
}
function loadState(): SeedState {
  const empty: SeedState = { organizations: {}, contacts: {}, documents: {}, opportunities: {}, tasks: {} };
  if (!fs.existsSync(STATE)) return empty;
  return { ...empty, ...(JSON.parse(fs.readFileSync(STATE, "utf8")) as Partial<SeedState>) };
}
function saveState(state: SeedState) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
}
async function exists(table: "organizations" | "contacts" | "documents" | "opportunities" | "tasks", id: string | undefined) {
  if (!id) return false;
  const t = s[table] as typeof s.organizations;
  const [row] = await db.select({ id: t.id }).from(t).where(eq(t.id, id));
  return !!row;
}

const log = (...args: unknown[]) => console.log(...args);
const noon = (date: string, time?: string | null, tz = "Europe/Paris") => zonedTimeToInstant(date, time ?? "12:00", tz);

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
async function main() {
  const dataset: Dataset = datasetSchema.parse(JSON.parse(fs.readFileSync(DATASET, "utf8")));
  const counts = { organizations: 0, contacts: 0, documents: 0, versions: 0, opportunities: 0, events: 0, interviews: 0, tasks: 0, skipped: 0 };
  // Cross-reference check before touching the database.
  const orgKeys = new Set(dataset.organizations.map((o) => o.key));
  const contactKeys = new Set(dataset.contacts.map((c) => c.key));
  const docKeys = new Set(dataset.documents.map((d) => d.key));
  const problems: string[] = [];
  for (const c of dataset.contacts) if (c.organizationKey && !orgKeys.has(c.organizationKey)) problems.push(`contact ${c.key}: unknown organization ${c.organizationKey}`);
  for (const o of dataset.opportunities) {
    if (!orgKeys.has(o.organizationKey)) problems.push(`opportunity ${o.key}: unknown organization ${o.organizationKey}`);
    for (const c of o.contacts ?? []) if (!contactKeys.has(c.contactKey)) problems.push(`opportunity ${o.key}: unknown contact ${c.contactKey}`);
    for (const e of o.events ?? []) if (e.contactKey && !contactKeys.has(e.contactKey)) problems.push(`opportunity ${o.key}: event contact ${e.contactKey}`);
    for (const d of o.documents ?? []) if (!docKeys.has(d.documentKey)) problems.push(`opportunity ${o.key}: unknown document ${d.documentKey}`);
  }
  const dupKeys = (arr: { key: string }[], what: string) => {
    const seen = new Set<string>();
    for (const x of arr) {
      if (seen.has(x.key)) problems.push(`duplicate ${what} key ${x.key}`);
      seen.add(x.key);
    }
  };
  dupKeys(dataset.organizations, "organization");
  dupKeys(dataset.contacts, "contact");
  dupKeys(dataset.documents, "document");
  dupKeys(dataset.opportunities, "opportunity");
  dupKeys(dataset.tasks, "task");
  for (const d of dataset.documents) {
    for (const v of d.versions) {
      const rel = toLibraryRelative(v.path);
      if (!rel || !fs.existsSync(resolveLibraryPath(rel))) problems.push(`document ${d.key}: file not found in the library: ${v.path}`);
    }
  }
  if (problems.length) {
    console.error(`Dataset problems (${problems.length}):\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  log(`Dataset OK: ${dataset.organizations.length} organizations, ${dataset.contacts.length} contacts, ${dataset.documents.length} documents, ${dataset.opportunities.length} opportunities, ${dataset.tasks.length} tasks.`);
  if (DRY) return;

  const state = loadState();
  const settings = await getSettings();
  const tz = settings.general.timezone;

  // Settings & profile
  if (dataset.settings?.followUpDefaultDays) {
    await patchSettingsSection("followUp", { defaultDays: { ...settings.followUp.defaultDays, ...dataset.settings.followUpDefaultDays } }, IMPORT);
  }
  if (dataset.profile) {
    const current = settings.profile;
    await updateSettingsSection("profile", { ...current, ...dataset.profile }, IMPORT);
  }
  invalidateSettingsCache();

  // Organizations
  const orgIds = new Map<string, string>();
  for (const o of dataset.organizations) {
    let id = (await exists("organizations", state.organizations[o.key])) ? state.organizations[o.key] : undefined;
    if (!id) {
      const found = await findOrganizationByName(db, o.name, o.kind);
      if (found) id = found.id;
    }
    if (!id) {
      const row = await createOrganization({ name: o.name, kind: o.kind, website: o.website ?? null, industry: o.industry ?? null, city: o.city ?? null, country: o.country ?? null, notes: o.notes ?? null, tags: o.tags ?? [] } as never, IMPORT);
      id = row.id;
      counts.organizations++;
    } else {
      const [row] = await db.select().from(s.organizations).where(eq(s.organizations.id, id));
      const fill: Record<string, unknown> = {};
      if (!row.website && o.website) fill.website = o.website;
      if (!row.industry && o.industry) fill.industry = o.industry;
      if (!row.city && o.city) fill.city = o.city;
      if (!row.country && o.country) fill.country = o.country;
      if (!row.notes && o.notes) fill.notes = o.notes;
      if (Object.keys(fill).length) await updateOrganization(id, fill as never, IMPORT);
    }
    orgIds.set(o.key, id);
    state.organizations[o.key] = id;
  }
  saveState(state);

  // Contacts
  const contactIds = new Map<string, string>();
  for (const c of dataset.contacts) {
    let id = (await exists("contacts", state.contacts[c.key])) ? state.contacts[c.key] : undefined;
    const organizationId = c.organizationKey ? orgIds.get(c.organizationKey) ?? null : null;
    if (!id) {
      const row = await upsertContactFromRef(
        db,
        { fullName: c.fullName, email: c.email ?? null, phone: c.phone ?? null, linkedinUrl: c.linkedinUrl ?? null, role: c.role ?? null, relationship: c.relationship ?? null },
        { organizationId },
        IMPORT,
      );
      id = row?.id ?? (await createContact({ fullName: c.fullName, organizationId, role: c.role ?? null } as never, IMPORT)).id;
      counts.contacts++;
    }
    const [row] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
    const fill: Record<string, unknown> = {};
    if (!row.notes && c.notes) fill.notes = c.notes;
    if (!row.tags?.length && c.tags?.length) fill.tags = c.tags;
    if (!row.relationship && c.relationship) fill.relationship = c.relationship;
    if (!row.organizationId && organizationId) fill.organizationId = organizationId;
    if (Object.keys(fill).length) await updateContact(id, fill as never, IMPORT);
    contactIds.set(c.key, id);
    state.contacts[c.key] = id;
  }
  saveState(state);

  // Documents & versions (deduplicated by checksum)
  const docIds = new Map<string, string>();
  const versionByPath = new Map<string, string>(); // `${docKey}|${relativePath}` → version id
  const latestVersion = new Map<string, string>();
  for (const d of dataset.documents) {
    let id = (await exists("documents", state.documents[d.key])) ? state.documents[d.key] : undefined;
    if (!id) {
      const [byName] = await db.select().from(s.documents).where(and(eq(s.documents.name, d.name), isNull(s.documents.deletedAt)));
      id = byName?.id;
    }
    if (!id) {
      const row = await createDocument({ name: d.name, kind: d.kind, language: d.language ?? null, tags: d.tags ?? [], description: d.notes ?? null }, IMPORT);
      id = row.id;
      counts.documents++;
    }
    docIds.set(d.key, id);
    state.documents[d.key] = id;
    const existing = await db.select().from(s.documentVersions).where(eq(s.documentVersions.documentId, id));
    for (const v of d.versions) {
      const rel = toLibraryRelative(v.path)!;
      const checksum = await sha256File(resolveLibraryPath(rel));
      let version = existing.find((x) => x.checksum === checksum);
      if (!version) {
        version = await addVersionFromPath(id, { path: rel, label: v.label ?? null, notes: v.notes ?? null }, IMPORT);
        existing.push(version);
        counts.versions++;
      }
      versionByPath.set(`${d.key}|${rel}`, version.id);
      latestVersion.set(d.key, version.id);
    }
  }
  saveState(state);

  // Opportunities
  for (const o of dataset.opportunities) {
    if (await exists("opportunities", state.opportunities[o.key])) {
      counts.skipped++;
      continue;
    }
    const organizationId = orgIds.get(o.organizationKey)!;
    const finalStage = await resolveStage(familyOf(o.type), o.status);
    if (finalStage.key !== o.status) throw new Error(`${o.key}: unknown status ${o.status} for ${familyOf(o.type)}`);
    const closedFinal = finalStage.category === "WON" || finalStage.category === "LOST";
    // Create at the submission stage, then replay history; the final status comes last.
    const initialStatus = o.appliedAt ? (o.type === "FORMATION" || o.type === "PHD" || o.type === "PROGRAM" ? "APPLICATION_SUBMITTED" : "APPLIED") : closedFinal ? null : o.status;
    const result = await createOpportunity(
      {
        type: o.type,
        title: o.title,
        organizationId,
        status: initialStatus,
        priority: o.priority,
        source: o.source ?? null,
        sourceDetail: o.sourceDetail ?? null,
        url: o.url ?? null,
        links: o.links,
        locationCity: o.locationCity ?? null,
        locationCountry: o.locationCountry ?? null,
        locationText: o.locationText ?? null,
        remotePolicy: o.remotePolicy ?? null,
        summary: o.summary ?? null,
        description: o.description ?? null,
        responsibilities: o.responsibilities,
        requirements: o.requirements,
        niceToHave: o.niceToHave,
        skills: o.skills,
        technologies: o.technologies,
        benefits: o.benefits,
        requiredDocuments: o.requiredDocuments,
        details: o.details,
        deadline: o.deadline ?? null,
        deadlineTime: o.deadlineTime ?? null,
        applicationOpensAt: o.applicationOpensAt ?? null,
        discoveredAt: o.discoveredAt ?? o.appliedAt ?? null,
        appliedAt: o.appliedAt ?? null,
        expectedResponseAt: o.expectedResponseAt ?? null,
        nextFollowUpAt: o.nextFollowUpAt ?? null,
        notes: o.notes ?? null,
        tags: o.tags,
        provenance: o.provenance,
        applyTemplate: o.applyTemplate,
      },
      IMPORT,
      { force: true },
    );
    const opp = result.opportunity!;
    counts.opportunities++;
    state.opportunities[o.key] = opp.id;
    saveState(state);

    // Backdate the "created" event to the discovery date.
    const created = o.discoveredAt ?? o.appliedAt;
    if (created) {
      const [ev] = await db
        .select({ id: s.timelineEvents.id })
        .from(s.timelineEvents)
        .where(and(eq(s.timelineEvents.opportunityId, opp.id), eq(s.timelineEvents.type, "CREATED")));
      if (ev) await updateEvent(ev.id, { occurredAt: noon(created, "09:00", tz).toISOString() }, IMPORT);
    }

    for (const c of o.contacts ?? []) {
      const contactId = contactIds.get(c.contactKey)!;
      await linkContactToOpportunity(db, opp.id, contactId, c.role ?? null);
    }

    // Chronological replay of events, follow-ups and interviews.
    type Step = { date: string; order: number; run: () => Promise<unknown> };
    const steps: Step[] = [];
    for (const e of o.events ?? []) {
      steps.push({
        date: e.date,
        order: 1,
        run: async () => {
          await logCommunication(
            {
              opportunityId: opp.id,
              contactId: e.contactKey ? contactIds.get(e.contactKey) ?? null : null,
              type: e.type,
              title: e.title,
              body: e.body ?? null,
              occurredAt: noon(e.date, e.time, tz).toISOString(),
              channel: e.channel ?? null,
              direction: e.direction ?? null,
              countsAsResponse: e.countsAsResponse,
            },
            IMPORT,
          );
          counts.events++;
        },
      });
    }
    for (const f of o.followUps ?? []) {
      steps.push({
        date: f.date,
        order: 2,
        run: () => markFollowUpDone(opp.id, { date: f.date, note: f.note ?? null, channel: f.channel ?? null, contactId: f.contactKey ? contactIds.get(f.contactKey) ?? null : null }, IMPORT),
      });
    }
    for (const iv of o.interviews ?? []) {
      steps.push({
        date: iv.date ?? "9999-12-31",
        order: 3,
        run: async () => {
          await createInterview(
            {
              opportunityId: opp.id,
              kind: iv.kind,
              title: iv.title ?? null,
              scheduledAt: iv.date ? noon(iv.date, iv.time, iv.timeZone ?? tz).toISOString() : null,
              durationMinutes: iv.durationMinutes ?? null,
              location: iv.location ?? null,
              meetingUrl: iv.meetingUrl ?? null,
              participants: iv.participants ?? [],
              status: iv.status,
              outcome: iv.outcome ?? "PENDING",
              notes: iv.notes ?? null,
              feedback: iv.feedback ?? null,
            },
            IMPORT,
          );
          counts.interviews++;
        },
      });
    }
    steps.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));
    for (const step of steps) await step.run();

    // Final status (dated), then follow-up override.
    const [current] = await db
      .select({ key: s.pipelineStages.key })
      .from(s.opportunities)
      .innerJoin(s.pipelineStages, eq(s.pipelineStages.id, s.opportunities.stageId))
      .where(eq(s.opportunities.id, opp.id));
    if (current.key !== o.status) {
      await changeStatus(opp.id, { status: o.status, date: o.statusDate ?? null }, IMPORT);
    }
    if (o.nextFollowUpAt !== undefined && !closedFinal) {
      if (o.nextFollowUpAt) await scheduleFollowUp(opp.id, { date: o.nextFollowUpAt }, IMPORT);
      else await db.update(s.opportunities).set({ nextFollowUpAt: null }).where(eq(s.opportunities.id, opp.id));
    }
    if (o.followUpPaused) await db.update(s.opportunities).set({ followUpPaused: true, nextFollowUpAt: null }).where(eq(s.opportunities.id, opp.id));

    for (const d of o.documents ?? []) {
      const rel = d.path ? toLibraryRelative(d.path) : null;
      const versionId = rel ? versionByPath.get(`${d.documentKey}|${rel}`) : latestVersion.get(d.documentKey);
      if (!versionId) throw new Error(`${o.key}: no version for ${d.documentKey} ${d.path ?? "(latest)"}`);
      await attachDocument({ opportunityId: opp.id, documentVersionId: versionId, role: d.role, notes: d.notes ?? null }, IMPORT);
    }
    // Attachment events are dated at the application (they happened when it was sent).
    if (o.appliedAt && o.documents?.length) {
      await db
        .update(s.timelineEvents)
        .set({ occurredAt: noon(o.appliedAt, "12:01", tz) })
        .where(and(eq(s.timelineEvents.opportunityId, opp.id), eq(s.timelineEvents.type, "DOCUMENT_ATTACHED")));
      await db.update(s.opportunityDocuments).set({ attachedAt: noon(o.appliedAt, "12:01", tz) }).where(eq(s.opportunityDocuments.opportunityId, opp.id));
    }

    for (const t of o.tasks ?? []) {
      await createTask({ opportunityId: opp.id, title: t.title, dueDate: t.dueDate ?? null, kind: t.kind ?? "TODO", notes: t.notes ?? null, done: t.done ?? false }, IMPORT);
      counts.tasks++;
    }
    log(`  + ${o.type.padEnd(9)} ${o.status.padEnd(22)} ${o.title} — ${dataset.organizations.find((x) => x.key === o.organizationKey)?.name}`);
  }

  // General tasks
  for (const t of dataset.tasks) {
    if (await exists("tasks", state.tasks[t.key])) continue;
    const row = await createTask({ title: t.title, dueDate: t.dueDate ?? null, kind: t.kind ?? "TODO", notes: t.notes ?? null, done: t.done ?? false }, IMPORT);
    state.tasks[t.key] = row.id;
    counts.tasks++;
  }
  saveState(state);

  const rules = await evaluatePeriodicRules();
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.opportunities).where(isNull(s.opportunities.deletedAt));
  log(`\nImported: ${JSON.stringify(counts)}\nRules: ${JSON.stringify(rules)}\nOpportunities in database: ${total}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
