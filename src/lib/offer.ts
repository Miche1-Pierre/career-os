/**
 * Offer & contract (spec v2, P2). Pure and client-safe.
 *
 * Stored in `opportunities.details.offer`: the terms of an offer, the contract review checklist and the last contract
 * analysis. From an accepted offer, the installation project (Move) is pre-filled (`moveFromOffer`).
 */
import { z } from "zod";
import { CONTRACT_TYPES, SALARY_PERIODS } from "./constants";
import { isISODate } from "./dates";

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.string().refine(isISODate, "Expected YYYY-MM-DD").nullable().optional();
const amount = z.number().min(0).max(10_000_000).nullable().optional();

// ---------------------------------------------------------------------------
// Review checklist
// ---------------------------------------------------------------------------

export const REVIEW_KEYS = ["dates", "hours", "pay", "trial", "notice", "leave", "place", "benefits", "ip", "confidentiality", "insurance", "documents"] as const;
export type ReviewKey = (typeof REVIEW_KEYS)[number];

export const REVIEW_ITEMS: { key: ReviewKey; label: string; hint: string }[] = [
  { key: "dates", label: "Dates de début et de fin", hint: "Conformes à ce qui a été convenu" },
  { key: "hours", label: "Temps de travail", hint: "Heures par semaine, horaires, heures supplémentaires" },
  { key: "pay", label: "Rémunération", hint: "Brut ou net, date de versement, primes" },
  { key: "trial", label: "Période d’essai", hint: "Durée, renouvellement" },
  { key: "notice", label: "Préavis et fin anticipée", hint: "De ton côté comme du leur" },
  { key: "leave", label: "Congés et absences", hint: "Congés payés, jours fériés, maladie" },
  { key: "place", label: "Lieu de travail et télétravail", hint: "Adresse exacte, jours à distance" },
  { key: "benefits", label: "Avantages", hint: "Chèques-repas, transport, mutuelle" },
  { key: "ip", label: "Propriété intellectuelle", hint: "À qui appartient ce que tu produis" },
  { key: "confidentiality", label: "Confidentialité et non-concurrence", hint: "Durée, périmètre, contrepartie" },
  { key: "insurance", label: "Assurance et accidents du travail", hint: "Qui te couvre" },
  { key: "documents", label: "Annexes et signatures", hint: "Règlement de travail, annexes, signataires" },
];

export const REVIEW_STATUSES = ["TODO", "OK", "WARN", "MISSING", "NA"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  TODO: "À vérifier",
  OK: "OK",
  WARN: "Point d’attention",
  MISSING: "Absent du contrat",
  NA: "Non applicable",
};

export const reviewEntrySchema = z.object({
  key: z.enum(REVIEW_KEYS),
  status: z.enum(REVIEW_STATUSES).default("TODO"),
  note: z.string().trim().max(1000).nullable().optional(),
  article: z.string().trim().max(120).nullable().optional(),
  /** AI = filled by the contract analysis, USER = set by hand (never overwritten by a new analysis). */
  source: z.enum(["AI", "USER"]).default("USER"),
});
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;

/** The full checklist: every default item, with what was stored for it. */
export function reviewChecklist(stored: ReviewEntry[] | null | undefined): (ReviewEntry & { label: string; hint: string })[] {
  return REVIEW_ITEMS.map((item) => {
    const entry = stored?.find((e) => e.key === item.key);
    return { key: item.key, status: entry?.status ?? "TODO", note: entry?.note ?? null, article: entry?.article ?? null, source: entry?.source ?? "USER", label: item.label, hint: item.hint };
  });
}

export function reviewProgress(stored: ReviewEntry[] | null | undefined) {
  const list = reviewChecklist(stored);
  return { done: list.filter((e) => e.status !== "TODO").length, total: list.length, warnings: list.filter((e) => e.status === "WARN" || e.status === "MISSING").length };
}

// ---------------------------------------------------------------------------
// Contract analysis (AI, descriptive)
// ---------------------------------------------------------------------------

