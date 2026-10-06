/**
 * Output contract of the capture analysis (prompt capture_analysis_v1), shared by the AI providers,
 * the MCP server (Claude submits the same structure) and the review UI.
 *
 * Every field is required but nullable: "null" means Unknown — never guessed.
 * Two variants are built from one definition: `strict` (JSON Schema given to the LLM) and `lenient`
 * (tolerant parsing of what comes back).
 */
import { z } from "zod";
import {
  CONFIDENCES,
  CONTRACT_TYPES,
  EDUCATION_FORMATS,
  INTERVIEW_KINDS,
  OPPORTUNITY_TYPES,
  RELATIONSHIPS,
  REMOTE_POLICIES,
  SALARY_PERIODS,
} from "./constants";

export const CAPTURE_KINDS = ["JOB_POSTING", "PROGRAM", "EMAIL", "MESSAGE", "NOTE", "OTHER"] as const;
export const COMMUNICATION_INTENTS = [
  "INTERVIEW_INVITATION",
  "INTERVIEW_CONFIRMATION",
  "APPLICATION_RECEIVED",
  "REJECTION",
  "OFFER",
  "ADMISSION",
  "WAITLIST",
  "RECRUITER_OUTREACH",
  "INFORMATION_REQUEST",
  "FOLLOW_UP",
  "OTHER",
] as const;

function build(lenient: boolean) {
  const str = () => (lenient ? z.string().nullable().catch(null) : z.string().nullable());
  const num = () =>
    lenient
      ? z
          .preprocess((v) => {
            if (typeof v === "number") return Number.isFinite(v) ? v : null;
            if (typeof v === "string") {
              const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
              return Number.isFinite(n) && v.trim() ? n : null;
            }
            return v ?? null;
          }, z.number().nullable())
          .catch(null)
      : z.number().nullable();
  const bool = () => (lenient ? z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().nullable()).catch(null) : z.boolean().nullable());
  const list = () => (lenient ? z.array(z.string()).catch([]) : z.array(z.string()));
  const oneOf = <T extends readonly [string, ...string[]]>(values: T) =>
    lenient
      ? z.preprocess((v) => (typeof v === "string" ? v.toUpperCase().replace(/[\s-]+/g, "_") : v), z.enum(values).nullable()).catch(null)
      : z.enum(values).nullable();
  const obj = <S extends z.ZodRawShape>(shape: S) => (lenient ? z.object(shape).nullable().catch(null) : z.object(shape).nullable());
  const arrayOf = <T extends z.ZodTypeAny>(item: T) => (lenient ? z.array(item).catch([]) : z.array(item));

  const opportunity = obj({
    type: lenient ? z.enum(OPPORTUNITY_TYPES).catch("OTHER") : z.enum(OPPORTUNITY_TYPES),
    title: str(),
    organizationName: str(),
    organizationWebsite: str(),
    organizationIndustry: str(),
    department: str(),
    locationCity: str(),
    locationCountry: str(),
    remotePolicy: oneOf(REMOTE_POLICIES),
    url: str(),
    applicationUrl: str(),
    contractType: oneOf(CONTRACT_TYPES),
    seniority: str(),
    experienceYears: num(),
    salaryMin: num(),
    salaryMax: num(),
    salaryCurrency: str(),
    salaryPeriod: oneOf(SALARY_PERIODS),
    salaryText: str(),
    startDate: str(),
    duration: str(),
    deadline: str(),
    deadlineTime: str(),
    applicationOpensAt: str(),
    level: str(),
    entryYear: str(),
    format: oneOf(EDUCATION_FORMATS),
    tuitionFees: str(),
    applicationFee: str(),
    teachingLanguage: str(),
    languageRequirement: str(),
    alternance: bool(),
    summary: str(),
    responsibilities: list(),
    requirements: list(),
    niceToHave: list(),
    skills: list(),
    technologies: list(),
    benefits: list(),
    subjects: list(),
    careerOutcomes: list(),
    requiredDocuments: list(),
    suggestedTags: list(),
    questionsToClarify: list(),
  });

  const fieldSource = z.object({
    field: lenient ? z.string().catch("") : z.string(),
    source: lenient ? z.enum(["EXTRACTED", "INFERRED"]).catch("INFERRED") : z.enum(["EXTRACTED", "INFERRED"]),
    confidence: lenient ? z.enum(CONFIDENCES).catch("MEDIUM") : z.enum(CONFIDENCES),
    evidence: str(),
  });

  const communication = obj({
    channel: lenient ? z.enum(["EMAIL", "LINKEDIN", "MESSAGE", "PHONE", "OTHER"]).catch("OTHER") : z.enum(["EMAIL", "LINKEDIN", "MESSAGE", "PHONE", "OTHER"]),
    direction: oneOf(["INBOUND", "OUTBOUND"] as const),
    intent: lenient ? z.enum(COMMUNICATION_INTENTS).catch("OTHER") : z.enum(COMMUNICATION_INTENTS),
    subject: str(),
    senderName: str(),
    senderEmail: str(),
    senderRole: str(),
    organizationName: str(),
    positionTitle: str(),
    sentAt: str(),
    matchedOpportunityId: str(),
    suggestedStatus: str(),
    interview: obj({
      kind: lenient ? z.enum(INTERVIEW_KINDS).catch("OTHER") : z.enum(INTERVIEW_KINDS),
      date: str(),
      time: str(),
      timezone: str(),
      durationMinutes: num(),
      meetingUrl: str(),
      location: str(),
      participants: list(),
    }),
    deadline: obj({ date: lenient ? z.string().catch("") : z.string(), description: lenient ? z.string().catch("") : z.string() }),
    nextAction: str(),
    summary: str(),
  });

  const note = obj({
    summary: str(),
    organizationName: str(),
    matchedOpportunityId: str(),
    occurredAt: str(),
    facts: list(),
    tasks: arrayOf(z.object({ title: lenient ? z.string().catch("") : z.string(), dueDate: str() })),
    followUpDate: str(),
  });

  const contact = z.object({
    fullName: lenient ? z.string().catch("") : z.string(),
    role: str(),
    organizationName: str(),
    email: str(),
    phone: str(),
    linkedinUrl: str(),
    relationship: oneOf(RELATIONSHIPS),
  });

  return z.object({
    kind: lenient ? z.enum(CAPTURE_KINDS).catch("OTHER") : z.enum(CAPTURE_KINDS),
    kindConfidence: lenient ? z.enum(CONFIDENCES).catch("MEDIUM") : z.enum(CONFIDENCES),
    language: str(),
    title: str(),
    summary: str(),
    opportunity,
    fieldSources: arrayOf(fieldSource),
    communication,
    note,
    contacts: arrayOf(contact),
    warnings: list(),
  });
}

