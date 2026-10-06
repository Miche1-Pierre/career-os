/**
 * Shared vocabulary of Career OS (client + server safe — no server imports here).
 * Enums are plain string unions stored as `text` in PostgreSQL so they can evolve without migrations.
 */

// ---------------------------------------------------------------------------
// Opportunity types & families
// ---------------------------------------------------------------------------

export const OPPORTUNITY_TYPES = [
  "JOB",
  "INTERNSHIP",
  "ALTERNANCE",
  "VIE",
  "FORMATION",
  "PHD",
  "PROGRAM",
  "OTHER",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** A family groups types sharing the same pipeline and detail fields. */
export type OpportunityFamily = "JOB" | "EDUCATION";
export type PipelineKey = OpportunityFamily;

export interface OpportunityTypeMeta {
  key: OpportunityType;
  label: string;
  plural: string;
  family: OpportunityFamily;
  /** Organization kind created by default for this type. */
  orgKind: OrgKind;
  description: string;
}

export const OPPORTUNITY_TYPE_META: Record<OpportunityType, OpportunityTypeMeta> = {
  JOB: { key: "JOB", label: "Job", plural: "Jobs", family: "JOB", orgKind: "COMPANY", description: "CDI, CDD, freelance…" },
  INTERNSHIP: { key: "INTERNSHIP", label: "Internship", plural: "Internships", family: "JOB", orgKind: "COMPANY", description: "Stage" },
  ALTERNANCE: { key: "ALTERNANCE", label: "Alternance", plural: "Alternances", family: "JOB", orgKind: "COMPANY", description: "Work-study contract" },
  VIE: { key: "VIE", label: "VIE", plural: "VIE", family: "JOB", orgKind: "COMPANY", description: "Volontariat International en Entreprise" },
  FORMATION: { key: "FORMATION", label: "Formation", plural: "Formations", family: "EDUCATION", orgKind: "INSTITUTION", description: "Master, MSc, school…" },
  PHD: { key: "PHD", label: "PhD", plural: "PhDs", family: "EDUCATION", orgKind: "INSTITUTION", description: "Doctoral position" },
  PROGRAM: { key: "PROGRAM", label: "Program", plural: "Programs", family: "EDUCATION", orgKind: "INSTITUTION", description: "Bootcamp, fellowship, international program" },
  OTHER: { key: "OTHER", label: "Other", plural: "Other", family: "JOB", orgKind: "COMPANY", description: "Anything else" },
};

export function familyOf(type: OpportunityType): OpportunityFamily {
  return OPPORTUNITY_TYPE_META[type]?.family ?? "JOB";
}

export const FAMILY_LABEL: Record<OpportunityFamily, string> = { JOB: "Jobs", EDUCATION: "Education" };

// ---------------------------------------------------------------------------
// Pipeline stages & categories
// ---------------------------------------------------------------------------

export const STAGE_CATEGORIES = [
  "BACKLOG",
  "TO_APPLY",
  "PREPARING",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "WON",
  "LOST",
] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

export interface StageCategoryMeta {
  key: StageCategory;
  label: string;
  /** Tailwind classes for badges (light + dark). */
  badge: string;
  dot: string;
  /** Hex color for charts. */
  hex: string;
  active: boolean;
}

export const STAGE_CATEGORY_META: Record<StageCategory, StageCategoryMeta> = {
  // Sparkle chips: tinted *-50 surface + *-700/800 label (legible at 12px); semantic ramps flip in dark mode.
  BACKLOG: { key: "BACKLOG", label: "Discovered", badge: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300", dot: "bg-stone-400", hex: "#a6a09b", active: true },
  TO_APPLY: { key: "TO_APPLY", label: "To apply", badge: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300", dot: "bg-violet-500", hex: "#8e51ff", active: true },
  PREPARING: { key: "PREPARING", label: "Preparing", badge: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300", dot: "bg-pink-500", hex: "#ec4987", active: true },
  APPLIED: { key: "APPLIED", label: "Applied", badge: "bg-highlight-50 text-highlight-700", dot: "bg-highlight-500", hex: "#1c91ff", active: true },
  INTERVIEW: { key: "INTERVIEW", label: "Interview", badge: "bg-info-50 text-info-800", dot: "bg-info-500", hex: "#ffaa0d", active: true },
  OFFER: { key: "OFFER", label: "Offer", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500", hex: "#54b47d", active: true },
  WON: { key: "WON", label: "Accepted", badge: "bg-success-50 text-success-700", dot: "bg-success-500", hex: "#6aa668", active: false },
  LOST: { key: "LOST", label: "Closed", badge: "bg-primary-100 text-primary-500 dark:bg-stone-800 dark:text-stone-400", dot: "bg-rose-400", hex: "#ed756c", active: false },
};

export const ACTIVE_CATEGORIES: StageCategory[] = STAGE_CATEGORIES.filter((c) => STAGE_CATEGORY_META[c].active);
export const CLOSED_CATEGORIES: StageCategory[] = ["WON", "LOST"];
/** Categories meaning "the application has been submitted". */
export const SUBMITTED_CATEGORIES: StageCategory[] = ["APPLIED", "INTERVIEW", "OFFER", "WON"];
/** Categories before submission. */
export const PRE_SUBMIT_CATEGORIES: StageCategory[] = ["BACKLOG", "TO_APPLY", "PREPARING"];

/** Kanban columns (WON + LOST are merged in "Closed"). */
export const BOARD_COLUMNS: { key: string; label: string; categories: StageCategory[] }[] = [
  { key: "BACKLOG", label: "Discovered", categories: ["BACKLOG"] },
  { key: "TO_APPLY", label: "To apply", categories: ["TO_APPLY"] },
  { key: "PREPARING", label: "Preparing", categories: ["PREPARING"] },
  { key: "APPLIED", label: "Applied", categories: ["APPLIED"] },
  { key: "INTERVIEW", label: "Interview", categories: ["INTERVIEW"] },
  { key: "OFFER", label: "Offer", categories: ["OFFER"] },
  { key: "CLOSED", label: "Closed", categories: ["WON", "LOST"] },
];

export interface DefaultStage {
  key: string;
  label: string;
  category: StageCategory;
  isDefault?: boolean;
}

export const DEFAULT_PIPELINES: Record<PipelineKey, DefaultStage[]> = {
  JOB: [
    { key: "DISCOVERED", label: "Discovered", category: "BACKLOG" },
    { key: "TO_APPLY", label: "To apply", category: "TO_APPLY", isDefault: true },
    { key: "PREPARING", label: "Preparing", category: "PREPARING" },
    { key: "APPLIED", label: "Applied", category: "APPLIED" },
    { key: "FOLLOW_UP", label: "Followed up", category: "APPLIED" },
    { key: "HR_INTERVIEW", label: "HR interview", category: "INTERVIEW" },
    { key: "TECHNICAL_INTERVIEW", label: "Technical interview", category: "INTERVIEW" },
    { key: "MANAGER_INTERVIEW", label: "Manager interview", category: "INTERVIEW" },
    { key: "FINAL_INTERVIEW", label: "Final interview", category: "INTERVIEW" },
    { key: "OFFER", label: "Offer", category: "OFFER" },
    { key: "ACCEPTED", label: "Accepted", category: "WON" },
    { key: "REJECTED", label: "Rejected", category: "LOST" },
    { key: "WITHDRAWN", label: "Withdrawn", category: "LOST" },
    { key: "GHOSTED", label: "Ghosted", category: "LOST" },
    { key: "CLOSED", label: "Closed", category: "LOST" },
  ],
  EDUCATION: [
    { key: "DISCOVERED", label: "Discovered", category: "BACKLOG" },
    { key: "RESEARCHING", label: "Researching", category: "BACKLOG" },
    { key: "ELIGIBILITY_CHECK", label: "Eligibility check", category: "BACKLOG" },
    { key: "TO_APPLY", label: "To apply", category: "TO_APPLY", isDefault: true },
    { key: "PREPARING", label: "Preparing", category: "PREPARING" },
    { key: "APPLICATION_SUBMITTED", label: "Submitted", category: "APPLIED" },
    { key: "WAITING", label: "Waiting", category: "APPLIED" },
    { key: "INTERVIEW", label: "Interview", category: "INTERVIEW" },
    { key: "WAITLIST", label: "Waitlist", category: "APPLIED" },
    { key: "ADMITTED", label: "Admitted", category: "OFFER" },
    { key: "ACCEPTED", label: "Accepted", category: "WON" },
    { key: "REJECTED", label: "Rejected", category: "LOST" },
    { key: "DECLINED", label: "Declined", category: "LOST" },
    { key: "CLOSED", label: "Closed", category: "LOST" },
  ],
};

/** Stage keys that mean "a response was received" when entered. */
export const RESPONSE_STAGE_KEYS = new Set(["REJECTED", "OFFER", "ADMITTED", "WAITLIST", "ACCEPTED"]);
/** Stage keys that mean "the follow-up was sent" when entered. */
export const FOLLOW_UP_STAGE_KEYS = new Set(["FOLLOW_UP"]);

// ---------------------------------------------------------------------------
// Misc enums
// ---------------------------------------------------------------------------

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_META: Record<Priority, { label: string; dot: string; badge: string; weight: number }> = {
  LOW: { label: "Low", dot: "bg-stone-300 dark:bg-stone-600", badge: "text-muted-foreground", weight: 0 },
  NORMAL: { label: "Normal", dot: "bg-stone-400", badge: "text-muted-foreground", weight: 1 },
  HIGH: { label: "High", dot: "bg-orange-500", badge: "text-orange-700 dark:text-orange-400", weight: 2 },
  CRITICAL: { label: "Critical", dot: "bg-warning-500", badge: "text-warning-600", weight: 3 },
};

export const ORG_KINDS = ["COMPANY", "INSTITUTION"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const REMOTE_POLICIES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];
export const REMOTE_LABEL: Record<RemotePolicy, string> = { ONSITE: "On-site", HYBRID: "Hybrid", REMOTE: "Remote" };

export const CONTRACT_TYPES = ["CDI", "CDD", "FREELANCE", "INTERNSHIP", "ALTERNANCE", "VIE", "PART_TIME", "TEMPORARY", "OTHER"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_LABEL: Record<ContractType, string> = {
  CDI: "CDI (permanent)",
  CDD: "CDD (fixed-term)",
  FREELANCE: "Freelance",
  INTERNSHIP: "Internship",
  ALTERNANCE: "Alternance",
  VIE: "VIE",
  PART_TIME: "Part-time",
  TEMPORARY: "Temporary",
  OTHER: "Other",
};

export const SALARY_PERIODS = ["YEAR", "MONTH", "DAY", "HOUR"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const EDUCATION_FORMATS = ["FULL_TIME", "PART_TIME", "ONLINE", "HYBRID", "ALTERNANCE"] as const;
export type EducationFormat = (typeof EDUCATION_FORMATS)[number];
export const EDUCATION_FORMAT_LABEL: Record<EducationFormat, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  ONLINE: "Online",
  HYBRID: "Hybrid",
  ALTERNANCE: "Alternance",
};

export const SOURCES = [
  "LINKEDIN",
  "WELCOME_TO_THE_JUNGLE",
  "INDEED",
  "GLASSDOOR",
  "MON_MASTER",
  "UNIVERSITY_WEBSITE",
  "COMPANY_WEBSITE",
  "REFERRAL",
  "NETWORKING",
  "RECRUITER",
  "REMOTE_PEOPLE",
  "JOB_BOARD",
  "EMAIL",
  "OTHER",
] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  WELCOME_TO_THE_JUNGLE: "Welcome to the Jungle",
  INDEED: "Indeed",
  GLASSDOOR: "Glassdoor",
  MON_MASTER: "Mon Master",
  UNIVERSITY_WEBSITE: "University website",
  COMPANY_WEBSITE: "Company website",
  REFERRAL: "Referral",
  NETWORKING: "Networking",
  RECRUITER: "Recruiter",
  REMOTE_PEOPLE: "Remote People",
  JOB_BOARD: "Other job board",
  EMAIL: "Email",
  OTHER: "Other",
};
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABEL[source] ?? source;
}

export const LINK_KINDS = [
  "POSTING",
  "APPLICATION",
  "COMPANY",
  "PROGRAM",
  "LINKEDIN",
  "RECRUITER",
  "INTERVIEW",
  "OTHER",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  POSTING: "Job / program page",
  APPLICATION: "Application portal",
  COMPANY: "Company / school site",
  PROGRAM: "Program page",
  LINKEDIN: "LinkedIn",
  RECRUITER: "Recruiter profile",
  INTERVIEW: "Interview link",
  OTHER: "Other",
};

export const DOCUMENT_KINDS = [
  "CV",
  "COVER_LETTER",
  "PORTFOLIO",
  "TRANSCRIPT",
  "DIPLOMA",
  "CERTIFICATE",
  "RECOMMENDATION",
  "LANGUAGE_CERT",
  "PRESENTATION",
  "ID_DOCUMENT",
  "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string; plural: string; folder: string }> = {
  CV: { label: "CV / Resume", plural: "CVs", folder: "CV" },
  COVER_LETTER: { label: "Cover / motivation letter", plural: "Cover letters", folder: "Cover Letters" },
  PORTFOLIO: { label: "Portfolio", plural: "Portfolios", folder: "Portfolio" },
  TRANSCRIPT: { label: "Transcript", plural: "Transcripts", folder: "Academic" },
  DIPLOMA: { label: "Diploma", plural: "Diplomas", folder: "Academic" },
  CERTIFICATE: { label: "Certificate", plural: "Certificates", folder: "Certificates" },
  RECOMMENDATION: { label: "Recommendation letter", plural: "Recommendation letters", folder: "Recommendations" },
  LANGUAGE_CERT: { label: "Language certificate", plural: "Language certificates", folder: "Certificates" },
  PRESENTATION: { label: "Presentation", plural: "Presentations", folder: "Presentations" },
  ID_DOCUMENT: { label: "ID document", plural: "ID documents", folder: "Admin" },
  OTHER: { label: "Other", plural: "Other documents", folder: "Other" },
};

export const INTERVIEW_KINDS = ["HR", "TECHNICAL", "MANAGER", "FOUNDER", "CULTURE", "CASE_STUDY", "ACADEMIC", "PANEL", "OTHER"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  HR: "HR",
  TECHNICAL: "Technical",
  MANAGER: "Manager",
  FOUNDER: "Founder",
  CULTURE: "Culture fit",
  CASE_STUDY: "Case study",
  ACADEMIC: "Academic",
  PANEL: "Panel",
  OTHER: "Other",
};
export const INTERVIEW_STATUSES = ["TO_SCHEDULE", "SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  TO_SCHEDULE: "To schedule",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export const INTERVIEW_OUTCOMES = ["PENDING", "PASSED", "FAILED", "UNKNOWN"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const RELATIONSHIPS = [
  "RECRUITER",
  "HIRING_MANAGER",
  "EMPLOYEE",
  "FOUNDER",
  "REFERRAL",
  "ALUMNI",
  "PROFESSOR",
  "ADMISSIONS",
  "MENTOR",
  "FRIEND",
  "OTHER",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  EMPLOYEE: "Employee",
  FOUNDER: "Founder",
  REFERRAL: "Referral",
  ALUMNI: "Alumni",
  PROFESSOR: "Professor",
  ADMISSIONS: "Admissions office",
  MENTOR: "Mentor",
  FRIEND: "Friend",
  OTHER: "Other",
};

export const TASK_KINDS = ["TODO", "CHECKLIST", "DOCUMENT", "FOLLOW_UP", "PREPARATION", "DEADLINE"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const ACTORS = ["USER", "CLAUDE", "AI", "RULE", "SYSTEM", "IMPORT", "API"] as const;
export type Actor = (typeof ACTORS)[number];
export const ACTOR_LABEL: Record<Actor, string> = {
  USER: "You",
  CLAUDE: "Claude",
  AI: "AI",
  RULE: "Automation",
  SYSTEM: "System",
  IMPORT: "Import",
  API: "API",
};

export const EVENT_TYPES = [
  "CREATED",
  "STATUS_CHANGED",
  "APPLIED",
  "FOLLOW_UP_SENT",
  "RESPONSE_RECEIVED",
  "EMAIL",
  "MESSAGE",
  "CALL",
  "MEETING",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_DONE",
  "OFFER_RECEIVED",
  "REJECTED",
  "DOCUMENT_ATTACHED",
  "DEADLINE_CHANGED",
  "NOTE",
  "IMPORTED",
  "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  CREATED: "Created",
  STATUS_CHANGED: "Status changed",
  APPLIED: "Application submitted",
  FOLLOW_UP_SENT: "Follow-up sent",
  RESPONSE_RECEIVED: "Response received",
  EMAIL: "Email",
  MESSAGE: "Message",
  CALL: "Phone call",
  MEETING: "Meeting",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_DONE: "Interview done",
  OFFER_RECEIVED: "Offer received",
  REJECTED: "Rejected",
  DOCUMENT_ATTACHED: "Document attached",
  DEADLINE_CHANGED: "Deadline changed",
  NOTE: "Note",
  IMPORTED: "Imported",
  OTHER: "Event",
};
/** Event types that can be logged manually as "communications". */
export const COMMUNICATION_EVENT_TYPES: EventType[] = ["EMAIL", "MESSAGE", "CALL", "MEETING", "NOTE", "RESPONSE_RECEIVED", "OTHER"];

export const CHANNELS = ["EMAIL", "LINKEDIN", "PHONE", "VIDEO", "IN_PERSON", "PORTAL", "OTHER"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: "Email",
  LINKEDIN: "LinkedIn",
  PHONE: "Phone",
  VIDEO: "Video call",
  IN_PERSON: "In person",
  PORTAL: "Portal",
  OTHER: "Other",
};

export const INBOX_STATUSES = ["NEW", "QUEUED", "PROCESSING", "READY", "CONVERTED", "ARCHIVED", "FAILED"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
export const INBOX_KINDS = ["UNKNOWN", "JOB_POSTING", "PROGRAM", "EMAIL", "MESSAGE", "NOTE", "OTHER"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];
export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  UNKNOWN: "Unclassified",
  JOB_POSTING: "Job posting",
  PROGRAM: "Program / formation",
  EMAIL: "Email",
  MESSAGE: "Message",
  NOTE: "Note",
  OTHER: "Other",
};
export const CAPTURE_SOURCES = ["PASTE", "URL", "FILE", "MCP", "EXTENSION", "EMAIL", "API"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** Provenance of a field value. */
export const PROVENANCE_SOURCES = ["EXTRACTED", "INFERRED", "USER_ENTERED"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];
export const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const APP_NAME = "Career OS";
export const EXPORT_SCHEMA_VERSION = 1;
