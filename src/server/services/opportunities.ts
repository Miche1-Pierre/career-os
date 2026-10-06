import { and, arrayOverlaps, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import {
  contacts,
  documents,
  documentVersions,
  inboxItems,
  interviews,
  opportunities,
  opportunityContacts,
  opportunityDocuments,
  organizations,
  pipelineStages,
  tasks,
  timelineEvents,
  type Opportunity,
  type PipelineStage,
} from "@/server/db/schema";
import {
  opportunityInputSchema,
  opportunityPatchSchema,
  type OpportunityInput,
  type OpportunityPatch,
  type ProvenanceMap,
} from "@/lib/schemas";
import {
  CLOSED_CATEGORIES,
  FOLLOW_UP_STAGE_KEYS,
  OPPORTUNITY_TYPE_META,
  PRE_SUBMIT_CATEGORIES,
  PRIORITY_META,
  RESPONSE_STAGE_KEYS,
  STAGE_CATEGORY_META,
  SUBMITTED_CATEGORIES,
  familyOf,
  type OpportunityType,
  type Priority,
  type StageCategory,
} from "@/lib/constants";
import { findDuplicateMatches, STRONG_DUPLICATE, type DuplicateMatch } from "@/lib/duplicates";
import { provenanceKeyFor } from "@/lib/capture-schema";
import { computeNextFollowUp, resolveFollowUpInterval } from "@/lib/followups";
import { todayISO, type ISODate } from "@/lib/dates";
import { normalizedContains } from "@/server/db/sql-helpers";
import { AppError, notFound, type Ctx } from "@/server/context";
import { diffFields, logAudit } from "./audit";
import { businessCalendar, getSettings } from "./settings";
import { getStage, mapStageToPipeline, resolveStage } from "./stages";
import { canonicalizeTags } from "./tags";
import { findOrCreateOrganization } from "./organizations";
import { linkContactToOpportunity, upsertContactFromRef } from "./contacts";
import { addEvent } from "./timeline";
import { applyChecklist, completeAutoRule } from "./tasks";
import { onStatusChanged } from "./rules";

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface OpportunityFilters {
  q?: string;
  family?: "JOB" | "EDUCATION";
  types?: OpportunityType[];
  categories?: StageCategory[];
  stageIds?: string[];
  stageKeys?: string[];
  tags?: string[];
  sources?: string[];
  priorities?: Priority[];
  countries?: string[];
  organizationId?: string;
  includeClosed?: boolean;
  archived?: "exclude" | "only" | "include";
  deleted?: boolean;
  hasDeadline?: boolean;
  sort?: "updated" | "created" | "deadline" | "followup" | "priority" | "title" | "applied" | "organization";
  limit?: number;
  offset?: number;
}

export interface OpportunityListItem {
  id: string;
  type: OpportunityType;
  title: string;
  priority: Priority;
  source: string | null;
  url: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  locationText: string | null;
  remotePolicy: Opportunity["remotePolicy"];
  deadline: string | null;
  deadlineTime: string | null;
  applicationOpensAt: string | null;
  appliedAt: string | null;
  nextFollowUpAt: string | null;
  followUpPaused: boolean;
  followUpCount: number;
  lastContactAt: string | null;
  firstResponseAt: string | null;
  expectedResponseAt: string | null;
  closedAt: string | null;
  tags: string[];
  summary: string | null;
  details: Opportunity["details"];
  isDemo: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organization: { id: string; name: string; kind: string } | null;
  stage: { id: string; key: string; label: string; category: StageCategory; color: string | null; position: number };
}

const listColumns = {
  id: opportunities.id,
  type: opportunities.type,
  title: opportunities.title,
  priority: opportunities.priority,
  source: opportunities.source,
  url: opportunities.url,
  locationCity: opportunities.locationCity,
  locationCountry: opportunities.locationCountry,
  locationText: opportunities.locationText,
  remotePolicy: opportunities.remotePolicy,
  deadline: opportunities.deadline,
  deadlineTime: opportunities.deadlineTime,
  applicationOpensAt: opportunities.applicationOpensAt,
  appliedAt: opportunities.appliedAt,
  nextFollowUpAt: opportunities.nextFollowUpAt,
  followUpPaused: opportunities.followUpPaused,
  followUpCount: opportunities.followUpCount,
  lastContactAt: opportunities.lastContactAt,
  firstResponseAt: opportunities.firstResponseAt,
  expectedResponseAt: opportunities.expectedResponseAt,
  closedAt: opportunities.closedAt,
  tags: opportunities.tags,
  summary: opportunities.summary,
  details: opportunities.details,
  isDemo: opportunities.isDemo,
  archivedAt: opportunities.archivedAt,
  deletedAt: opportunities.deletedAt,
  createdAt: opportunities.createdAt,
  updatedAt: opportunities.updatedAt,
  orgId: organizations.id,
  orgName: organizations.name,
  orgKind: organizations.kind,
  stageId: pipelineStages.id,
  stageKey: pipelineStages.key,
  stageLabel: pipelineStages.label,
  stageCategory: pipelineStages.category,
  stageColor: pipelineStages.color,
  stagePosition: pipelineStages.position,
};

type ListRow = { [K in keyof typeof listColumns]: unknown };

function mapListRow(r: ListRow): OpportunityListItem {
  const row = r as unknown as Record<string, never>;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    priority: row.priority,
    source: row.source,
    url: row.url,
    locationCity: row.locationCity,
    locationCountry: row.locationCountry,
    locationText: row.locationText,
    remotePolicy: row.remotePolicy,
    deadline: row.deadline,
    deadlineTime: row.deadlineTime,
    applicationOpensAt: row.applicationOpensAt,
    appliedAt: row.appliedAt,
    nextFollowUpAt: row.nextFollowUpAt,
    followUpPaused: row.followUpPaused,
    followUpCount: row.followUpCount,
    lastContactAt: row.lastContactAt,
    firstResponseAt: row.firstResponseAt,
    expectedResponseAt: row.expectedResponseAt,
    closedAt: row.closedAt,
    tags: row.tags ?? [],
    summary: row.summary,
    details: row.details ?? {},
    isDemo: row.isDemo,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    organization: row.orgId ? { id: row.orgId, name: row.orgName, kind: row.orgKind } : null,
    stage: {
      id: row.stageId,
      key: row.stageKey,
      label: row.stageLabel,
      category: row.stageCategory,
      color: row.stageColor,
      position: row.stagePosition,
    },
  };
}

