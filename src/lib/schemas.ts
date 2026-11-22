/**
 * Zod schemas shared by the UI, the REST API and the MCP server.
 * Convention for patches: `undefined` = leave unchanged, `null` = clear the value.
 */
import { z } from "zod";
import {
  CHANNELS,
  CONFIDENCES,
  CONTRACT_TYPES,
  DOCUMENT_KINDS,
  EDUCATION_FORMATS,
  EVENT_TYPES,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_STATUSES,
  LINK_KINDS,
  OPPORTUNITY_TYPES,
  ORG_KINDS,
  PRIORITIES,
  PROVENANCE_SOURCES,
  RELATIONSHIPS,
  REMOTE_POLICIES,
  SALARY_PERIODS,
  TASK_KINDS,
} from "./constants";
import { isISODate } from "./dates";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const isoDateSchema = z.string().refine(isISODate, { message: "Expected a date formatted YYYY-MM-DD" });
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
export const uuidSchema = z.string().uuid();
const trimmed = z.string().trim();
const optText = (max = 2000) => trimmed.max(max).nullable().optional();
const stringList = (maxItems = 200) => z.array(trimmed.min(1).max(1000)).max(maxItems);
export const urlSchema = trimmed.max(2048).refine((v) => /^https?:\/\//i.test(v) || /^mailto:/i.test(v), {
  message: "Expected an http(s) URL",
});

// ---------------------------------------------------------------------------
// JSONB value types
// ---------------------------------------------------------------------------

export const linkSchema = z.object({
  kind: z.enum(LINK_KINDS).default("OTHER"),
  url: urlSchema,
  label: trimmed.max(200).nullable().optional(),
});
export type OpportunityLink = z.infer<typeof linkSchema>;

export const fieldProvenanceSchema = z.object({
  source: z.enum(PROVENANCE_SOURCES),
  confidence: z.enum(CONFIDENCES).nullable().optional(),
  /** Short quote from the original source supporting the value. */
  evidence: trimmed.max(600).nullable().optional(),
  /** True when the evidence was found verbatim (normalized) in the original source text. */
  verified: z.boolean().nullable().optional(),
  /** Who produced the value: AI (in-app), CLAUDE (via MCP), USER… */
  by: z.string().max(20).nullable().optional(),
  at: z.string().max(40).nullable().optional(),
  captureId: z.string().max(64).nullable().optional(),
});
export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>;
export const provenanceMapSchema = z.record(z.string().max(80), fieldProvenanceSchema);
export type ProvenanceMap = z.infer<typeof provenanceMapSchema>;

export const opportunityDetailsSchema = z
  .object({
    // Job family
    contractType: z.enum(CONTRACT_TYPES).nullable().optional(),
    seniority: optText(100),
    experienceYears: z.number().min(0).max(60).nullable().optional(),
    salaryMin: z.number().min(0).max(100_000_000).nullable().optional(),
    salaryMax: z.number().min(0).max(100_000_000).nullable().optional(),
    salaryCurrency: optText(10),
    salaryPeriod: z.enum(SALARY_PERIODS).nullable().optional(),
    salaryText: optText(300),
    department: optText(300),
    startDate: optText(100),
    duration: optText(100),
    languages: stringList(20).optional(),
    visaSponsorship: z.boolean().nullable().optional(),
    // Education family
    level: optText(100),
    degree: optText(200),
    entryYear: optText(50),
    format: z.enum(EDUCATION_FORMATS).nullable().optional(),
    ects: z.number().min(0).max(1000).nullable().optional(),
    tuitionFees: optText(300),
    applicationFee: optText(200),
    alternance: z.boolean().nullable().optional(),
    teachingLanguage: optText(100),
    languageRequirement: optText(300),
    subjects: stringList(100).optional(),
    careerOutcomes: stringList(100).optional(),
    selectionProcess: optText(2000),
    capacity: optText(100),
    supervisor: optText(200),
    lab: optText(300),
    funding: optText(300),
  })
  .partial();
export type OpportunityDetails = z.infer<typeof opportunityDetailsSchema>;

export const interviewParticipantSchema = z.object({
  name: trimmed.min(1).max(200),
  role: trimmed.max(200).nullable().optional(),
  contactId: uuidSchema.nullable().optional(),
});
export type InterviewParticipant = z.infer<typeof interviewParticipantSchema>;

export const interviewQuestionSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(["EXPECTED", "TO_ASK"]).default("EXPECTED"),
  question: trimmed.min(1).max(2000),
  answer: trimmed.max(10_000).nullable().optional(),
});
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

// ---------------------------------------------------------------------------
// Matching analysis (descriptive only — the user decides)
// ---------------------------------------------------------------------------

