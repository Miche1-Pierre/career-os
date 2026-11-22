/**
 * Offer & contract of an opportunity (spec v2, P2): terms of the offer, contract review checklist and AI contract
 * analysis, all stored in `opportunities.details.offer`.
 */
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { documents, documentVersions, opportunities, opportunityDocuments } from "@/server/db/schema";
import {
  contractAnalysisSchema,
  CONTRACT_TERM_KEYS,
  offerFromTerms,
  offerPatchSchema,
  parseOffer,
  type ContractAnalysis,
  type Offer,
  type ReviewEntry,
  type StoredContractAnalysis,
} from "@/lib/offer";
import { truncate } from "@/lib/text";
import { AppError, notFound, type Ctx } from "@/server/context";
import { generateStructured } from "@/server/ai";
import { contractSystemPrompt, contractTask, PROMPT_VERSIONS } from "@/server/ai/prompts";
import { evidenceFound, normalizeForMatch } from "@/server/ai/verify";
import { extractFromFile } from "@/server/capture/files";
import { logAudit } from "./audit";
import { resolveVersionFile } from "./documents";
import { getSettings } from "./settings";
import { addEvent } from "./timeline";

const CONTRACT_MAX_CHARS = 120_000;

async function loadOpportunity(id: string) {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!row) throw notFound("Opportunity");
  return row;
}

async function writeOffer(id: string, details: unknown, offer: Offer) {
  const next = { ...((details as Record<string, unknown>) ?? {}), offer };
  await db.update(opportunities).set({ details: next as typeof opportunities.$inferInsert.details }).where(eq(opportunities.id, id));
}

export async function getOffer(id: string): Promise<Offer | null> {
  return parseOffer((await loadOpportunity(id)).details);
}

/**
 * Updates the offer (partial). The review checklist is merged by key: an entry sent here is the user's choice and is
 * never overwritten by a later analysis.
 */
export async function updateOffer(id: string, raw: unknown, ctx: Ctx) {
  const patch = offerPatchSchema.parse(raw);
  const row = await loadOpportunity(id);
  const before = parseOffer(row.details) ?? {};
  const { reviewChecklist, contractAnalysis: _ignored, ...fields } = patch;
  void _ignored;
  const next: Offer = { ...before, ...fields };
  if (reviewChecklist) {
    const byKey = new Map((before.reviewChecklist ?? []).map((e) => [e.key, e]));
    for (const entry of reviewChecklist) byKey.set(entry.key, { ...entry, source: entry.source ?? "USER" });
    next.reviewChecklist = [...byKey.values()];
  }
  await writeOffer(id, row.details, next);
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "UPDATE", summary: "Offre mise à jour" }, ctx);
  if (patch.signedAt && patch.signedAt !== before.signedAt) {
    await addEvent(db, { opportunityId: id, type: "NOTE", title: `Contrat signé le ${patch.signedAt}` }, ctx);
  }
  return next;
}

/** Document versions attached to the opportunity that can hold the contract (contracts first). */
export async function contractCandidates(id: string) {
  const rows = await db
    .select({ versionId: documentVersions.id, fileName: documentVersions.fileName, name: documents.name, kind: documents.kind, attachedAt: opportunityDocuments.attachedAt })
    .from(opportunityDocuments)
    .innerJoin(documentVersions, eq(documentVersions.id, opportunityDocuments.documentVersionId))
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(opportunityDocuments.opportunityId, id));
  const score = (r: (typeof rows)[number]) => (r.kind === "CONTRACT" ? 2 : /contrat|convention|contract|agreement/i.test(`${r.name} ${r.fileName ?? ""}`) ? 1 : 0);
  return rows.sort((a, b) => score(b) - score(a) || +new Date(b.attachedAt) - +new Date(a.attachedAt));
}

/** Text of the contract document (the chosen version, the one used last time, or the best attached candidate). */
export async function readContract(id: string, documentVersionId?: string | null) {
  const offer = await getOffer(id);
  const versionId = documentVersionId ?? offer?.contractDocumentVersionId ?? (await contractCandidates(id))[0]?.versionId;
  if (!versionId) throw new AppError("VALIDATION", "Aucun contrat joint : ajoute le PDF du contrat ou de la convention dans l’onglet Documents.");
  const file = await resolveVersionFile(versionId);
  const buffer = await fs.readFile(file.path);
  const extraction = await extractFromFile(buffer, file.fileName, file.version.mimeType);
  const text = extraction.text.trim();
  if (text.length < 200) throw new AppError("VALIDATION", "Le texte du contrat est illisible (PDF scanné ?). Joins une version texte ou un PDF non scanné.");
  return { versionId, fileName: file.fileName, text, truncated: text.length > CONTRACT_MAX_CHARS };
}