function typesForFamily(family: "JOB" | "EDUCATION"): OpportunityType[] {
  return (Object.keys(OPPORTUNITY_TYPE_META) as OpportunityType[]).filter((t) => familyOf(t) === family);
}

export function buildOpportunityConditions(f: OpportunityFilters): (SQL | undefined)[] {
  const archived = f.archived ?? "exclude";
  const types = f.types?.length ? f.types : f.family ? typesForFamily(f.family) : undefined;
  return [
    f.deleted ? isNotNull(opportunities.deletedAt) : isNull(opportunities.deletedAt),
    f.deleted ? undefined : archived === "exclude" ? isNull(opportunities.archivedAt) : archived === "only" ? isNotNull(opportunities.archivedAt) : undefined,
    types ? inArray(opportunities.type, types) : undefined,
    f.categories?.length ? inArray(pipelineStages.category, f.categories) : undefined,
    f.includeClosed === false ? sql`${pipelineStages.category} not in ('WON','LOST')` : undefined,
    f.stageIds?.length ? inArray(opportunities.stageId, f.stageIds) : undefined,
    f.stageKeys?.length ? inArray(pipelineStages.key, f.stageKeys) : undefined,
    f.tags?.length ? arrayOverlaps(opportunities.tags, f.tags) : undefined,
    f.sources?.length ? inArray(opportunities.source, f.sources) : undefined,
    f.priorities?.length ? inArray(opportunities.priority, f.priorities) : undefined,
    f.countries?.length ? inArray(opportunities.locationCountry, f.countries) : undefined,
    f.organizationId ? eq(opportunities.organizationId, f.organizationId) : undefined,
    f.hasDeadline ? isNotNull(opportunities.deadline) : undefined,
    f.q
      ? sql`(${normalizedContains(opportunities.title, f.q)} or ${normalizedContains(organizations.name, f.q)} or ${normalizedContains(
          opportunities.locationCity,
          f.q,
        )} or ${normalizedContains(sql`array_to_string(${opportunities.tags}, ' ')`, f.q)} or ${normalizedContains(opportunities.summary, f.q)})`
      : undefined,
  ];
}