export const analysisDimensionSchema = z.object({
  key: z.string().max(40),
  label: z.string().max(80),
  level: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  score: z.number().min(0).max(100).nullable(),
  rationale: z.string().max(2000),
  matched: z.array(z.string().max(300)).max(50),
  gaps: z.array(z.string().max(300)).max(50),
});

export const opportunityAnalysisSchema = z.object({
  summary: z.string().max(3000),
  dimensions: z.array(analysisDimensionSchema).max(12),
  potentialGaps: z.array(z.string().max(500)).max(30),
  questionsToClarify: z.array(z.string().max(500)).max(30),
  suggestedDocuments: z.array(z.string().max(300)).max(20),
  talkingPoints: z.array(z.string().max(500)).max(20),
  caveats: z.array(z.string().max(500)).max(20),
});
export type OpportunityAnalysis = z.infer<typeof opportunityAnalysisSchema>;

export const storedAnalysisSchema = opportunityAnalysisSchema.extend({
  generatedAt: z.string(),
  by: z.string().max(20),
  model: z.string().max(100).nullable().optional(),
  promptVersion: z.string().max(60).nullable().optional(),
});
export type StoredAnalysis = z.infer<typeof storedAnalysisSchema>;

// ---------------------------------------------------------------------------
// Organizations & contacts
// ---------------------------------------------------------------------------

export const organizationInputSchema = z.object({
  kind: z.enum(ORG_KINDS).default("COMPANY"),
  name: trimmed.min(1).max(200),
  website: urlSchema.nullable().optional(),
  linkedinUrl: urlSchema.nullable().optional(),
  industry: optText(200),
  size: optText(100),
  city: optText(200),
  country: optText(100),
  description: optText(10_000),
  notes: optText(100_000),
  tags: stringList(50).optional(),
});
export type OrganizationInput = z.infer<typeof organizationInputSchema>;
export const organizationPatchSchema = organizationInputSchema.partial();

export const contactInputSchema = z.object({
  fullName: trimmed.min(1).max(200),
  organizationId: uuidSchema.nullable().optional(),
  organizationName: optText(200),
  role: optText(200),
  email: z.string().trim().email().max(320).nullable().optional().or(z.literal("").transform(() => null)),
  phone: optText(50),
  linkedinUrl: urlSchema.nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).nullable().optional(),
  notes: optText(100_000),
  tags: stringList(50).optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;
export const contactPatchSchema = contactInputSchema.partial();

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const opportunityContactRefSchema = z.object({
  contactId: uuidSchema.nullable().optional(),
  fullName: trimmed.max(200).nullable().optional(),
  role: optText(200),
  email: z.string().trim().max(320).nullable().optional(),
  phone: optText(50),
  linkedinUrl: z.string().trim().max(2048).nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).nullable().optional(),
  /** Role of this contact for this opportunity (e.g. "Recruiter"). */
  opportunityRole: optText(200),
});
export type OpportunityContactRef = z.infer<typeof opportunityContactRefSchema>;

const opportunityFields = {
  type: z.enum(OPPORTUNITY_TYPES),
  title: trimmed.min(1).max(300),
  organizationId: uuidSchema.nullable().optional(),
  /** Used when organizationId is not given: matched case-insensitively or created. */
  organizationName: optText(200),
  organizationWebsite: urlSchema.nullable().optional(),
  /** Stage key (e.g. APPLIED) — resolved within the pipeline of the type. */
  status: z.string().trim().max(60).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  source: optText(100),
  sourceDetail: optText(300),
  url: urlSchema.nullable().optional(),
  links: z.array(linkSchema).max(30).optional(),
  locationCity: optText(200),
  locationCountry: optText(100),
  locationText: optText(300),
  remotePolicy: z.enum(REMOTE_POLICIES).nullable().optional(),
  summary: optText(5000),
  description: optText(200_000),
  responsibilities: stringList().optional(),
  requirements: stringList().optional(),
  niceToHave: stringList().optional(),
  skills: stringList().optional(),
  technologies: stringList().optional(),
  benefits: stringList().optional(),
  requiredDocuments: stringList(50).optional(),
  details: opportunityDetailsSchema.optional(),
  deadline: isoDateSchema.nullable().optional(),
  deadlineTime: timeSchema.nullable().optional(),
  applicationOpensAt: isoDateSchema.nullable().optional(),
  discoveredAt: isoDateSchema.nullable().optional(),
  appliedAt: isoDateSchema.nullable().optional(),
  expectedResponseAt: isoDateSchema.nullable().optional(),
  nextFollowUpAt: isoDateSchema.nullable().optional(),
  followUpIntervalDays: z.number().int().min(0).max(365).nullable().optional(),
  followUpBusinessDays: z.boolean().nullable().optional(),
  notes: optText(200_000),
  tags: stringList(50).optional(),
  provenance: provenanceMapSchema.optional(),
  captureId: uuidSchema.nullable().optional(),
};

