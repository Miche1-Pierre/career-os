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
  JOB: { key: "JOB", label: "Emploi", plural: "Emplois", family: "JOB", orgKind: "COMPANY", description: "CDI, CDD, freelance…" },
  INTERNSHIP: { key: "INTERNSHIP", label: "Stage", plural: "Stages", family: "JOB", orgKind: "COMPANY", description: "Stage en entreprise" },
  ALTERNANCE: { key: "ALTERNANCE", label: "Alternance", plural: "Alternances", family: "JOB", orgKind: "COMPANY", description: "Contrat d’apprentissage ou de professionnalisation" },
  VIE: { key: "VIE", label: "VIE", plural: "VIE", family: "JOB", orgKind: "COMPANY", description: "Volontariat International en Entreprise" },
  FORMATION: { key: "FORMATION", label: "Formation", plural: "Formations", family: "EDUCATION", orgKind: "INSTITUTION", description: "Master, MSc, école…" },
  PHD: { key: "PHD", label: "Doctorat", plural: "Doctorats", family: "EDUCATION", orgKind: "INSTITUTION", description: "Thèse, poste de doctorant" },
  PROGRAM: { key: "PROGRAM", label: "Programme", plural: "Programmes", family: "EDUCATION", orgKind: "INSTITUTION", description: "Bootcamp, fellowship, programme international" },
  OTHER: { key: "OTHER", label: "Autre", plural: "Autres", family: "JOB", orgKind: "COMPANY", description: "Tout le reste" },
};

export function familyOf(type: OpportunityType): OpportunityFamily {
  return OPPORTUNITY_TYPE_META[type]?.family ?? "JOB";
}