export const captureAnalysisStrictSchema = build(false);
export const captureAnalysisLenientSchema = build(true);
export type CaptureAnalysis = z.infer<typeof captureAnalysisStrictSchema>;
export type ExtractedOpportunity = NonNullable<CaptureAnalysis["opportunity"]>;
export type ExtractedCommunication = NonNullable<CaptureAnalysis["communication"]>;
export type ExtractedNote = NonNullable<CaptureAnalysis["note"]>;
export type ExtractedContact = CaptureAnalysis["contacts"][number];

/** Stored result = analysis + verification flags added by the server. */
export interface VerifiedFieldSource {
  field: string;
  source: "EXTRACTED" | "INFERRED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string | null;
  verified: boolean;
  note?: string | null;
}

export type StoredCaptureResult = Omit<CaptureAnalysis, "fieldSources"> & {
  fieldSources: VerifiedFieldSource[];
  version: string;
};

/** Fields of ExtractedOpportunity that go into `details`. */
export const DETAIL_FIELDS = [
  "contractType",
  "seniority",
  "experienceYears",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "salaryText",
  "department",
  "startDate",
  "duration",
  "level",
  "entryYear",
  "format",
  "tuitionFees",
  "applicationFee",
  "teachingLanguage",
  "languageRequirement",
  "alternance",
  "subjects",
  "careerOutcomes",
] as const;

/** Mapping from extracted field name to the opportunity provenance key. */
export function provenanceKeyFor(field: string): string {
  const f = field.replace(/^opportunity\./, "");
  if ((DETAIL_FIELDS as readonly string[]).includes(f)) return `details.${f}`;
  if (f === "organizationName") return "organizationId";
  return f;
}