export const opportunityInputSchema = z.object({
  ...opportunityFields,
  contacts: z.array(opportunityContactRefSchema).max(20).optional(),
  /** Apply the checklist template of the type (default true). */
  applyTemplate: z.boolean().optional(),
});
export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export const opportunityPatchSchema = z
  .object({
    ...opportunityFields,
    followUpPaused: z.boolean().optional(),
  })
  .partial();
export type OpportunityPatch = z.infer<typeof opportunityPatchSchema>;

export const statusChangeSchema = z.object({
  status: z.string().trim().min(1).max(60),
  date: isoDateSchema.nullable().optional(),
  note: optText(10_000),
});

export const followUpActionSchema = z.object({
  action: z.enum(["done", "schedule", "snooze", "clear", "pause", "resume"]),
  /** For done: date the follow-up was sent. For schedule: the next follow-up date. */
  date: isoDateSchema.nullable().optional(),
  /** For schedule/snooze: interval in days. */
  days: z.number().int().min(0).max(365).nullable().optional(),
  note: optText(10_000),
  channel: z.enum(CHANNELS).nullable().optional(),
  contactId: uuidSchema.nullable().optional(),
});
export type FollowUpAction = z.infer<typeof followUpActionSchema>;

// ---------------------------------------------------------------------------
// Timeline, interviews, tasks
// ---------------------------------------------------------------------------

export const timelineEventInputSchema = z.object({
  opportunityId: uuidSchema.nullable().optional(),
  organizationId: uuidSchema.nullable().optional(),
  contactId: uuidSchema.nullable().optional(),
  type: z.enum(EVENT_TYPES).default("NOTE"),
  title: optText(300),
  body: optText(100_000),
  occurredAt: z.string().max(40).nullable().optional(),
  channel: z.enum(CHANNELS).nullable().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).nullable().optional(),
  /** When true and the event is an inbound response, it records the first response date. */
  countsAsResponse: z.boolean().optional(),
});
export type TimelineEventInput = z.infer<typeof timelineEventInputSchema>;

export const interviewInputSchema = z.object({
  opportunityId: uuidSchema,
  kind: z.enum(INTERVIEW_KINDS).default("OTHER"),
  title: optText(300),
  /** ISO instant (with offset) or null when still to schedule. */
  scheduledAt: z.string().max(40).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  location: optText(500),
  meetingUrl: z.string().trim().max(2048).nullable().optional(),
  participants: z.array(interviewParticipantSchema).max(20).optional(),
  status: z.enum(INTERVIEW_STATUSES).optional(),
  preparation: optText(100_000),
  questions: z.array(interviewQuestionSchema).max(200).optional(),
  notes: optText(100_000),
  feedback: optText(100_000),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
});
export type InterviewInput = z.infer<typeof interviewInputSchema>;
export const interviewPatchSchema = interviewInputSchema.omit({ opportunityId: true }).partial();

export const taskInputSchema = z.object({
  opportunityId: uuidSchema.nullable().optional(),
  interviewId: uuidSchema.nullable().optional(),
  title: trimmed.min(1).max(500),
  notes: optText(10_000),
  kind: z.enum(TASK_KINDS).default("TODO"),
  dueDate: isoDateSchema.nullable().optional(),
  done: z.boolean().optional(),
  autoRule: optText(100),
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export const taskPatchSchema = taskInputSchema.partial();

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documentInputSchema = z.object({
  name: trimmed.min(1).max(300),
  kind: z.enum(DOCUMENT_KINDS).default("OTHER"),
  description: optText(5000),
  language: optText(20),
  tags: stringList(50).optional(),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;
export const documentPatchSchema = documentInputSchema.partial();

export const documentVersionFromPathSchema = z.object({
  /** Path relative to the library root, or an absolute host path. */
  path: trimmed.min(1).max(2000),
  label: optText(300),
  notes: optText(5000),
});

export const attachDocumentSchema = z.object({
  opportunityId: uuidSchema,
  documentVersionId: uuidSchema,
  role: z.enum(DOCUMENT_KINDS),
  notes: optText(2000),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  fullName: trimmed.max(200).default(""),
  headline: trimmed.max(300).default(""),
  summary: trimmed.max(10_000).default(""),
  yearsOfExperience: z.number().min(0).max(60).nullable().default(null),
  skills: stringList(300).default([]),
  languages: stringList(30).default([]),
  education: stringList(30).default([]),
  targetRoles: stringList(50).default([]),
  targetDomains: stringList(50).default([]),
  preferredLocations: stringList(50).default([]),
  dealBreakers: stringList(50).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
