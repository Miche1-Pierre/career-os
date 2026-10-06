/**
 * Deterministic post-processing of AI output: evidence verification against the original text,
 * date/enum normalization, candidate-id validation and JSON-LD gap filling.
 */
import type { CaptureAnalysis, StoredCaptureResult, VerifiedFieldSource } from "@/lib/capture-schema";
import { PROMPT_VERSIONS } from "./prompts";
import { coerceISODate } from "@/lib/dates";
import { normalizeText } from "@/lib/text";
import type { JsonLdHints } from "@/server/capture/jsonld";

export function normalizeForMatch(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9€$£%+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote appears in the source (exact after normalization, or ≥ 60% of its 5-word windows). */
export function evidenceFound(evidence: string, normalizedSource: string): boolean {
  const e = normalizeForMatch(evidence);
  if (!e) return false;
  if (normalizedSource.includes(e)) return true;
  const words = e.split(" ");
  if (words.length < 6) return false;
  const size = 5;
  let hits = 0;
  let total = 0;
  for (let i = 0; i + size <= words.length; i++) {
    total++;
    if (normalizedSource.includes(words.slice(i, i + size).join(" "))) hits++;
  }
  return total > 0 && hits / total >= 0.6;
}

function valueFound(value: unknown, normalizedSource: string): boolean {
  if (typeof value === "string") return value.length >= 2 && normalizedSource.includes(normalizeForMatch(value));
  if (typeof value === "number") return normalizedSource.includes(String(value));
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string => typeof v === "string");
    if (!items.length) return false;
    return items.filter((v) => evidenceFound(v, normalizedSource) || normalizedSource.includes(normalizeForMatch(v))).length / items.length >= 0.5;
  }
  return false;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Generated (not extracted) fields: nothing to verify against the source. */
const GENERATED_FIELDS = new Set(["summary", "questionsToClarify", "suggestedTags", "type"]);

