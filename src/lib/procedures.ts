/**
 * Administrative procedures of an installation project (spec v2, P3). Pure and client-safe.
 *
 * Templates by country pair live in `src/lib/procedure-templates/*.json` (versioned, official sources cited). Applying a
 * template to a move turns its relative timings ("8 days after arrival") into due dates.
 */
import { z } from "zod";
import { addDays, isISODate } from "./dates";
import { normalizeText } from "./text";

export const PROCEDURE_CATEGORIES = ["VISA", "RESIDENCE", "HEALTH", "TAX", "BANK", "TRANSPORT", "INSURANCE", "OTHER"] as const;
export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];
export const PROCEDURE_CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  VISA: "Visa et permis",
  RESIDENCE: "Résidence",
  HEALTH: "Santé",
  TAX: "Impôts",
  BANK: "Banque",
  TRANSPORT: "Transport",
  INSURANCE: "Assurances",
  OTHER: "Autres",
};

export const PROCEDURE_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "DONE", "NOT_NEEDED"] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number];
export const PROCEDURE_STATUS_LABEL: Record<ProcedureStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  WAITING: "En attente",
  DONE: "Fait",
  NOT_NEEDED: "Pas nécessaire",
};
export const OPEN_PROCEDURE_STATUSES: ProcedureStatus[] = ["TODO", "IN_PROGRESS", "WAITING"];

/** TEMPLATE = from a versioned template, AI = found by Claude (to check), USER = typed by hand. */
export const PROCEDURE_SOURCES = ["TEMPLATE", "AI", "USER"] as const;
export type ProcedureSource = (typeof PROCEDURE_SOURCES)[number];

const url = z.string().trim().max(2048).regex(/^https:\/\/[^\s]+$/i, "https URL expected");
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.string().refine(isISODate, "Expected YYYY-MM-DD").nullable().optional();

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const templateStepSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: text(1000),
  officialUrl: url.nullable().optional(),
  requiredDocuments: z.array(z.string().trim().min(1).max(200)).max(15).nullable().optional(),
});

export const templateProcedureSchema = z.object({
  key: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(300),
  category: z.enum(PROCEDURE_CATEGORIES),
  summary: text(1000),
  appliesIf: text(300),
  /** Days relative to the arrival date (negative = before). */
  when: z.number().int().min(-730).max(730).nullable().optional(),
  officialUrl: url.nullable().optional(),
  steps: z.array(templateStepSchema).max(12).default([]),
  /** Destinations (ISO codes, or "EUROPE" = EU, EEA, Switzerland, UK) where it applies / does not apply. */
  onlyFor: z.array(z.string().trim().min(2).max(10)).max(60).optional(),
  skipFor: z.array(z.string().trim().min(2).max(10)).max(60).optional(),
});

export const procedureTemplateSchema = z.object({
  key: z.string().trim().min(1).max(40),
  from: z.string().trim().length(2),
  to: z.string().trim().min(1).max(2),
  title: z.string().trim().min(1).max(200),
  checkedAt: z.string().refine(isISODate, "Expected YYYY-MM-DD"),
  procedures: z.array(templateProcedureSchema).min(1).max(30),
  caveats: z.array(z.string().max(500)).max(15).default([]),
});
export type ProcedureTemplate = z.infer<typeof procedureTemplateSchema>;
export type TemplateProcedure = z.infer<typeof templateProcedureSchema>;

/** EU, EEA, Switzerland and the UK (where the CEAM works and an international driving permit is not needed). */
export const EUROPE = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH", "GB"];

function inList(code: string | null, list: string[] | undefined) {
  if (!code || !list) return false;
  return list.some((x) => x.toUpperCase() === code || (x.toUpperCase() === "EUROPE" && EUROPE.includes(code)));
}

/** Whether a template procedure applies to a destination (unknown destination: kept). Pure. */
export function appliesTo(p: Pick<TemplateProcedure, "onlyFor" | "skipFor">, destination: string | null): boolean {
  if (!destination) return true;
  const code = destination.toUpperCase();
  if (p.onlyFor?.length && !inList(code, p.onlyFor)) return false;
  return !inList(code, p.skipFor);
}

/**
 * Templates matching a trip: the origin → destination one first (its country-specific links win over the generic
 * ones on duplicates), then the generic departure template of the origin.
 */
export function templatesFor(templates: ProcedureTemplate[], from: string, to: string | null): ProcedureTemplate[] {
  const f = from.toUpperCase();
  const t = to?.toUpperCase() ?? null;
  const fitting = templates.filter((tpl) => tpl.from.toUpperCase() === f && (tpl.to === "*" || (t !== null && tpl.to.toUpperCase() === t)));
  return [...fitting.filter((tpl) => tpl.to !== "*"), ...fitting.filter((tpl) => tpl.to === "*")];
}

export interface NewProcedure {
  templateKey: string | null;
  key: string | null;
  title: string;
  category: ProcedureCategory;
  country: string | null;
  summary: string | null;
  appliesIf: string | null;
  dueDate: string | null;
  officialUrl: string | null;
  source: ProcedureSource;
  checkedAt: string | null;
  steps: { title: string; detail: string | null; officialUrl: string | null; requiredDocuments: string[] }[];
}

/**
 * Procedures of a template for a move: those that apply to the destination, due dates from the arrival date (a date
 * already past when the template is added becomes today), keys kept to avoid duplicates. Pure.
 */
