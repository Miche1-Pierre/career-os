import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Actor,
  CaptureSource,
  DocumentKind,
  EventType,
  InboxKind,
  InboxStatus,
  InterviewKind,
  InterviewOutcome,
  InterviewStatus,
  OpportunityType,
  OrgKind,
  PipelineKey,
  Priority,
  Relationship,
  RemotePolicy,
  StageCategory,
  TaskKind,
} from "@/lib/constants";
import type {
  InterviewParticipant,
  InterviewQuestion,
  OpportunityDetails,
  OpportunityLink,
  ProvenanceMap,
  StoredAnalysis,
} from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

const pk = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: "string" });
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);
const jsonList = <T>(name: string) =>
  jsonb(name)
    .$type<T[]>()
    .notNull()
    .default(sql`'[]'::jsonb`);
const jsonObject = <T>(name: string) =>
  jsonb(name)
    .$type<T>()
    .notNull()
    .default(sql`'{}'::jsonb`);
const isDemo = () => boolean("is_demo").notNull().default(false);

// ---------------------------------------------------------------------------
// Organizations (companies + institutions)
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: pk(),
    kind: text("kind").$type<OrgKind>().notNull().default("COMPANY"),
    name: text("name").notNull(),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    industry: text("industry"),
    size: text("size"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    notes: text("notes"),
    tags: textArray("tags"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("organizations_name_idx").on(sql`lower(${t.name})`), index("organizations_kind_idx").on(t.kind)],
);

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const contacts = pgTable(
  "contacts",
  {
    id: pk(),
    fullName: text("full_name").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    relationship: text("relationship").$type<Relationship>(),
    notes: text("notes"),
    tags: textArray("tags"),
    lastContactAt: day("last_contact_at"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("contacts_org_idx").on(t.organizationId), index("contacts_email_idx").on(sql`lower(${t.email})`)],
);

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: pk(),
    pipeline: text("pipeline").$type<PipelineKey>().notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    category: text("category").$type<StageCategory>().notNull(),
    color: text("color"),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pipeline_stages_pipeline_key_uq").on(t.pipeline, t.key)],
);

// ---------------------------------------------------------------------------
// Inbox (raw captures)
// ---------------------------------------------------------------------------

export interface InboxExtras {
  pageTitle?: string | null;
  finalUrl?: string | null;
  siteName?: string | null;
  jsonLd?: unknown[];
  email?: { from?: string | null; to?: string | null; subject?: string | null; date?: string | null } | null;
  truncated?: boolean;
  charCount?: number;
  pageCount?: number | null;
  warnings?: string[];
}