const quotedTerm = z.object({
  value: z.string().max(300).nullable().describe("The value as written in the contract, or null when absent"),
  evidence: z.string().max(400).nullable().describe("Short verbatim quote from the contract supporting the value"),
  article: z.string().max(80).nullable().describe("Article / section number, e.g. 'Art. 4'"),
});

export const CONTRACT_TERM_KEYS = ["startDate", "endDate", "hoursPerWeek", "salaryGross", "salaryNet", "trialPeriod", "noticePeriod", "paidLeave", "workAddress", "remote", "mealVoucherPerDay"] as const;
export type ContractTermKey = (typeof CONTRACT_TERM_KEYS)[number];

/** Strict schema given to the model. */
export const contractAnalysisSchema = z.object({
  summary: z.string().max(2000),
  contractLabel: z.string().max(200).nullable().describe("Exact kind of contract, e.g. 'Convention d'immersion professionnelle'"),
  terms: z.object(Object.fromEntries(CONTRACT_TERM_KEYS.map((k) => [k, quotedTerm])) as Record<ContractTermKey, typeof quotedTerm>),
  checklist: z
    .array(
      z.object({
        key: z.enum(REVIEW_KEYS),
        status: z.enum(["OK", "WARN", "MISSING", "NA"]),
        note: z.string().max(600),
        article: z.string().max(80).nullable(),
      }),
    )
    .max(REVIEW_KEYS.length),
  unfavorable: z
    .array(
      z.object({
        title: z.string().max(200),
        detail: z.string().max(1000),
        article: z.string().max(80).nullable(),
        evidence: z.string().max(400).nullable(),
        severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
      }),
    )
    .max(20),
  missing: z.array(z.object({ topic: z.string().max(200), detail: z.string().max(800) })).max(20),
  inconsistencies: z.array(z.object({ detail: z.string().max(800), articles: z.array(z.string().max(80)).max(5) })).max(15),
  questions: z.array(z.string().max(500)).max(15),
  emailDraft: z.string().max(4000),
  legalNotes: z.array(z.object({ topic: z.string().max(200), contract: z.string().max(500), reference: z.string().max(500), source: z.string().max(300).nullable() })).max(12),
  caveats: z.array(z.string().max(500)).max(10),
});
export type ContractAnalysis = z.infer<typeof contractAnalysisSchema>;

export const storedContractAnalysisSchema = contractAnalysisSchema.extend({
  unfavorable: z.array(contractAnalysisSchema.shape.unfavorable.element.extend({ verified: z.boolean().default(true) })).max(20),
  generatedAt: z.string(),
  by: z.string().max(20),
  model: z.string().max(100).nullable().optional(),
  promptVersion: z.string().max(60).nullable().optional(),
  documentVersionId: z.string().uuid().nullable().optional(),
  documentName: z.string().max(300).nullable().optional(),
  /** Terms whose quote was not found in the contract text (not copied into the offer). */
  unverifiedTerms: z.array(z.string().max(40)).max(20).default([]),
});
export type StoredContractAnalysis = z.infer<typeof storedContractAnalysisSchema>;

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

export const offerSchema = z.object({
  contractType: z.enum(CONTRACT_TYPES).nullable().optional(),
  /** Exact name ("Convention d'immersion professionnelle", "CDD de remplacement"…). */
  contractLabel: text(200),
  salaryGross: amount,
  salaryNet: amount,
  period: z.enum(SALARY_PERIODS).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  startDate: isoDate,
  endDate: isoDate,
  hoursPerWeek: z.number().min(0).max(80).nullable().optional(),
  workAddress: text(500),
  remote: text(300),
  mealVoucherPerDay: z.number().min(0).max(100).nullable().optional(),
  benefits: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  trialPeriod: text(300),
  noticePeriod: text(300),
  paidLeave: text(300),
  /** Date by which the user must answer the offer. */
  decisionDeadline: isoDate,
  signedAt: isoDate,
  contractDocumentVersionId: z.string().uuid().nullable().optional(),
  reviewChecklist: z.array(reviewEntrySchema).max(REVIEW_KEYS.length).optional(),
  contractAnalysis: storedContractAnalysisSchema.nullable().optional(),
});
export type Offer = z.infer<typeof offerSchema>;
export const offerPatchSchema = offerSchema.partial();