function orderFor(sort: OpportunityFilters["sort"]) {
  switch (sort) {
    case "created":
      return [desc(opportunities.createdAt)];
    case "deadline":
      return [sql`${opportunities.deadline} asc nulls last`, desc(opportunities.updatedAt)];
    case "followup":
      return [sql`${opportunities.nextFollowUpAt} asc nulls last`, desc(opportunities.updatedAt)];
    case "priority":
      return [
        sql`case ${opportunities.priority} when 'CRITICAL' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end`,
        desc(opportunities.updatedAt),
      ];
    case "title":
      return [asc(opportunities.title)];
    case "organization":
      return [sql`${organizations.name} asc nulls last`, asc(opportunities.title)];
    case "applied":
      return [sql`${opportunities.appliedAt} desc nulls last`, desc(opportunities.updatedAt)];
    default:
      return [desc(opportunities.updatedAt)];
  }
}

export async function listOpportunities(filters: OpportunityFilters = {}): Promise<OpportunityListItem[]> {
  const rows = await db
    .select(listColumns)
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(...buildOpportunityConditions(filters)))
    .orderBy(...orderFor(filters.sort))
    .limit(Math.min(filters.limit ?? 500, 2000))
    .offset(filters.offset ?? 0);
  return rows.map((r) => mapListRow(r as ListRow));
}