export interface InboxResultMeta {
  provider?: string;
  model?: string | null;
  promptId?: string;
  promptVersion?: string;
  durationMs?: number;
  costUsd?: number | null;
  analyzedAt?: string;
  by?: Actor;
}

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: pk(),
    status: text("status").$type<InboxStatus>().notNull().default("NEW"),
    kind: text("kind").$type<InboxKind>().notNull().default("UNKNOWN"),
    title: text("title"),
    sourceType: text("source_type").$type<CaptureSource>().notNull().default("PASTE"),
    sourceUrl: text("source_url"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    rawText: text("raw_text").notNull(),
    contentHash: text("content_hash"),
    extras: jsonObject<InboxExtras>("extras"),
    /** Structured analysis (CaptureAnalysis) — produced by the in-app AI provider or submitted by Claude via MCP. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    resultMeta: jsonObject<InboxResultMeta>("result_meta"),
    error: text("error"),
    convertedType: text("converted_type"),
    convertedId: uuid("converted_id"),
    convertedAt: ts("converted_at"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("inbox_status_idx").on(t.status, t.createdAt), index("inbox_hash_idx").on(t.contentHash)],
);

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const opportunities = pgTable(
  "opportunities",
  {
    id: pk(),
    type: text("type").$type<OpportunityType>().notNull(),
    title: text("title").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    priority: text("priority").$type<Priority>().notNull().default("NORMAL"),
    source: text("source"),
    sourceDetail: text("source_detail"),
    url: text("url"),
    links: jsonList<OpportunityLink>("links"),
    locationCity: text("location_city"),
    locationCountry: text("location_country"),
    locationText: text("location_text"),
    remotePolicy: text("remote_policy").$type<RemotePolicy>(),
    summary: text("summary"),
    description: text("description"),
    responsibilities: jsonList<string>("responsibilities"),
    requirements: jsonList<string>("requirements"),
    niceToHave: jsonList<string>("nice_to_have"),
    skills: jsonList<string>("skills"),
    technologies: jsonList<string>("technologies"),
    benefits: jsonList<string>("benefits"),
    requiredDocuments: jsonList<string>("required_documents"),
    details: jsonObject<OpportunityDetails>("details"),
    deadline: day("deadline"),
    deadlineTime: text("deadline_time"),
    applicationOpensAt: day("application_opens_at"),
    discoveredAt: day("discovered_at"),
    appliedAt: day("applied_at"),
    lastContactAt: day("last_contact_at"),
    firstResponseAt: day("first_response_at"),
    expectedResponseAt: day("expected_response_at"),
    nextFollowUpAt: day("next_follow_up_at"),
    followUpIntervalDays: integer("follow_up_interval_days"),
    followUpBusinessDays: boolean("follow_up_business_days"),
    followUpCount: integer("follow_up_count").notNull().default(0),
    followUpPaused: boolean("follow_up_paused").notNull().default(false),
    closedAt: day("closed_at"),
    notes: text("notes"),
    tags: textArray("tags"),
    analysis: jsonb("analysis").$type<StoredAnalysis>(),
    provenance: jsonObject<ProvenanceMap>("provenance"),
    captureId: uuid("capture_id").references(() => inboxItems.id, { onDelete: "set null" }),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("opportunities_stage_idx").on(t.stageId),
    index("opportunities_org_idx").on(t.organizationId),
    index("opportunities_type_idx").on(t.type),
    index("opportunities_follow_up_idx").on(t.nextFollowUpAt),
    index("opportunities_deadline_idx").on(t.deadline),
    index("opportunities_tags_idx").using("gin", t.tags),
  ],
);

export const opportunityContacts = pgTable(
  "opportunity_contacts",
  {
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.contactId] })],
);

// ---------------------------------------------------------------------------
// Documents & versions
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: pk(),
    name: text("name").notNull(),
    kind: text("kind").$type<DocumentKind>().notNull().default("OTHER"),
    description: text("description"),
    language: text("language"),
    tags: textArray("tags"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("documents_kind_idx").on(t.kind)],
);

export type DocumentStorage = "LIBRARY" | "UPLOAD" | "EXTERNAL";

export const documentVersions = pgTable(
  "document_versions",
  {
    id: pk(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    label: text("label"),
    storage: text("storage").$type<DocumentStorage>().notNull(),
    /** Human-facing path on the host (e.g. C:\Candidature\documents\CV\CV-HealthTech.pdf). */
    displayPath: text("display_path"),
    /** Path relative to the documents library (LIBRARY) or to the uploads folder (UPLOAD). */
    relativePath: text("relative_path"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    checksum: text("checksum"),
    /** Content-addressed copy kept by Career OS (sha256) — guarantees what was sent stays retrievable. */
    snapshotKey: text("snapshot_key"),
    fileModifiedAt: ts("file_modified_at"),
    notes: text("notes"),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("document_versions_doc_version_uq").on(t.documentId, t.version),
    index("document_versions_checksum_idx").on(t.checksum),
  ],
);

