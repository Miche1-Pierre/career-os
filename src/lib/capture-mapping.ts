/**
 * Deterministic mapping of a capture analysis into an opportunity draft (used by the review UI, MCP and API).
 */
import {
  CONTRACT_TYPES,
  EDUCATION_FORMATS,
  REMOTE_POLICIES,
  SALARY_PERIODS,
  type OpportunityType,
  type Source,
} from "./constants";
import { coerceISODate } from "./dates";
import type { OpportunityContactRef, OpportunityDetails, OpportunityInput, OpportunityLink, ProvenanceMap } from "./schemas";
import { DETAIL_FIELDS, provenanceKeyFor, type StoredCaptureResult } from "./capture-schema";
import { uniqueStrings } from "./text";

export function detectSource(url: string | null | undefined): Source | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("linkedin.")) return "LINKEDIN";
  if (host.includes("welcometothejungle")) return "WELCOME_TO_THE_JUNGLE";
  if (host.includes("indeed.")) return "INDEED";
  if (host.includes("glassdoor.")) return "GLASSDOOR";
  if (host.includes("monmaster.gouv")) return "MON_MASTER";
  if (host.includes("remotepeople") || host.includes("remote-people")) return "REMOTE_PEOPLE";
  if (/(apec\.fr|hellowork|jobteaser|francetravail|pole-emploi|jobup|stepstone|monster\.|cadremploi|jobijoba|otta\.com|wellfound)/.test(host)) return "JOB_BOARD";
  if (/(lever\.co|greenhouse\.io|workable|smartrecruiters|teamtailor|ashbyhq|recruitee|personio|workday|myworkdayjobs|successfactors|taleo)/.test(host)) return "COMPANY_WEBSITE";
  if (/(^|\.)(univ|universite|university|edu|ac\.[a-z]{2}|epfl|ethz|polytechnique|sorbonne|psl|inserm|cnrs|ens)(\.|-|$)/.test(host) || host.endsWith(".edu")) return "UNIVERSITY_WEBSITE";
  return null;
}

function isValidUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanList(values: string[] | null | undefined, max = 60): string[] {
  return uniqueStrings((values ?? []).map((v) => v.replace(/^[\s•\-–*·]+/, "").trim()).filter((v) => v.length > 0 && v.length <= 1000)).slice(0, max);
}

export interface OpportunityDraft {
  input: OpportunityInput;
  provenance: ProvenanceMap;
  contacts: OpportunityContactRef[];
  questionsToClarify: string[];
}

export function draftFromCapture(
  result: StoredCaptureResult,
  capture: { id: string; sourceUrl: string | null; rawText: string },
  options: { timeZone?: string; by?: string } = {},
): OpportunityDraft | null {
  const o = result.opportunity;
  if (!o) return null;
  let type: OpportunityType = o.type;
  if (result.kind === "PROGRAM" && ["JOB", "OTHER"].includes(type)) type = "FORMATION";

  const details: OpportunityDetails = {};
  for (const field of DETAIL_FIELDS) {
    const value = (o as Record<string, unknown>)[field];
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
    (details as Record<string, unknown>)[field] = Array.isArray(value) ? cleanList(value as string[]) : value;
  }
  if (details.contractType && !(CONTRACT_TYPES as readonly string[]).includes(details.contractType)) delete details.contractType;
  if (details.format && !(EDUCATION_FORMATS as readonly string[]).includes(details.format)) delete details.format;
  if (details.salaryPeriod && !(SALARY_PERIODS as readonly string[]).includes(details.salaryPeriod)) delete details.salaryPeriod;
  if (o.department) details.department = o.department;

  const url = isValidUrl(o.url) ? o.url : isValidUrl(capture.sourceUrl) ? capture.sourceUrl : null;
  const links: OpportunityLink[] = [];
  if (isValidUrl(o.applicationUrl) && o.applicationUrl !== url) links.push({ kind: "APPLICATION", url: o.applicationUrl, label: null });
  if (isValidUrl(o.organizationWebsite)) links.push({ kind: "COMPANY", url: o.organizationWebsite, label: null });

  const deadline = coerceISODate(o.deadline, options.timeZone);
  const deadlineTime = o.deadlineTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.deadlineTime) ? o.deadlineTime : null;

  const provenance: ProvenanceMap = {};
  const at = new Date().toISOString();
  for (const fs of result.fieldSources) {
    if (!fs.field) continue;
    const key = provenanceKeyFor(fs.field);
    provenance[key] = {
      source: fs.source,
      confidence: fs.confidence,
      evidence: fs.evidence,
      verified: fs.verified,
      by: options.by ?? "AI",
      at,
      captureId: capture.id,
    };
  }
  if (url && !o.url && capture.sourceUrl) provenance.url = { source: "EXTRACTED", confidence: "HIGH", evidence: "Captured from this URL", verified: true, by: "SYSTEM", at, captureId: capture.id };

  const input: OpportunityInput = {
    type,
    title: o.title?.trim() || result.title?.trim() || "Untitled opportunity",
    organizationName: o.organizationName?.trim() || null,
    organizationWebsite: isValidUrl(o.organizationWebsite) ? o.organizationWebsite : null,
    status: null,
    priority: "NORMAL",
    source: detectSource(capture.sourceUrl ?? url),
    url,
    links,
    locationCity: o.locationCity,
    locationCountry: o.locationCountry,
    remotePolicy: o.remotePolicy && (REMOTE_POLICIES as readonly string[]).includes(o.remotePolicy) ? o.remotePolicy : null,
    summary: o.summary ?? result.summary,
    description: capture.rawText.slice(0, 200_000),
    responsibilities: cleanList(o.responsibilities),
    requirements: cleanList(o.requirements),
    niceToHave: cleanList(o.niceToHave),
    skills: cleanList(o.skills, 80),
    technologies: cleanList(o.technologies, 80),
    benefits: cleanList(o.benefits),
    requiredDocuments: cleanList(o.requiredDocuments, 30),
    details,
    deadline,
    deadlineTime,
    applicationOpensAt: coerceISODate(o.applicationOpensAt, options.timeZone),
    tags: cleanList(o.suggestedTags, 8),
    captureId: capture.id,
    provenance,
  };

  const contacts: OpportunityContactRef[] = result.contacts
    .filter((c) => c.fullName?.trim())
    .map((c) => ({
      fullName: c.fullName.trim(),
      role: c.role,
      email: c.email,
      phone: c.phone,
      linkedinUrl: isValidUrl(c.linkedinUrl) ? c.linkedinUrl : null,
      relationship: c.relationship,
      opportunityRole: c.role,
    }));

  return { input, provenance, contacts, questionsToClarify: cleanList(o.questionsToClarify, 20) };
}