export async function countOpportunities(filters: OpportunityFilters = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(...buildOpportunityConditions(filters)));
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getOpportunity(id: string) {
  const opp = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, id),
    with: { organization: true, stage: true },
  });
  if (!opp) throw notFound("Opportunity");
  const [contactRows, documentRows, interviewRows, taskRows, eventRows, capture] = await Promise.all([
    db
      .select({ contact: contacts, role: opportunityContacts.role })
      .from(opportunityContacts)
      .innerJoin(contacts, eq(contacts.id, opportunityContacts.contactId))
      .where(eq(opportunityContacts.opportunityId, id))
      .orderBy(asc(contacts.fullName)),
    db
      .select({ link: opportunityDocuments, version: documentVersions, document: documents })
      .from(opportunityDocuments)
      .innerJoin(documentVersions, eq(documentVersions.id, opportunityDocuments.documentVersionId))
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(eq(opportunityDocuments.opportunityId, id))
      .orderBy(asc(opportunityDocuments.attachedAt)),
    db.select().from(interviews).where(eq(interviews.opportunityId, id)).orderBy(sql`${interviews.scheduledAt} asc nulls last`),
    db.select().from(tasks).where(eq(tasks.opportunityId, id)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
    db.select().from(timelineEvents).where(eq(timelineEvents.opportunityId, id)).orderBy(desc(timelineEvents.occurredAt)).limit(300),
    opp.captureId
      ? db
          .select({
            id: inboxItems.id,
            sourceType: inboxItems.sourceType,
            sourceUrl: inboxItems.sourceUrl,
            fileName: inboxItems.fileName,
            createdAt: inboxItems.createdAt,
            kind: inboxItems.kind,
          })
          .from(inboxItems)
          .where(eq(inboxItems.id, opp.captureId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return {
    ...opp,
    contacts: contactRows.map((r) => ({ ...r.contact, opportunityRole: r.role })),
    documents: documentRows.map((r) => ({ ...r.link, version: r.version, document: r.document })),
    interviews: interviewRows,
    tasks: taskRows,
    events: eventRows,
    capture,
  };
}
export type OpportunityDetail = Awaited<ReturnType<typeof getOpportunity>>;

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export interface DuplicateResult extends DuplicateMatch {
  title: string;
  organizationName: string | null;
  stageLabel: string;
  type: OpportunityType;
  createdAt: Date;
}

export async function findDuplicates(
  query: { title?: string | null; organizationName?: string | null; organizationId?: string | null; url?: string | null },
  options: { excludeId?: string } = {},
  tx: DBOrTx = db,
): Promise<DuplicateResult[]> {
  let orgName = query.organizationName ?? null;
  if (!orgName && query.organizationId) {
    const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, query.organizationId));
    orgName = org?.name ?? null;
  }
  const rows = await tx
    .select({
      id: opportunities.id,
      title: opportunities.title,
      url: opportunities.url,
      links: opportunities.links,
      type: opportunities.type,
      createdAt: opportunities.createdAt,
      organizationName: organizations.name,
      stageLabel: pipelineStages.label,
    })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(isNull(opportunities.deletedAt));
  const candidates = rows.filter((r) => r.id !== options.excludeId);
  const matches = findDuplicateMatches({ title: query.title, organizationName: orgName, url: query.url }, candidates);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return matches.map((m) => {
    const c = byId.get(m.id)!;
    return { ...m, title: c.title, organizationName: c.organizationName, stageLabel: c.stageLabel, type: c.type, createdAt: c.createdAt };
  });
}

// ---------------------------------------------------------------------------
// Provenance helpers
// ---------------------------------------------------------------------------

/** Stamp provenance entries with actor + timestamp, normalizing keys (organizationName → organizationId, salaryMin → details.salaryMin…). */
function stampProvenance(map: ProvenanceMap | undefined, ctx: Ctx, captureId?: string | null): ProvenanceMap {
  const out: ProvenanceMap = {};
  const at = new Date().toISOString();
  for (const [field, entry] of Object.entries(map ?? {})) {
    const key = provenanceKeyFor(field.replace(/^details\./, ""));
    out[key] = { ...entry, by: entry.by ?? ctx.actor, at: entry.at ?? at, captureId: entry.captureId ?? captureId ?? null };
  }
  return out;
}

const PROVENANCE_TRACKED = [
  "title",
  "organizationId",
  "locationCity",
  "locationCountry",
  "locationText",
  "remotePolicy",
  "url",
  "summary",
  "responsibilities",
  "requirements",
  "niceToHave",
  "skills",
  "technologies",
  "benefits",
  "requiredDocuments",
  "deadline",
  "deadlineTime",
  "applicationOpensAt",
  "source",
] as const;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateOpportunityResult {
  created: boolean;
  opportunity: Opportunity | null;
  duplicates: DuplicateResult[];
}

export async function createOpportunity(
  raw: OpportunityInput,
  ctx: Ctx,
  options: { force?: boolean; isDemo?: boolean } = {},
): Promise<CreateOpportunityResult> {
  const input = opportunityInputSchema.parse(raw);
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = todayISO(tz);

  const duplicates = await findDuplicates({
    title: input.title,
    organizationName: input.organizationName,
    organizationId: input.organizationId,
    url: input.url,
  });
  if (!options.force && duplicates.some((d) => d.score >= STRONG_DUPLICATE)) {
    return { created: false, opportunity: null, duplicates };
  }

  const opportunity = await db.transaction(async (tx) => {
    const meta = OPPORTUNITY_TYPE_META[input.type];
    let organizationId = input.organizationId ?? null;
    if (!organizationId && input.organizationName) {
      const org = await findOrCreateOrganization(
        tx,
        { name: input.organizationName, kind: meta.orgKind, website: input.organizationWebsite, city: input.locationCity, country: input.locationCountry },
        ctx,
      );
      organizationId = org.id;
    }
    const stage = await resolveStage(familyOf(input.type), input.status, tx);
    const submitted = SUBMITTED_CATEGORIES.includes(stage.category);
    const appliedAt = input.appliedAt ?? (submitted ? today : null);
    const interval = resolveFollowUpInterval(
      { type: input.type, source: input.source, followUpIntervalDays: input.followUpIntervalDays, followUpBusinessDays: input.followUpBusinessDays, expectedResponseAt: input.expectedResponseAt },
      settings.followUp,
    );
    let nextFollowUpAt = input.nextFollowUpAt ?? null;
    if (!nextFollowUpAt && appliedAt && stage.category === "APPLIED" && settings.followUp.autoScheduleOnApply) {
      nextFollowUpAt = computeNextFollowUp(appliedAt, interval, { calendar: businessCalendar(settings), expectedResponseAt: input.expectedResponseAt });
    }
    const tagList = await canonicalizeTags(tx, input.tags);
    const provenance = stampProvenance(input.provenance, ctx, input.captureId);

    const [row] = await tx
      .insert(opportunities)
      .values({
        type: input.type,
        title: input.title,
        organizationId,
        stageId: stage.id,
        priority: input.priority ?? "NORMAL",
        source: input.source ?? null,
        sourceDetail: input.sourceDetail ?? null,
        url: input.url ?? null,
        links: input.links ?? [],
        locationCity: input.locationCity ?? null,
        locationCountry: input.locationCountry ?? null,
        locationText: input.locationText ?? null,
        remotePolicy: input.remotePolicy ?? null,
        summary: input.summary ?? null,
        description: input.description ?? null,
        responsibilities: input.responsibilities ?? [],
        requirements: input.requirements ?? [],
        niceToHave: input.niceToHave ?? [],
        skills: input.skills ?? [],
        technologies: input.technologies ?? [],
        benefits: input.benefits ?? [],
        requiredDocuments: input.requiredDocuments ?? [],
        details: input.details ?? {},
        deadline: input.deadline ?? null,
        deadlineTime: input.deadlineTime ?? null,
        applicationOpensAt: input.applicationOpensAt ?? null,
        discoveredAt: input.discoveredAt ?? today,
        appliedAt,
        lastContactAt: appliedAt,
        expectedResponseAt: input.expectedResponseAt ?? null,
        nextFollowUpAt,
        followUpIntervalDays: input.followUpIntervalDays ?? null,
        followUpBusinessDays: input.followUpBusinessDays ?? null,
        closedAt: CLOSED_CATEGORIES.includes(stage.category) ? today : null,
        notes: input.notes ?? null,
        tags: tagList,
        provenance,
        captureId: input.captureId ?? null,
        isDemo: options.isDemo ?? false,
      })
      .returning();

    for (const ref of input.contacts ?? []) {
      const contact = await upsertContactFromRef(tx, ref, { organizationId }, ctx);
      if (contact) await linkContactToOpportunity(tx, row.id, contact.id, ref.opportunityRole ?? ref.role ?? null);
    }

    if (input.applyTemplate !== false) await applyChecklist(tx, row, settings, ctx);
    if (submitted) await completeAutoRule(tx, row.id, "status:APPLIED");

    await addEvent(
      tx,
      {
        opportunityId: row.id,
        type: input.captureId ? "IMPORTED" : "CREATED",
        title: input.captureId ? `Imported (${ctx.actor === "CLAUDE" ? "Claude" : ctx.actor === "AI" ? "AI extraction" : "capture"})` : "Opportunity created",
        metadata: { stage: stage.key, captureId: input.captureId ?? null },
        isDemo: options.isDemo,
      },
      ctx,
    );
    if (appliedAt) {
      await addEvent(
        tx,
        { opportunityId: row.id, type: "APPLIED", title: "Application submitted", occurredAt: new Date(`${appliedAt}T12:00:00Z`), isDemo: options.isDemo },
        ctx,
      );
    }
    if (input.captureId) {
      await tx
        .update(inboxItems)
        .set({ status: "CONVERTED", convertedType: "opportunity", convertedId: row.id, convertedAt: new Date() })
        .where(eq(inboxItems.id, input.captureId));
    }
    await logAudit(tx, { entityType: "opportunity", entityId: row.id, action: "CREATE", summary: `${row.title} (${stage.label})` }, ctx);
    return row;
  });

  return { created: true, opportunity, duplicates };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const AUDITED_FIELDS = [
  "type",
  "title",
  "organizationId",
  "priority",
  "source",
  "sourceDetail",
  "url",
  "links",
  "locationCity",
  "locationCountry",
  "locationText",
  "remotePolicy",
  "summary",
  "description",
  "responsibilities",
  "requirements",
  "niceToHave",
  "skills",
  "technologies",
  "benefits",
  "requiredDocuments",
  "details",
  "deadline",
  "deadlineTime",
  "applicationOpensAt",
  "discoveredAt",
  "appliedAt",
  "expectedResponseAt",
  "nextFollowUpAt",
  "followUpIntervalDays",
  "followUpBusinessDays",
  "followUpPaused",
  "notes",
  "tags",
];

export async function updateOpportunity(id: string, raw: OpportunityPatch, ctx: Ctx) {
  const patch = opportunityPatchSchema.parse(raw);
  const settings = await getSettings();
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(opportunities).where(eq(opportunities.id, id));
    if (!before) throw notFound("Opportunity");
    const { status, organizationName, organizationWebsite, provenance: incomingProvenance, captureId: _captureId, ...fields } = patch;
    void _captureId;
    const values: Partial<typeof opportunities.$inferInsert> = { ...fields };

    // Organization by name
    if (organizationName !== undefined && patch.organizationId === undefined) {
      if (organizationName) {
        const type = patch.type ?? before.type;
        const org = await findOrCreateOrganization(tx, { name: organizationName, kind: OPPORTUNITY_TYPE_META[type].orgKind, website: organizationWebsite }, ctx);
        values.organizationId = org.id;
      } else values.organizationId = null;
    }
    if (patch.tags) values.tags = await canonicalizeTags(tx, patch.tags);
    if (patch.details) values.details = { ...before.details, ...patch.details };

    // Type change → map the stage into the new pipeline.
    if (patch.type && patch.type !== before.type && familyOf(patch.type) !== familyOf(before.type)) {
      const currentStage = await getStage(before.stageId, tx);
      const mapped = await mapStageToPipeline(currentStage, familyOf(patch.type), tx);
      values.stageId = mapped.id;
    }

    // Provenance: explicit entries win; other changed fields become USER_ENTERED (or cleared).
    const provenance: ProvenanceMap = { ...(before.provenance ?? {}) };
    const stamped = stampProvenance(incomingProvenance, ctx);
    for (const field of PROVENANCE_TRACKED) {
      if (!(field in values)) continue;
      const newValue = (values as Record<string, unknown>)[field];
      const oldValue = (before as Record<string, unknown>)[field];
      if (JSON.stringify(newValue) === JSON.stringify(oldValue)) continue;
      if (stamped[field]) continue;
      const empty = newValue == null || newValue === "" || (Array.isArray(newValue) && newValue.length === 0);
      if (empty) delete provenance[field];
      else provenance[field] = { source: "USER_ENTERED", by: ctx.actor, at: new Date().toISOString() };
    }
    if (patch.details) {
      for (const [key, value] of Object.entries(patch.details)) {
        const field = `details.${key}`;
        if (stamped[field]) continue;
        if (JSON.stringify(value) === JSON.stringify((before.details as Record<string, unknown>)[key])) continue;
        if (value == null || value === "") delete provenance[field];
        else provenance[field] = { source: "USER_ENTERED", by: ctx.actor, at: new Date().toISOString() };
      }
    }
    Object.assign(provenance, stamped);
    values.provenance = provenance;

    const [row] = await tx.update(opportunities).set(values).where(eq(opportunities.id, id)).returning();
    const changes = diffFields(before, row, AUDITED_FIELDS.filter((f) => f in values));
    if (changes.length) await logAudit(tx, { entityType: "opportunity", entityId: id, action: "UPDATE", changes }, ctx);
    if (patch.deadline !== undefined && patch.deadline !== before.deadline) {
      await addEvent(
        tx,
        {
          opportunityId: id,
          type: "DEADLINE_CHANGED",
          title: patch.deadline ? `Deadline set to ${patch.deadline}` : "Deadline removed",
          metadata: { from: before.deadline, to: patch.deadline },
        },
        ctx,
      );
    }
    return { row, status };
  });
  if (result.status) await changeStatus(id, { status: result.status }, ctx, { settings });
  return result.row;
}

// ---------------------------------------------------------------------------
// Status changes (the heart of the pipeline semantics)
// ---------------------------------------------------------------------------

export interface StatusChangeOptions {
  /** Internal: the follow-up bookkeeping was already done by markFollowUpDone. */
  skipFollowUpBookkeeping?: boolean;
  settings?: Awaited<ReturnType<typeof getSettings>>;
}

export async function changeStatus(
  id: string,
  input: { status: string; date?: ISODate | null; note?: string | null },
  ctx: Ctx,
  options: StatusChangeOptions = {},
) {
  const settings = options.settings ?? (await getSettings());
  const today = todayISO(settings.general.timezone);
  const date = input.date ?? today;
  const outcome = await db.transaction(async (tx) => {
    const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, id));
    if (!opp) throw notFound("Opportunity");
    const from = await getStage(opp.stageId, tx);
    const to = await resolveStage(familyOf(opp.type), input.status, tx);
    if (from.id === to.id) return { opportunity: opp, from, to, changed: false };

    const updates: Partial<typeof opportunities.$inferInsert> = { stageId: to.id };
    const calendar = businessCalendar(settings);
    const interval = resolveFollowUpInterval(opp, settings.followUp);

    const submittedNow = SUBMITTED_CATEGORIES.includes(to.category);
    if (submittedNow && !opp.appliedAt) {
      updates.appliedAt = date;
      updates.lastContactAt = opp.lastContactAt ?? date;
    }
    const appliedAt = updates.appliedAt ?? opp.appliedAt;
    if (to.category === "APPLIED" && PRE_SUBMIT_CATEGORIES.includes(from.category) && settings.followUp.autoScheduleOnApply && !opp.followUpPaused) {
      updates.nextFollowUpAt = computeNextFollowUp(appliedAt ?? date, interval, { calendar, expectedResponseAt: opp.expectedResponseAt });
    }
    if (FOLLOW_UP_STAGE_KEYS.has(to.key) && !options.skipFollowUpBookkeeping) {
      updates.followUpCount = opp.followUpCount + 1;
      updates.lastContactAt = date;
      updates.nextFollowUpAt = computeNextFollowUp(date, interval, { calendar, expectedResponseAt: opp.expectedResponseAt });
    }
    if (to.category === "INTERVIEW" || to.category === "OFFER" || to.category === "WON" || RESPONSE_STAGE_KEYS.has(to.key)) {
      updates.firstResponseAt = opp.firstResponseAt ?? date;
      updates.lastContactAt = date > (opp.lastContactAt ?? "") ? date : opp.lastContactAt;
    }
    if (to.category === "INTERVIEW" || to.category === "OFFER") updates.nextFollowUpAt = null;
    if (CLOSED_CATEGORIES.includes(to.category)) {
      updates.closedAt = date;
      updates.nextFollowUpAt = null;
    } else if (CLOSED_CATEGORIES.includes(from.category)) {
      updates.closedAt = null;
    }
    if (PRE_SUBMIT_CATEGORIES.includes(to.category) && !PRE_SUBMIT_CATEGORIES.includes(from.category)) {
      // Moved back before submission: keep history but stop reminders.
      updates.nextFollowUpAt = null;
    }

    const [row] = await tx.update(opportunities).set(updates).where(eq(opportunities.id, id)).returning();
    const occurredAt = date === today ? new Date() : new Date(`${date}T12:00:00Z`);
    await addEvent(
      tx,
      {
        opportunityId: id,
        type: "STATUS_CHANGED",
        title: `${from.label} → ${to.label}`,
        body: input.note ?? null,
        occurredAt,
        metadata: { fromKey: from.key, toKey: to.key, fromCategory: from.category, toCategory: to.category },
      },
      ctx,
    );
    if (submittedNow && !opp.appliedAt) {
      await addEvent(tx, { opportunityId: id, type: "APPLIED", title: "Application submitted", occurredAt }, ctx);
    }
    if (to.category === "OFFER") {
      await addEvent(tx, { opportunityId: id, type: "OFFER_RECEIVED", title: familyOf(opp.type) === "EDUCATION" ? "Admission received" : "Offer received", occurredAt }, ctx);
    }
    if (to.key === "REJECTED") await addEvent(tx, { opportunityId: id, type: "REJECTED", title: "Rejected", occurredAt }, ctx);
    if (submittedNow) await completeAutoRule(tx, id, "status:APPLIED");
    await logAudit(
      tx,
      { entityType: "opportunity", entityId: id, action: "STATUS_CHANGE", changes: [{ field: "status", from: from.key, to: to.key }], summary: `${from.label} → ${to.label}` },
      ctx,
    );
    return { opportunity: row, from, to, changed: true };
  });
  if (outcome.changed) await onStatusChanged(outcome.opportunity, outcome.from, outcome.to, settings);
  return outcome;
}

