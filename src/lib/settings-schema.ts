/**
 * Application settings (stored in the `settings` table, one row per section, merged with these defaults).
 * Client-safe: used by the settings UI for validation and defaults.
 */
import { z } from "zod";
import { DOCUMENT_KINDS, OPPORTUNITY_TYPES, TASK_KINDS, type OpportunityType } from "./constants";
import { profileSchema } from "./schemas";

const days = (value: number) => z.number().int().min(0).max(365).default(value);

export const generalSettingsSchema = z.object({
  userName: z.string().trim().max(100).default(""),
  timezone: z.string().max(60).default("Europe/Paris"),
  dateLocale: z.string().max(20).default("en-GB"),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  currency: z.string().max(10).default("EUR"),
});

export const followUpSettingsSchema = z.object({
  defaultDays: z
    .object({
      JOB: days(7),
      INTERNSHIP: days(7),
      ALTERNANCE: days(7),
      VIE: days(7),
      FORMATION: days(14),
      PHD: days(10),
      PROGRAM: days(14),
      OTHER: days(7),
    })
    .prefault({}),
  /** Count only business days (weekends + public holidays skipped). */
  businessDays: z.boolean().default(false),
  holidays: z.enum(["FR", "NONE"]).default("FR"),
  /** Interval when the source is a recruiter who contacted you. */
  recruiterDays: days(5),
  /** Follow-up scheduled after an interview is marked as done. */
  postInterviewDays: days(5),
  /** After this many unanswered follow-ups, suggest marking the application as ghosted. */
  maxFollowUps: z.number().int().min(1).max(20).default(3),
  ghostAfterDays: days(30),
  /** "Waiting" section threshold (days since application without response). */
  waitingThresholdDays: days(7),
  /** Move a JOB application from "Applied" to "Followed up" when a follow-up is logged. */
  moveToFollowUpStage: z.boolean().default(true),
  autoScheduleOnApply: z.boolean().default(true),
});

export const aiSettingsSchema = z.object({
  /** Override of AI_MODEL (empty = env / provider default). */
  model: z.string().max(100).default(""),
  effort: z.enum(["", "low", "medium", "high", "xhigh", "max"]).default(""),
  outputLanguage: z.enum(["fr", "en", "auto"]).default("fr"),
  /** Analyze captures automatically after Quick Import. */
  autoAnalyzeCaptures: z.boolean().default(true),
});

export const RULE_KEYS = [
  "interview_prep_task",
  "post_interview_thanks",
  "deadline_urgent",
  "missing_documents",
  "ghost_suggestion",
  "offer_decision",
  "stale_interview",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export const RULE_META: Record<RuleKey, { title: string; description: string }> = {
  interview_prep_task: {
    title: "Interview scheduled → preparation task",
    description: "Creates a preparation task due N days before each scheduled interview.",
  },
  post_interview_thanks: {
    title: "Interview done → thank-you note",
    description: "Creates a task to send a thank-you note the day after an interview is marked as done.",
  },
  deadline_urgent: {
    title: "Deadline approaching → urgent",
    description: "Flags opportunities whose application deadline is within N days (notification + Today).",
  },
  missing_documents: {
    title: "Missing documents before deadline",
    description: "Warns when required documents are still missing N days before the deadline.",
  },
  ghost_suggestion: {
    title: "No response after follow-ups → suggest “Ghosted”",
    description: "After the maximum number of follow-ups without answer, suggests closing the application.",
  },
  offer_decision: {
    title: "Offer / admission → decision task",
    description: "Creates a “Decide on the offer” task due N days after an offer or admission.",
  },
  stale_interview: {
    title: "Past interview without outcome",
    description: "Reminds you to log notes and outcome of interviews that took place.",
  },
};

const ruleSchema = (enabled: boolean, daysValue: number) =>
  z.object({ enabled: z.boolean().default(enabled), days: days(daysValue) }).prefault({});

export const automationSettingsSchema = z.object({
  interview_prep_task: ruleSchema(true, 1),
  post_interview_thanks: ruleSchema(true, 1),
  deadline_urgent: ruleSchema(true, 3),
  missing_documents: ruleSchema(true, 7),
  ghost_suggestion: ruleSchema(true, 0),
  offer_decision: ruleSchema(true, 7),
  stale_interview: ruleSchema(true, 1),
});

export const checklistTemplateItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(TASK_KINDS).default("CHECKLIST"),
  /** doc:<KIND> auto-completes when a document of that role is attached; status:APPLIED when submitted; followup on first follow-up. */
  autoRule: z.string().max(100).nullable().default(null),
  /** Only add the item when this details field is filled (e.g. details.languageRequirement). */
  when: z.string().max(100).nullable().default(null),
});
export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItemSchema>;

const item = (title: string, kind: z.infer<typeof checklistTemplateItemSchema>["kind"], autoRule: string | null = null, when: string | null = null) => ({
  title,
  kind,
  autoRule,
  when,
});

const JOB_CHECKLIST = [
  item("Read the job description", "CHECKLIST"),
  item("Research the company", "CHECKLIST"),
  item("Select CV", "DOCUMENT", "doc:CV"),
  item("Write cover letter", "DOCUMENT", "doc:COVER_LETTER"),
  item("Submit application", "CHECKLIST", "status:APPLIED"),
  item("Follow up", "FOLLOW_UP", "followup"),
  item("Prepare interview", "PREPARATION", "interview"),
];