export const opportunityDocuments = pgTable(
  "opportunity_documents",
  {
    id: pk(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    role: text("role").$type<DocumentKind>().notNull(),
    notes: text("notes"),
    attachedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("opportunity_documents_uq").on(t.opportunityId, t.documentVersionId, t.role),
    index("opportunity_documents_version_idx").on(t.documentVersionId),
  ],
);

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export const interviews = pgTable(
  "interviews",
  {
    id: pk(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InterviewKind>().notNull().default("OTHER"),
    title: text("title"),
    scheduledAt: ts("scheduled_at"),
    durationMinutes: integer("duration_minutes"),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    participants: jsonList<InterviewParticipant>("participants"),
    status: text("status").$type<InterviewStatus>().notNull().default("SCHEDULED"),
    preparation: text("preparation"),
    questions: jsonList<InterviewQuestion>("questions"),
    notes: text("notes"),
    feedback: text("feedback"),
    outcome: text("outcome").$type<InterviewOutcome>().notNull().default("PENDING"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("interviews_opportunity_idx").on(t.opportunityId), index("interviews_scheduled_idx").on(t.scheduledAt)],
);

// ---------------------------------------------------------------------------
// Tasks (checklists + dated tasks)
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    interviewId: uuid("interview_id").references(() => interviews.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes"),
    kind: text("kind").$type<TaskKind>().notNull().default("TODO"),
    dueDate: day("due_date"),
    done: boolean("done").notNull().default(false),
    doneAt: ts("done_at"),
    position: integer("position").notNull().default(0),
    /** Auto-completion hook: doc:CV, doc:COVER_LETTER, status:APPLIED, followup, interview… */
    autoRule: text("auto_rule"),
    origin: text("origin").$type<Actor | "TEMPLATE">().notNull().default("USER"),
    /** Idempotency key for automation-created tasks. */
    ruleKey: text("rule_key"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_opportunity_idx").on(t.opportunityId),
    index("tasks_due_idx").on(t.done, t.dueDate),
    uniqueIndex("tasks_rule_key_uq").on(t.ruleKey),
  ],
);

// ---------------------------------------------------------------------------
// Timeline & audit
// ---------------------------------------------------------------------------

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: pk(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    interviewId: uuid("interview_id").references(() => interviews.id, { onDelete: "set null" }),
    type: text("type").$type<EventType>().notNull(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    title: text("title").notNull(),
    body: text("body"),
    channel: text("channel"),
    direction: text("direction").$type<"INBOUND" | "OUTBOUND">(),
    actor: text("actor").$type<Actor>().notNull().default("USER"),
    metadata: jsonObject<Record<string, unknown>>("metadata"),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    index("timeline_opportunity_idx").on(t.opportunityId, t.occurredAt),
    index("timeline_contact_idx").on(t.contactId),
    index("timeline_org_idx").on(t.organizationId),
    index("timeline_occurred_idx").on(t.occurredAt),
  ],
);

export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary"),
    changes: jsonList<AuditChange>("changes"),
    actor: text("actor").$type<Actor>().notNull().default("USER"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Tags, settings, views, goals, notifications
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: pk(),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_name_uq").on(sql`lower(${t.name})`)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export interface SavedViewFilters {
  q?: string;
  family?: "JOB" | "EDUCATION";
  types?: string[];
  categories?: string[];
  stages?: string[];
  tags?: string[];
  sources?: string[];
  priorities?: string[];
  countries?: string[];
  includeClosed?: boolean;
  sort?: string;
}

export const savedViews = pgTable("saved_views", {
  id: pk(),
  name: text("name").notNull(),
  filters: jsonObject<SavedViewFilters>("filters"),
  position: integer("position").notNull().default(0),
  isDemo: isDemo(),
  createdAt: createdAt(),
});

export const goals = pgTable("goals", {
  id: pk(),
  title: text("title").notNull(),
  /** APPLICATIONS_SENT | OPPORTUNITIES_ADDED | INTERVIEWS | FOLLOW_UPS */
  metric: text("metric").notNull(),
  target: integer("target").notNull(),
  /** WEEK | MONTH | QUARTER | CUSTOM */
  period: text("period").notNull().default("MONTH"),
  filters: jsonObject<{ types?: string[]; family?: string; tags?: string[] }>("filters"),
  startDate: day("start_date"),
  endDate: day("end_date"),
  archived: boolean("archived").notNull().default(false),
  isDemo: isDemo(),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    /** Idempotency key (one notification per rule firing). */
    key: text("key").notNull(),
    action: jsonb("action").$type<{ type: string; label: string; payload?: Record<string, unknown> } | null>(),
    readAt: ts("read_at"),
    dismissedAt: ts("dismissed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notifications_key_uq").on(t.key), index("notifications_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations (relational query builder)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  opportunities: many(opportunities),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
  opportunityLinks: many(opportunityContacts),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({
  opportunities: many(opportunities),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  organization: one(organizations, { fields: [opportunities.organizationId], references: [organizations.id] }),
  stage: one(pipelineStages, { fields: [opportunities.stageId], references: [pipelineStages.id] }),
  capture: one(inboxItems, { fields: [opportunities.captureId], references: [inboxItems.id] }),
  contactLinks: many(opportunityContacts),
  documentLinks: many(opportunityDocuments),
  interviews: many(interviews),
  tasks: many(tasks),
  events: many(timelineEvents),
}));

export const opportunityContactsRelations = relations(opportunityContacts, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunityContacts.opportunityId], references: [opportunities.id] }),
  contact: one(contacts, { fields: [opportunityContacts.contactId], references: [contacts.id] }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  versions: many(documentVersions),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  document: one(documents, { fields: [documentVersions.documentId], references: [documents.id] }),
  usages: many(opportunityDocuments),
}));

export const opportunityDocumentsRelations = relations(opportunityDocuments, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunityDocuments.opportunityId], references: [opportunities.id] }),
  version: one(documentVersions, { fields: [opportunityDocuments.documentVersionId], references: [documentVersions.id] }),
}));

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  opportunity: one(opportunities, { fields: [interviews.opportunityId], references: [opportunities.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  opportunity: one(opportunities, { fields: [tasks.opportunityId], references: [opportunities.id] }),
  interview: one(interviews, { fields: [tasks.interviewId], references: [interviews.id] }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  opportunity: one(opportunities, { fields: [timelineEvents.opportunityId], references: [opportunities.id] }),
  organization: one(organizations, { fields: [timelineEvents.organizationId], references: [organizations.id] }),
  contact: one(contacts, { fields: [timelineEvents.contactId], references: [contacts.id] }),
  interview: one(interviews, { fields: [timelineEvents.interviewId], references: [interviews.id] }),
}));

export const inboxItemsRelations = relations(inboxItems, ({ many }) => ({
  opportunities: many(opportunities),
}));

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type OpportunityDocument = typeof opportunityDocuments.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