// ---------------------------------------------------------------------------
// Archive / delete / restore
// ---------------------------------------------------------------------------

export async function setOpportunityArchived(id: string, archived: boolean, ctx: Ctx) {
  const [row] = await db.update(opportunities).set({ archivedAt: archived ? new Date() : null }).where(eq(opportunities.id, id)).returning();
  if (!row) throw notFound("Opportunity");
  await logAudit(db, { entityType: "opportunity", entityId: id, action: archived ? "ARCHIVE" : "UNARCHIVE", summary: row.title }, ctx);
  return row;
}

export async function softDeleteOpportunity(id: string, ctx: Ctx) {
  const [row] = await db.update(opportunities).set({ deletedAt: new Date() }).where(eq(opportunities.id, id)).returning();
  if (!row) throw notFound("Opportunity");
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "DELETE", summary: row.title }, ctx);
  return row;
}

export async function restoreOpportunity(id: string, ctx: Ctx) {
  const [row] = await db.update(opportunities).set({ deletedAt: null }).where(eq(opportunities.id, id)).returning();
  if (!row) throw notFound("Opportunity");
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "RESTORE", summary: row.title }, ctx);
  return row;
}

/** Permanent deletion (from the trash only). Document versions and files are kept. */
export async function hardDeleteOpportunity(id: string, ctx: Ctx) {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!row) throw notFound("Opportunity");
  if (!row.deletedAt) throw new AppError("CONFLICT", "Move the opportunity to the trash before deleting it permanently");
  await db.delete(opportunities).where(eq(opportunities.id, id));
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "PURGE", summary: row.title }, ctx);
}