/**
 * Deterministic checks on the model output: a term whose quote is not in the contract is not trusted (kept out of the
 * offer), an unfavorable clause whose quote is not found is flagged. Pure.
 */
export function verifyContractAnalysis(analysis: ContractAnalysis, contractText: string) {
  const source = normalizeForMatch(contractText);
  const unverifiedTerms: string[] = [];
  for (const key of CONTRACT_TERM_KEYS) {
    const term = analysis.terms[key];
    if (!term?.value) continue;
    if (!term.evidence || !evidenceFound(term.evidence, source)) unverifiedTerms.push(key);
  }
  const unfavorable = analysis.unfavorable.map((u) => ({ ...u, verified: !u.evidence || evidenceFound(u.evidence, source) }));
  return { unverifiedTerms, unfavorable };
}

/** Stores an analysis (from the in-app AI or from Claude Code through MCP) and fills what it can in the offer. */
export async function saveContractAnalysis(
  id: string,
  raw: ContractAnalysis | unknown,
  ctx: Ctx,
  meta: { model?: string | null; by?: string; documentVersionId?: string | null; documentName?: string | null; contractText?: string | null } = {},
) {
  const analysis = contractAnalysisSchema.parse(raw);
  const row = await loadOpportunity(id);
  const before = parseOffer(row.details) ?? {};
  const verification = meta.contractText ? verifyContractAnalysis(analysis, meta.contractText) : { unverifiedTerms: [], unfavorable: analysis.unfavorable.map((u) => ({ ...u, verified: true })) };
  const stored: StoredContractAnalysis = {
    ...analysis,
    unfavorable: verification.unfavorable,
    generatedAt: new Date().toISOString(),
    by: meta.by ?? ctx.actor,
    model: meta.model ?? null,
    promptVersion: PROMPT_VERSIONS.contract_analysis,
    documentVersionId: meta.documentVersionId ?? before.contractDocumentVersionId ?? null,
    documentName: meta.documentName ?? null,
    unverifiedTerms: verification.unverifiedTerms,
  };

  // Offer fields still empty get the verified terms; the user's values are kept.
  const terms = offerFromTerms(analysis.terms, verification.unverifiedTerms);
  const filled: Partial<Offer> = {};
  for (const [key, value] of Object.entries(terms) as [keyof Offer, Offer[keyof Offer]][]) {
    if (before[key] === undefined || before[key] === null || before[key] === "") (filled as Record<string, unknown>)[key] = value;
  }
  if (!before.contractLabel && analysis.contractLabel) filled.contractLabel = analysis.contractLabel;

  // Checklist: the analysis fills the items the user has not judged yet.
  const byKey = new Map((before.reviewChecklist ?? []).map((e) => [e.key, e]));
  for (const item of analysis.checklist) {
    const current = byKey.get(item.key);
    if (current && current.source === "USER" && current.status !== "TODO") continue;
    byKey.set(item.key, { key: item.key, status: item.status, note: item.note, article: item.article, source: "AI" } satisfies ReviewEntry);
  }

  const next: Offer = { ...before, ...filled, reviewChecklist: [...byKey.values()], contractAnalysis: stored, contractDocumentVersionId: stored.documentVersionId ?? before.contractDocumentVersionId ?? null };
  await writeOffer(id, row.details, next);
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "ANALYSIS", summary: `Analyse du contrat par ${stored.by}` }, ctx);
  return { offer: next, filled: Object.keys(filled) };
}

/** Runs the in-app AI on the contract attached to the opportunity. */
export async function analyzeContract(id: string, options: { documentVersionId?: string | null } = {}, ctx: Ctx) {
  const row = await loadOpportunity(id);
  const contract = await readContract(id, options.documentVersionId);
  const settings = await getSettings();
  const offer = parseOffer(row.details);
  const { contractAnalysis: _a, reviewChecklist: _c, ...offerTerms } = offer ?? {};
  void _a;
  void _c;
  const prompt = [
    `OPPORTUNITY: ${row.title}${row.locationCity || row.locationCountry ? ` (${[row.locationCity, row.locationCountry].filter(Boolean).join(", ")})` : ""}`,
    `OFFER DETAILS ALREADY KNOWN (from emails, may differ from the contract):\n${JSON.stringify(offerTerms, null, 1)}`,
    `CONTRACT (${contract.fileName}${contract.truncated ? ", truncated" : ""}):\n<<<CONTRACT\n${truncate(contract.text, CONTRACT_MAX_CHARS)}\nCONTRACT>>>`,
  ].join("\n\n");
  const { data, meta } = await generateStructured({ ...contractTask, system: contractSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 420_000 });
  const [doc] = await db
    .select({ name: documents.name })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, contract.versionId));
  return saveContractAnalysis(id, data, ctx, { model: meta.model, by: "AI", documentVersionId: contract.versionId, documentName: doc?.name ?? contract.fileName, contractText: contract.text });
}