const EDUCATION_CHECKLIST = [
  item("Check eligibility & prerequisites", "CHECKLIST"),
  item("Select CV", "DOCUMENT", "doc:CV"),
  item("Motivation letter", "DOCUMENT", "doc:COVER_LETTER"),
  item("Transcripts", "DOCUMENT", "doc:TRANSCRIPT"),
  item("Recommendation letter", "DOCUMENT", "doc:RECOMMENDATION"),
  item("Language certificate", "DOCUMENT", "doc:LANGUAGE_CERT", "details.languageRequirement"),
  item("Submit application", "CHECKLIST", "status:APPLIED"),
];

export const DEFAULT_CHECKLISTS: Record<OpportunityType, ChecklistTemplateItem[]> = {
  JOB: JOB_CHECKLIST,
  INTERNSHIP: JOB_CHECKLIST,
  ALTERNANCE: [...JOB_CHECKLIST.slice(0, 4), item("Check school / rhythm compatibility", "CHECKLIST"), ...JOB_CHECKLIST.slice(4)],
  VIE: [...JOB_CHECKLIST.slice(0, 4), item("Check Business France VIE eligibility", "CHECKLIST"), ...JOB_CHECKLIST.slice(4)],
  FORMATION: EDUCATION_CHECKLIST,
  PHD: [
    item("Read the research topic & lab publications", "CHECKLIST"),
    item("Contact the supervisor", "CHECKLIST"),
    item("Select CV", "DOCUMENT", "doc:CV"),
    item("Research statement / motivation letter", "DOCUMENT", "doc:COVER_LETTER"),
    item("Transcripts", "DOCUMENT", "doc:TRANSCRIPT"),
    item("Recommendation letters", "DOCUMENT", "doc:RECOMMENDATION"),
    item("Submit application", "CHECKLIST", "status:APPLIED"),
  ],
  PROGRAM: EDUCATION_CHECKLIST,
  OTHER: [item("Select CV", "DOCUMENT", "doc:CV"), item("Submit application", "CHECKLIST", "status:APPLIED")],
};

export const templatesSettingsSchema = z.object(
  Object.fromEntries(
    OPPORTUNITY_TYPES.map((t) => [t, z.array(checklistTemplateItemSchema).max(50).default(DEFAULT_CHECKLISTS[t])]),
  ) as Record<OpportunityType, z.ZodDefault<z.ZodArray<typeof checklistTemplateItemSchema>>>,
);

export const emailTemplateSchema = z.object({
  id: z.string().max(60),
  name: z.string().trim().min(1).max(120),
  language: z.enum(["fr", "en"]).default("fr"),
  purpose: z.enum(["FOLLOW_UP", "THANK_YOU", "NETWORKING", "WITHDRAW", "OTHER"]).default("OTHER"),
  subject: z.string().max(300),
  body: z.string().max(10_000),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "follow-up-fr",
    name: "Relance candidature (FR)",
    language: "fr",
    purpose: "FOLLOW_UP",
    subject: "Suivi de ma candidature — {{title}}",
    body:
      "Bonjour {{contactFirstName}},\n\nJe me permets de revenir vers vous concernant ma candidature au poste de {{title}} chez {{organization}}, envoyée le {{appliedDate}}.\n\nJe reste très intéressé par cette opportunité et disponible pour un échange à votre convenance.\n\nBien cordialement,\n{{userName}}",
  },
  {
    id: "follow-up-en",
    name: "Application follow-up (EN)",
    language: "en",
    purpose: "FOLLOW_UP",
    subject: "Following up on my application — {{title}}",
    body:
      "Hello {{contactFirstName}},\n\nI hope you are well. I am following up on my application for the {{title}} position at {{organization}}, submitted on {{appliedDate}}.\n\nI remain very interested in the role and would be glad to discuss it at your convenience.\n\nBest regards,\n{{userName}}",
  },
  {
    id: "thank-you-fr",
    name: "Remerciement après entretien (FR)",
    language: "fr",
    purpose: "THANK_YOU",
    subject: "Merci pour notre échange — {{title}}",
    body:
      "Bonjour {{contactFirstName}},\n\nMerci pour le temps que vous m'avez accordé aujourd'hui. Notre échange a renforcé mon intérêt pour le poste de {{title}} chez {{organization}}.\n\nJe reste à votre disposition pour toute information complémentaire.\n\nBien cordialement,\n{{userName}}",
  },
  {
    id: "program-follow-up-fr",
    name: "Relance formation (FR)",
    language: "fr",
    purpose: "FOLLOW_UP",
    subject: "Candidature — {{title}}",
    body:
      "Madame, Monsieur,\n\nJ'ai déposé ma candidature pour la formation {{title}} ({{organization}}) le {{appliedDate}}. Je souhaiterais savoir si mon dossier est complet et connaître le calendrier prévu pour les réponses.\n\nJe vous remercie par avance.\n\nCordialement,\n{{userName}}",
  },
];

export const onboardingSettingsSchema = z.object({
  completedAt: z.string().nullable().default(null),
  demoLoaded: z.boolean().default(false),
});

export const settingsSchema = z.object({
  general: generalSettingsSchema.prefault({}),
  followUp: followUpSettingsSchema.prefault({}),
  profile: profileSchema.prefault({}),
  ai: aiSettingsSchema.prefault({}),
  automation: automationSettingsSchema.prefault({}),
  templates: templatesSettingsSchema.prefault({}),
  emailTemplates: z.array(emailTemplateSchema).max(50).default(DEFAULT_EMAIL_TEMPLATES),
  customSources: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  onboarding: onboardingSettingsSchema.prefault({}),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof AppSettings;
export const SETTINGS_SECTIONS = Object.keys(settingsSchema.shape) as SettingsSection[];

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

export function isDocumentKind(value: string): value is (typeof DOCUMENT_KINDS)[number] {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}