export async function duplicateOpportunity(id: string, ctx: Ctx) {
  const source = await getOpportunity(id);
  const result = await createOpportunity(
    {
      type: source.type,
      title: `${source.title} (copy)`,
      organizationId: source.organizationId,
      priority: source.priority,
      source: source.source,
      url: null,
      links: source.links,
      locationCity: source.locationCity,
      locationCountry: source.locationCountry,
      remotePolicy: source.remotePolicy,
      summary: source.summary,
      description: source.description,
      responsibilities: source.responsibilities,
      requirements: source.requirements,
      niceToHave: source.niceToHave,
      skills: source.skills,
      technologies: source.technologies,
      benefits: source.benefits,
      requiredDocuments: source.requiredDocuments,
      details: source.details,
      tags: source.tags,
    },
    ctx,
    { force: true },
  );
  return result.opportunity!;
}

// ---------------------------------------------------------------------------
// Small helpers used by the UI
// ---------------------------------------------------------------------------

export function isClosedStage(stage: Pick<PipelineStage, "category">) {
  return CLOSED_CATEGORIES.includes(stage.category);
}

export function priorityWeight(priority: Priority) {
  return PRIORITY_META[priority]?.weight ?? 1;
}

export function categoryLabel(category: StageCategory) {
  return STAGE_CATEGORY_META[category].label;
}

export async function opportunityOptions(filters: { q?: string; limit?: number } = {}) {
  const rows = await listOpportunities({ q: filters.q, limit: filters.limit ?? 50, sort: "updated" });
  return rows.map((r) => ({ id: r.id, title: r.title, organizationName: r.organization?.name ?? null, type: r.type, stageLabel: r.stage.label }));
}
