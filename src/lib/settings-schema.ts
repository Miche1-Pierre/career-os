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
  dateLocale: z.string().max(20).default("fr-FR"),
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
    title: "Entretien planifié → tâche de préparation",
    description: "Crée une tâche de préparation à échéance N jours avant chaque entretien planifié.",
  },
  post_interview_thanks: {
    title: "Entretien passé → mot de remerciement",
    description: "Crée une tâche pour envoyer un mot de remerciement le lendemain d’un entretien marqué comme passé.",
  },
  deadline_urgent: {
    title: "Date limite proche → urgent",
    description: "Signale les opportunités dont la date limite de candidature tombe dans les N jours (notification + Aujourd’hui).",
  },
  missing_documents: {
    title: "Documents manquants avant la date limite",
    description: "Avertit lorsque des documents requis manquent encore N jours avant la date limite.",
  },
  ghost_suggestion: {
    title: "Aucune réponse après les relances → proposer « Sans réponse »",
    description: "Après le nombre maximal de relances sans réponse, propose de clôturer la candidature.",
  },
  offer_decision: {
    title: "Offre / admission → tâche de décision",
    description: "Crée une tâche « Prendre une décision sur l’offre » à échéance N jours après une offre ou une admission.",
  },
  stale_interview: {
    title: "Entretien passé sans résultat",
    description: "Rappelle de noter le compte rendu et le résultat des entretiens qui ont eu lieu.",
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
  item("Lire la fiche de poste", "CHECKLIST"),
  item("Se renseigner sur l’entreprise", "CHECKLIST"),
  item("Choisir le CV", "DOCUMENT", "doc:CV"),
  item("Rédiger la lettre de motivation", "DOCUMENT", "doc:COVER_LETTER"),
  item("Envoyer la candidature", "CHECKLIST", "status:APPLIED"),
  item("Relancer", "FOLLOW_UP", "followup"),
  item("Préparer l’entretien", "PREPARATION", "interview"),
];

const EDUCATION_CHECKLIST = [
  item("Vérifier l’éligibilité et les prérequis", "CHECKLIST"),
  item("Choisir le CV", "DOCUMENT", "doc:CV"),
  item("Lettre de motivation", "DOCUMENT", "doc:COVER_LETTER"),
  item("Relevés de notes", "DOCUMENT", "doc:TRANSCRIPT"),
  item("Lettre de recommandation", "DOCUMENT", "doc:RECOMMENDATION"),
  item("Certificat de langue", "DOCUMENT", "doc:LANGUAGE_CERT", "details.languageRequirement"),
  item("Envoyer la candidature", "CHECKLIST", "status:APPLIED"),
];

export const DEFAULT_CHECKLISTS: Record<OpportunityType, ChecklistTemplateItem[]> = {
  JOB: JOB_CHECKLIST,
  INTERNSHIP: JOB_CHECKLIST,
  ALTERNANCE: [...JOB_CHECKLIST.slice(0, 4), item("Vérifier la compatibilité avec l’école et le rythme", "CHECKLIST"), ...JOB_CHECKLIST.slice(4)],
  VIE: [...JOB_CHECKLIST.slice(0, 4), item("Vérifier l’éligibilité au VIE (Business France)", "CHECKLIST"), ...JOB_CHECKLIST.slice(4)],
  FORMATION: EDUCATION_CHECKLIST,
  PHD: [
    item("Lire le sujet de recherche et les publications du labo", "CHECKLIST"),
    item("Contacter le directeur de thèse", "CHECKLIST"),
    item("Choisir le CV", "DOCUMENT", "doc:CV"),
    item("Projet de recherche / lettre de motivation", "DOCUMENT", "doc:COVER_LETTER"),
    item("Relevés de notes", "DOCUMENT", "doc:TRANSCRIPT"),
    item("Lettres de recommandation", "DOCUMENT", "doc:RECOMMENDATION"),
    item("Envoyer la candidature", "CHECKLIST", "status:APPLIED"),
  ],
  PROGRAM: EDUCATION_CHECKLIST,
  OTHER: [item("Choisir le CV", "DOCUMENT", "doc:CV"), item("Envoyer la candidature", "CHECKLIST", "status:APPLIED")],
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
    name: "Relance candidature (EN)",
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