export function verifyCaptureAnalysis(
  analysis: CaptureAnalysis,
  context: {
    sourceText: string;
    timeZone: string;
    hints?: JsonLdHints | null;
    candidateIds?: string[];
    stageKeys?: string[];
    sourceUrl?: string | null;
  },
): StoredCaptureResult {
  const source = normalizeForMatch(`${context.sourceText}\n${context.hints ? JSON.stringify(context.hints) : ""}`);
  const warnings = [...(analysis.warnings ?? [])];
  const opportunity = analysis.opportunity ? { ...analysis.opportunity } : null;

  // Normalize dates / times
  if (opportunity) {
    for (const field of ["deadline", "applicationOpensAt"] as const) {
      const raw = opportunity[field];
      if (raw) {
        const iso = coerceISODate(raw, context.timeZone);
        if (!iso) warnings.push(`Unrecognized date for ${field}: “${raw}”`);
        opportunity[field] = iso;
      }
    }
    if (opportunity.deadlineTime && !TIME_RE.test(opportunity.deadlineTime)) opportunity.deadlineTime = null;
  }

  // Verify declared provenance
  const byField = new Map<string, VerifiedFieldSource>();
  for (const fs of analysis.fieldSources ?? []) {
    const field = fs.field?.replace(/^opportunity\./, "").trim();
    if (!field || GENERATED_FIELDS.has(field)) continue;
    let verified = false;
    let sourceKind = fs.source;
    let note: string | null = null;
    let evidence = fs.evidence ?? null;
    if (fs.evidence) {
      verified = evidenceFound(fs.evidence, source);
      if (!verified && fs.source === "EXTRACTED") {
        const value = opportunity ? (opportunity as Record<string, unknown>)[field] : undefined;
        if (value !== undefined && valueFound(value, source)) {
          // The value is in the source but the quote is not: never display a quote that does not exist.
          verified = true;
          evidence = null;
          note = "Value found in the source (the quoted text did not match).";
        } else {
          sourceKind = "INFERRED";
          note = "Quote not found verbatim in the source — treat as inferred.";
        }
      }
    } else if (fs.source === "EXTRACTED") {
      const value = opportunity ? (opportunity as Record<string, unknown>)[field] : undefined;
      verified = valueFound(value, source);
      if (!verified) {
        sourceKind = "INFERRED";
        note = "No supporting quote.";
      }
    }
    byField.set(field, { field, source: sourceKind, confidence: fs.confidence ?? "MEDIUM", evidence, verified, note });
  }

  // Fields filled without provenance → classify conservatively
  if (opportunity) {
    for (const [field, value] of Object.entries(opportunity)) {
      if (GENERATED_FIELDS.has(field)) continue;
      if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
      if (byField.has(field)) continue;
      const found = valueFound(value, source);
      byField.set(field, {
        field,
        source: found ? "EXTRACTED" : "INFERRED",
        confidence: found ? "MEDIUM" : "LOW",
        evidence: found && typeof value === "string" ? value.slice(0, 200) : null,
        verified: found,
        note: found ? null : "No provenance given by the model.",
      });
    }
    // Drop provenance entries for fields left empty.
    for (const [field] of byField) {
      const value = (opportunity as Record<string, unknown>)[field];
      if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) byField.delete(field);
    }
  }

  // JSON-LD gap filling (deterministic facts published by the page itself)
  const hints = context.hints;
  if (opportunity && hints) {
    const fill = (field: keyof typeof opportunity, value: unknown, evidence: string, inferred = false) => {
      if (value === null || value === undefined || value === "") return;
      const current = (opportunity as Record<string, unknown>)[field];
      if (current !== null && current !== undefined && current !== "") return;
      (opportunity as Record<string, unknown>)[field] = value;
      byField.set(field, { field, source: inferred ? "INFERRED" : "EXTRACTED", confidence: inferred ? "MEDIUM" : "HIGH", evidence, verified: true, note: "From the page's structured data (JSON-LD)" });
    };
    fill("title", hints.title, `JSON-LD title: ${hints.title}`);
    fill("organizationName", hints.organizationName, `JSON-LD hiringOrganization: ${hints.organizationName}`);
    fill("locationCity", hints.city, `JSON-LD addressLocality: ${hints.city}`);
    fill("locationCountry", hints.country, `JSON-LD addressCountry: ${hints.country}`);
    fill("salaryMin", hints.salaryMin, `JSON-LD baseSalary.minValue: ${hints.salaryMin}`);
    fill("salaryMax", hints.salaryMax, `JSON-LD baseSalary.maxValue: ${hints.salaryMax}`);
    fill("salaryCurrency", hints.salaryCurrency, `JSON-LD baseSalary.currency: ${hints.salaryCurrency}`);
    fill("salaryPeriod", hints.salaryPeriod, `JSON-LD baseSalary.unitText: ${hints.salaryPeriod}`);
    if (hints.remote) fill("remotePolicy", "REMOTE", "JSON-LD jobLocationType: TELECOMMUTE");
    if (hints.applicationDeadline) fill("deadline", hints.applicationDeadline, `JSON-LD applicationDeadline: ${hints.applicationDeadline}`);
    else if (hints.validThrough) fill("deadline", hints.validThrough, `JSON-LD validThrough (posting expiry): ${hints.validThrough}`, true);
  }
  if (opportunity && !opportunity.url && context.sourceUrl) opportunity.url = context.sourceUrl;

  // Communication / note sanitation
  const candidateIds = new Set(context.candidateIds ?? []);
  const stageKeys = new Set(context.stageKeys ?? []);
  const communication = analysis.communication ? { ...analysis.communication } : null;
  if (communication) {
    if (communication.matchedOpportunityId && !candidateIds.has(communication.matchedOpportunityId)) communication.matchedOpportunityId = null;
    if (communication.suggestedStatus && !stageKeys.has(communication.suggestedStatus)) communication.suggestedStatus = null;
    if (communication.interview) {
      const interview = { ...communication.interview };
      interview.date = interview.date ? coerceISODate(interview.date, context.timeZone) : null;
      if (interview.time && !TIME_RE.test(interview.time)) interview.time = /^\d{1,2}[:h]\d{2}$/.test(interview.time) ? interview.time.replace("h", ":").padStart(5, "0") : null;
      communication.interview = interview;
    }
    if (communication.deadline) {
      const date = coerceISODate(communication.deadline.date, context.timeZone);
      communication.deadline = date ? { ...communication.deadline, date } : null;
    }
  }
  const note = analysis.note ? { ...analysis.note } : null;
  if (note) {
    if (note.matchedOpportunityId && !candidateIds.has(note.matchedOpportunityId)) note.matchedOpportunityId = null;
    note.occurredAt = note.occurredAt ? coerceISODate(note.occurredAt, context.timeZone) : null;
    note.followUpDate = note.followUpDate ? coerceISODate(note.followUpDate, context.timeZone) : null;
    note.tasks = (note.tasks ?? []).filter((t) => t.title?.trim()).map((t) => ({ title: t.title.trim(), dueDate: t.dueDate ? coerceISODate(t.dueDate, context.timeZone) : null }));
  }
  const contacts = (analysis.contacts ?? [])
    .filter((c) => c.fullName?.trim())
    .map((c) => ({
      ...c,
      email: c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? c.email : null,
      linkedinUrl: c.linkedinUrl && /^https?:\/\//.test(c.linkedinUrl) ? c.linkedinUrl : null,
    }));

  const unverified = [...byField.values()].filter((f) => !f.verified).length;
  if (unverified > 0) warnings.push(`${unverified} field${unverified > 1 ? "s" : ""} could not be verified against the source — review them.`);

  return {
    ...analysis,
    opportunity,
    communication,
    note,
    contacts,
    fieldSources: [...byField.values()],
    warnings: [...new Set(warnings)],
    version: PROMPT_VERSIONS.capture_analysis,
  };
}