export const FAMILY_LABEL: Record<OpportunityFamily, string> = { JOB: "Emplois", EDUCATION: "Études" };

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
  BACKLOG: { key: "BACKLOG", label: "Repéré", badge: "bg-primary-100 text-primary-700 dark:bg-stone-800 dark:text-stone-300", dot: "bg-stone-400", hex: "#a6a09b", active: true },
  TO_APPLY: { key: "TO_APPLY", label: "À postuler", badge: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300", dot: "bg-violet-500", hex: "#8e51ff", active: true },
  PREPARING: { key: "PREPARING", label: "En préparation", badge: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300", dot: "bg-pink-500", hex: "#ec4987", active: true },
  APPLIED: { key: "APPLIED", label: "Postulé", badge: "bg-highlight-50 text-highlight-700", dot: "bg-highlight-500", hex: "#1c91ff", active: true },
  INTERVIEW: { key: "INTERVIEW", label: "Entretien", badge: "bg-info-50 text-info-800", dot: "bg-info-500", hex: "#ffaa0d", active: true },
  OFFER: { key: "OFFER", label: "Offre", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500", hex: "#54b47d", active: true },
  WON: { key: "WON", label: "Accepté", badge: "bg-success-50 text-success-700", dot: "bg-success-500", hex: "#6aa668", active: false },
  LOST: { key: "LOST", label: "Clôturé", badge: "bg-primary-100 text-primary-500 dark:bg-stone-800 dark:text-stone-400", dot: "bg-rose-400", hex: "#ed756c", active: false },
};

export const ACTIVE_CATEGORIES: StageCategory[] = STAGE_CATEGORIES.filter((c) => STAGE_CATEGORY_META[c].active);
export const CLOSED_CATEGORIES: StageCategory[] = ["WON", "LOST"];
/** Categories meaning "the application has been submitted". */
export const SUBMITTED_CATEGORIES: StageCategory[] = ["APPLIED", "INTERVIEW", "OFFER", "WON"];
/** Categories before submission. */
export const PRE_SUBMIT_CATEGORIES: StageCategory[] = ["BACKLOG", "TO_APPLY", "PREPARING"];

/** Kanban columns (WON + LOST are merged in "Clôturé"). */
export const BOARD_COLUMNS: { key: string; label: string; categories: StageCategory[] }[] = [
  { key: "BACKLOG", label: "Repéré", categories: ["BACKLOG"] },
  { key: "TO_APPLY", label: "À postuler", categories: ["TO_APPLY"] },
  { key: "PREPARING", label: "En préparation", categories: ["PREPARING"] },
  { key: "APPLIED", label: "Postulé", categories: ["APPLIED"] },
  { key: "INTERVIEW", label: "Entretien", categories: ["INTERVIEW"] },
  { key: "OFFER", label: "Offre", categories: ["OFFER"] },
  { key: "CLOSED", label: "Clôturé", categories: ["WON", "LOST"] },
];

export interface DefaultStage {
  key: string;
  label: string;
  category: StageCategory;
  isDefault?: boolean;
}

export const DEFAULT_PIPELINES: Record<PipelineKey, DefaultStage[]> = {
  JOB: [
    { key: "DISCOVERED", label: "Repéré", category: "BACKLOG" },
    { key: "TO_APPLY", label: "À postuler", category: "TO_APPLY", isDefault: true },
    { key: "PREPARING", label: "En préparation", category: "PREPARING" },
    { key: "APPLIED", label: "Postulé", category: "APPLIED" },
    { key: "FOLLOW_UP", label: "Relancé", category: "APPLIED" },
    { key: "HR_INTERVIEW", label: "Entretien RH", category: "INTERVIEW" },
    { key: "TECHNICAL_INTERVIEW", label: "Entretien technique", category: "INTERVIEW" },
    { key: "MANAGER_INTERVIEW", label: "Entretien manager", category: "INTERVIEW" },
    { key: "FINAL_INTERVIEW", label: "Entretien final", category: "INTERVIEW" },
    { key: "OFFER", label: "Offre", category: "OFFER" },
    { key: "ACCEPTED", label: "Accepté", category: "WON" },
    { key: "REJECTED", label: "Refusé", category: "LOST" },
    { key: "WITHDRAWN", label: "Retiré", category: "LOST" },
    { key: "GHOSTED", label: "Sans réponse", category: "LOST" },
    { key: "CLOSED", label: "Clôturé", category: "LOST" },
  ],
  EDUCATION: [
    { key: "DISCOVERED", label: "Repéré", category: "BACKLOG" },
    { key: "RESEARCHING", label: "Exploration", category: "BACKLOG" },
    { key: "ELIGIBILITY_CHECK", label: "Vérification d’éligibilité", category: "BACKLOG" },
    { key: "TO_APPLY", label: "À postuler", category: "TO_APPLY", isDefault: true },
    { key: "PREPARING", label: "En préparation", category: "PREPARING" },
    { key: "APPLICATION_SUBMITTED", label: "Dossier déposé", category: "APPLIED" },
    { key: "WAITING", label: "En attente", category: "APPLIED" },
    { key: "INTERVIEW", label: "Entretien", category: "INTERVIEW" },
    { key: "WAITLIST", label: "Liste d’attente", category: "APPLIED" },
    { key: "ADMITTED", label: "Admis", category: "OFFER" },
    { key: "ACCEPTED", label: "Accepté", category: "WON" },
    { key: "REJECTED", label: "Refusé", category: "LOST" },
    { key: "DECLINED", label: "Décliné", category: "LOST" },
    { key: "CLOSED", label: "Clôturé", category: "LOST" },
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
  LOW: { label: "Basse", dot: "bg-stone-300 dark:bg-stone-600", badge: "text-muted-foreground", weight: 0 },
  NORMAL: { label: "Normale", dot: "bg-stone-400", badge: "text-muted-foreground", weight: 1 },
  HIGH: { label: "Haute", dot: "bg-orange-500", badge: "text-orange-700 dark:text-orange-400", weight: 2 },
  CRITICAL: { label: "Critique", dot: "bg-warning-500", badge: "text-warning-600", weight: 3 },
};

export const ORG_KINDS = ["COMPANY", "INSTITUTION"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const REMOTE_POLICIES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];
export const REMOTE_LABEL: Record<RemotePolicy, string> = { ONSITE: "Sur site", HYBRID: "Hybride", REMOTE: "Télétravail" };

export const CONTRACT_TYPES = ["CDI", "CDD", "FREELANCE", "INTERNSHIP", "ALTERNANCE", "VIE", "PART_TIME", "TEMPORARY", "OTHER"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_LABEL: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  FREELANCE: "Freelance",
  INTERNSHIP: "Stage",
  ALTERNANCE: "Alternance",
  VIE: "VIE",
  PART_TIME: "Temps partiel",
  TEMPORARY: "Intérim",
  OTHER: "Autre",
};

export const SALARY_PERIODS = ["YEAR", "MONTH", "DAY", "HOUR"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const EDUCATION_FORMATS = ["FULL_TIME", "PART_TIME", "ONLINE", "HYBRID", "ALTERNANCE"] as const;
export type EducationFormat = (typeof EDUCATION_FORMATS)[number];
export const EDUCATION_FORMAT_LABEL: Record<EducationFormat, string> = {
  FULL_TIME: "Temps plein",
  PART_TIME: "Temps partiel",
  ONLINE: "En ligne",
  HYBRID: "Hybride",
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
  UNIVERSITY_WEBSITE: "Site de l’université",
  COMPANY_WEBSITE: "Site de l’entreprise",
  REFERRAL: "Cooptation",
  NETWORKING: "Réseau",
  RECRUITER: "Recruteur",
  REMOTE_PEOPLE: "Remote People",
  JOB_BOARD: "Autre job board",
  EMAIL: "E-mail",
  OTHER: "Autre",
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
  POSTING: "Page de l’offre",
  APPLICATION: "Portail de candidature",
  COMPANY: "Site de l’entreprise / de l’école",
  PROGRAM: "Page du programme",
  LINKEDIN: "LinkedIn",
  RECRUITER: "Profil du recruteur",
  INTERVIEW: "Lien de l’entretien",
  OTHER: "Autre",
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
/** `folder` is the on-disk storage folder (kept in English: existing files live there). */
export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string; plural: string; folder: string }> = {
  CV: { label: "CV", plural: "CV", folder: "CV" },
  COVER_LETTER: { label: "Lettre de motivation", plural: "Lettres de motivation", folder: "Cover Letters" },
  PORTFOLIO: { label: "Portfolio", plural: "Portfolios", folder: "Portfolio" },
  TRANSCRIPT: { label: "Relevé de notes", plural: "Relevés de notes", folder: "Academic" },
  DIPLOMA: { label: "Diplôme", plural: "Diplômes", folder: "Academic" },
  CERTIFICATE: { label: "Certificat", plural: "Certificats", folder: "Certificates" },
  RECOMMENDATION: { label: "Lettre de recommandation", plural: "Lettres de recommandation", folder: "Recommendations" },
  LANGUAGE_CERT: { label: "Certificat de langue", plural: "Certificats de langue", folder: "Certificates" },
  PRESENTATION: { label: "Présentation", plural: "Présentations", folder: "Presentations" },
  ID_DOCUMENT: { label: "Pièce d’identité", plural: "Pièces d’identité", folder: "Admin" },
  OTHER: { label: "Autre", plural: "Autres documents", folder: "Other" },
};

export const INTERVIEW_KINDS = ["HR", "TECHNICAL", "MANAGER", "FOUNDER", "CULTURE", "CASE_STUDY", "ACADEMIC", "PANEL", "OTHER"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  HR: "RH",
  TECHNICAL: "Technique",
  MANAGER: "Manager",
  FOUNDER: "Fondateur",
  CULTURE: "Fit culturel",
  CASE_STUDY: "Étude de cas",
  ACADEMIC: "Académique",
  PANEL: "Jury",
  OTHER: "Autre",
};
/** Default interview title for a kind ("Entretien RH", "Étude de cas"…). */
export const INTERVIEW_KIND_TITLE: Record<InterviewKind, string> = {
  HR: "Entretien RH",
  TECHNICAL: "Entretien technique",
  MANAGER: "Entretien manager",
  FOUNDER: "Entretien fondateur",
  CULTURE: "Entretien fit culturel",
  CASE_STUDY: "Étude de cas",
  ACADEMIC: "Entretien académique",
  PANEL: "Entretien jury",
  OTHER: "Entretien",
};
export function interviewKindTitle(kind: string | null | undefined): string {
  return INTERVIEW_KIND_TITLE[kind as InterviewKind] ?? "Entretien";
}
export const INTERVIEW_STATUSES = ["TO_SCHEDULE", "SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  TO_SCHEDULE: "À planifier",
  SCHEDULED: "Planifié",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
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
  RECRUITER: "Recruteur",
  HIRING_MANAGER: "Manager recruteur",
  EMPLOYEE: "Salarié",
  FOUNDER: "Fondateur",
  REFERRAL: "Coopteur",
  ALUMNI: "Alumni",
  PROFESSOR: "Professeur",
  ADMISSIONS: "Service des admissions",
  MENTOR: "Mentor",
  FRIEND: "Ami",
  OTHER: "Autre",
};

export const TASK_KINDS = ["TODO", "CHECKLIST", "DOCUMENT", "FOLLOW_UP", "PREPARATION", "DEADLINE"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const ACTORS = ["USER", "CLAUDE", "AI", "RULE", "SYSTEM", "IMPORT", "API"] as const;
export type Actor = (typeof ACTORS)[number];
export const ACTOR_LABEL: Record<Actor, string> = {
  USER: "Vous",
  CLAUDE: "Claude",
  AI: "IA",
  RULE: "Automatisation",
  SYSTEM: "Système",
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
  CREATED: "Création",
  STATUS_CHANGED: "Changement de statut",
  APPLIED: "Candidature envoyée",
  FOLLOW_UP_SENT: "Relance envoyée",
  RESPONSE_RECEIVED: "Réponse reçue",
  EMAIL: "E-mail",
  MESSAGE: "Message",
  CALL: "Appel",
  MEETING: "Rendez-vous",
  INTERVIEW_SCHEDULED: "Entretien planifié",
  INTERVIEW_DONE: "Entretien passé",
  OFFER_RECEIVED: "Offre reçue",
  REJECTED: "Refus",
  DOCUMENT_ATTACHED: "Document joint",
  DEADLINE_CHANGED: "Date limite modifiée",
  NOTE: "Note",
  IMPORTED: "Import",
  OTHER: "Événement",
};
/** Event types that can be logged manually as "communications". */
export const COMMUNICATION_EVENT_TYPES: EventType[] = ["EMAIL", "MESSAGE", "CALL", "MEETING", "NOTE", "RESPONSE_RECEIVED", "OTHER"];

export const CHANNELS = ["EMAIL", "LINKEDIN", "PHONE", "VIDEO", "IN_PERSON", "PORTAL", "OTHER"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: "E-mail",
  LINKEDIN: "LinkedIn",
  PHONE: "Téléphone",
  VIDEO: "Visio",
  IN_PERSON: "En personne",
  PORTAL: "Portail",
  OTHER: "Autre",
};

export const INBOX_STATUSES = ["NEW", "QUEUED", "PROCESSING", "READY", "CONVERTED", "ARCHIVED", "FAILED"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
export const INBOX_KINDS = ["UNKNOWN", "JOB_POSTING", "PROGRAM", "EMAIL", "MESSAGE", "NOTE", "OTHER"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];
export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  UNKNOWN: "Non classé",
  JOB_POSTING: "Offre d’emploi",
  PROGRAM: "Programme / formation",
  EMAIL: "E-mail",
  MESSAGE: "Message",
  NOTE: "Note",
  OTHER: "Autre",
};
export const CAPTURE_SOURCES = ["PASTE", "URL", "FILE", "MCP", "EXTENSION", "EMAIL", "API"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** Provenance of a field value. */
export const PROVENANCE_SOURCES = ["EXTRACTED", "INFERRED", "USER_ENTERED"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];
export const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const APP_NAME = "Career OS";
export const EXPORT_SCHEMA_VERSION = 2;