/** The offer stored in `details.offer` (null when absent or unreadable). */
export function parseOffer(details: unknown): Offer | null {
  const raw = (details as { offer?: unknown } | null | undefined)?.offer;
  if (!raw || typeof raw !== "object") return null;
  const parsed = offerSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Terms of a verified analysis converted into offer fields (strings → dates / numbers). Pure. */
export function offerFromTerms(terms: Partial<Record<ContractTermKey, { value: string | null } | null>>, skip: string[] = []): Partial<Offer> {
  const get = (k: ContractTermKey) => (skip.includes(k) ? null : (terms[k]?.value?.trim() ?? null) || null);
  const num = (v: string | null) => {
    if (!v) return null;
    const m = v.replace(/\s/g, "").replace(/(\d)[.](\d{3})(?!\d)/g, "$1$2").match(/\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(",", ".")) : null;
  };
  const date = (v: string | null) => (v && isISODate(v.slice(0, 10)) ? v.slice(0, 10) : null);
  const out: Partial<Offer> = {};
  const set = <K extends keyof Offer>(key: K, value: Offer[K] | null) => {
    if (value !== null && value !== undefined && value !== "") out[key] = value;
  };
  set("startDate", date(get("startDate")));
  set("endDate", date(get("endDate")));
  set("hoursPerWeek", num(get("hoursPerWeek")));
  set("salaryGross", num(get("salaryGross")));
  set("salaryNet", num(get("salaryNet")));
  set("mealVoucherPerDay", num(get("mealVoucherPerDay")));
  set("trialPeriod", get("trialPeriod"));
  set("noticePeriod", get("noticePeriod"));
  set("paidLeave", get("paidLeave"));
  set("workAddress", get("workAddress"));
  set("remote", get("remote"));
  return out;
}

/** Worked days per month used to turn a daily meal voucher into a monthly food allowance. */
export const WORKED_DAYS_PER_MONTH = 20;

/**
 * Move fields an offer can fill: dates, workplace and, for a monthly net salary, the income and the meal-voucher
 * allowance of the budget. Only fields still empty on the move are returned (nothing typed by hand is replaced).
 */
export function moveFromOffer(
  offer: Offer | null | undefined,
  current: { arrivalDate?: string | null; departureDate?: string | null; workAddress?: string | null; currency?: string | null; budget?: { income?: number; foodAllowance?: number; incomeNote?: string | null } | null } = {},
) {
  const patch: { arrivalDate?: string; departureDate?: string; workAddress?: string; currency?: string; budget?: { income?: number; incomeNote?: string; foodAllowance?: number } } = {};
  if (!offer) return patch;
  if (offer.startDate && !current.arrivalDate) patch.arrivalDate = offer.startDate;
  if (offer.endDate && !current.departureDate) patch.departureDate = offer.endDate;
  if (offer.workAddress && !current.workAddress) patch.workAddress = offer.workAddress;
  if (offer.currency && !current.currency) patch.currency = offer.currency;
  const budget: NonNullable<typeof patch.budget> = {};
  if (offer.salaryNet && offer.period === "MONTH" && !current.budget?.income) {
    budget.income = Math.round(offer.salaryNet);
    if (!current.budget?.incomeNote) budget.incomeNote = "Net mensuel de l’offre";
  }
  if (offer.mealVoucherPerDay && !current.budget?.foodAllowance) budget.foodAllowance = Math.round(offer.mealVoucherPerDay * WORKED_DAYS_PER_MONTH);
  if (Object.keys(budget).length) patch.budget = budget;
  return patch;
}