export function proceduresFromTemplate(
  template: ProcedureTemplate,
  move: { arrivalDate: string | null; country: string | null },
  source: ProcedureSource = "TEMPLATE",
  options: { destination?: string | null; today?: string | null } = {},
): NewProcedure[] {
  const due = (when: number | null | undefined) => {
    if (!move.arrivalDate || when === null || when === undefined) return null;
    const d = addDays(move.arrivalDate, when);
    return options.today && d < options.today ? options.today : d;
  };
  return template.procedures.filter((p) => appliesTo(p, options.destination ?? null)).map((p) => ({
    templateKey: template.key,
    key: p.key,
    title: p.title,
    category: p.category,
    country: template.to === "*" ? template.from : (move.country ?? template.to),
    summary: p.summary ?? null,
    appliesIf: p.appliesIf ?? null,
    dueDate: due(p.when),
    officialUrl: p.officialUrl ?? null,
    source,
    checkedAt: template.checkedAt,
    steps: p.steps.map((s) => ({ title: s.title, detail: s.detail ?? null, officialUrl: s.officialUrl ?? null, requiredDocuments: s.requiredDocuments ?? [] })),
  }));
}

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

export const procedureInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.enum(PROCEDURE_CATEGORIES).default("OTHER"),
  status: z.enum(PROCEDURE_STATUSES).optional(),
  country: text(120),
  summary: text(2000),
  dueDate: isoDate,
  officialUrl: url.nullable().optional(),
  notes: text(10_000),
});
export const procedurePatchSchema = procedureInputSchema.partial().extend({
  /** The user has read an AI-found procedure and checked its links. */
  verified: z.boolean().optional(),
});

export const stepInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: text(1000),
  done: z.boolean().optional(),
  dueDate: isoDate,
  officialUrl: url.nullable().optional(),
  requiredDocuments: z.array(z.string().trim().min(1).max(200)).max(15).optional(),
  documentVersionIds: z.array(z.string().uuid()).max(15).optional(),
});
export const stepPatchSchema = stepInputSchema.partial();

/** Status implied by the steps: none done → unchanged, some → IN_PROGRESS, all → DONE. Pure. */
export function statusFromSteps(current: ProcedureStatus, steps: { done: boolean }[]): ProcedureStatus {
  if (!steps.length || current === "NOT_NEEDED") return current;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return "DONE";
  if (done > 0 && (current === "TODO" || current === "DONE")) return "IN_PROGRESS";
  if (done === 0 && current === "DONE") return "TODO";
  return current;
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

const COUNTRY_CODES: Record<string, string> = {
  france: "FR",
  belgique: "BE",
  belgium: "BE",
  canada: "CA",
  quebec: "CA",
  "etats-unis": "US",
  "etats unis": "US",
  usa: "US",
  "united states": "US",
  luxembourg: "LU",
  suisse: "CH",
  switzerland: "CH",
  "pays-bas": "NL",
  netherlands: "NL",
  allemagne: "DE",
  germany: "DE",
  "royaume-uni": "GB",
  "united kingdom": "GB",
  espagne: "ES",
  spain: "ES",
  italie: "IT",
  italy: "IT",
  portugal: "PT",
  irlande: "IE",
  ireland: "IE",
  chine: "CN",
  china: "CN",
  japon: "JP",
  japan: "JP",
  singapour: "SG",
  singapore: "SG",
  australie: "AU",
  australia: "AU",
};

/** ISO 3166 alpha-2 code of a country written in French or English ("Belgique" → "BE"), or null. */
export function countryCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalizeText(name).trim();
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return COUNTRY_CODES[n] ?? null;
}

// ---------------------------------------------------------------------------
// AI research (any country): same shape as a template, with the sources read
// ---------------------------------------------------------------------------

export const procedureResearchSchema = z.object({
  country: z.string().max(120),
  procedures: z
    .array(
      z.object({
        key: z.string().max(60),
        title: z.string().max(300),
        category: z.enum(PROCEDURE_CATEGORIES),
        summary: z.string().max(1000),
        appliesIf: z.string().max(300).nullable(),
        when: z.number().int().min(-730).max(730).nullable().describe("Days relative to the arrival date (negative = before), only when an official source gives the timing"),
        officialUrl: z.string().max(2048).nullable().describe("Official page for this procedure (https), fetched and confirmed"),
        sources: z.array(z.object({ label: z.string().max(200), url: z.string().max(2048) })).max(6),
        steps: z
          .array(
            z.object({
              title: z.string().max(300),
              detail: z.string().max(1000).nullable(),
              officialUrl: z.string().max(2048).nullable(),
              requiredDocuments: z.array(z.string().max(200)).max(15),
            }),
          )
          .max(10),
      }),
    )
    .max(20),
  caveats: z.array(z.string().max(500)).max(10),
});
export type ProcedureResearch = z.infer<typeof procedureResearchSchema>;

const httpsUrl = (u: string | null | undefined) => (u && /^https:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : null);

/** Research results turned into new procedures (non-https links dropped, marked AI = to check). Pure. */
export function proceduresFromResearch(research: ProcedureResearch, move: { arrivalDate: string | null; country: string | null }, checkedAt: string): (NewProcedure & { sources: { label: string; url: string }[] })[] {
  return research.procedures.map((p) => ({
    templateKey: null,
    key: p.key || null,
    title: p.title,
    category: p.category,
    country: move.country ?? research.country,
    summary: p.summary || null,
    appliesIf: p.appliesIf,
    dueDate: move.arrivalDate && p.when !== null ? addDays(move.arrivalDate, p.when) : null,
    officialUrl: httpsUrl(p.officialUrl),
    source: "AI" as const,
    checkedAt,
    sources: p.sources.flatMap((s) => (httpsUrl(s.url) ? [{ label: s.label, url: httpsUrl(s.url)! }] : [])),
    steps: p.steps.map((s) => ({ title: s.title, detail: s.detail, officialUrl: httpsUrl(s.officialUrl), requiredDocuments: s.requiredDocuments })),
  }));
}
