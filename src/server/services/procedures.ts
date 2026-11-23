/**
 * Administrative procedures of an installation project (spec v2, P3): from versioned templates (FR → BE…), from a
 * Claude research on official sources (any country, marked "à vérifier"), or typed by hand. Steps are ticked; the
 * procedure status follows them.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { moves, opportunities, procedures, procedureSteps, type Procedure, type ProcedureStep } from "@/server/db/schema";
import {
  countryCode,
  OPEN_PROCEDURE_STATUSES,
  procedureInputSchema,
  procedurePatchSchema,
  proceduresFromResearch,
  proceduresFromTemplate,
  statusFromSteps,
  stepInputSchema,
  stepPatchSchema,
  templatesFor,
  type NewProcedure,
} from "@/lib/procedures";
import { parseOffer } from "@/lib/offer";
import { CONTRACT_LABEL } from "@/lib/constants";
import { normalizeText } from "@/lib/text";
import { todayISO } from "@/lib/dates";
import { notFound, type Ctx } from "@/server/context";
import { generateStructured } from "@/server/ai";
import { proceduresResearchSystemPrompt, proceduresResearchTask } from "@/server/ai/prompts";
import { PROCEDURE_TEMPLATES, getTemplate } from "@/lib/procedure-templates";
import { logAudit } from "./audit";
import { getSettings } from "./settings";

export type ProcedureView = Procedure & { steps: ProcedureStep[]; toCheck: boolean };

/** Country the user leaves from (templates are written for French citizens leaving France). */
const ORIGIN = "FR";

async function todayForUser() {
  const settings = await getSettings();
  return todayISO(settings.general.timezone);
}

async function loadMove(moveId: string) {
  const [move] = await db.select().from(moves).where(and(eq(moves.id, moveId), isNull(moves.deletedAt)));
  if (!move) throw notFound("Move");
  return move;
}

export async function listProcedures(moveId: string): Promise<ProcedureView[]> {
  const rows = await db
    .select()
    .from(procedures)
    .where(and(eq(procedures.moveId, moveId), isNull(procedures.deletedAt)))
    .orderBy(sql`${procedures.dueDate} asc nulls last`, asc(procedures.position), asc(procedures.createdAt));
  if (!rows.length) return [];
  const steps = await db.select().from(procedureSteps).where(inArray(procedureSteps.procedureId, rows.map((r) => r.id))).orderBy(asc(procedureSteps.position));
  return rows.map((p) => ({ ...p, steps: steps.filter((s) => s.procedureId === p.id), toCheck: p.source === "AI" && !p.verifiedAt }));
}

/** Templates that fit a move (generic departure + origin → destination) and the ones already applied. */
export async function procedureTemplatesFor(moveId: string) {
  const move = await loadMove(moveId);
  const code = countryCode(move.country);
  const applied = await db.selectDistinct({ key: procedures.templateKey }).from(procedures).where(and(eq(procedures.moveId, moveId), isNull(procedures.deletedAt)));
  const appliedKeys = new Set(applied.map((a) => a.key).filter(Boolean));
  return {
    countryCode: code,
    suggested: templatesFor(PROCEDURE_TEMPLATES, ORIGIN, code).map((t) => t.key),
    all: PROCEDURE_TEMPLATES.map((t) => ({ key: t.key, title: t.title, checkedAt: t.checkedAt, count: t.procedures.length, applied: appliedKeys.has(t.key), caveats: t.caveats })),
  };
}

async function insertProcedures(moveId: string, list: (NewProcedure & { sources?: { label: string; url: string }[] })[], ctx: Ctx) {
  const existing = await db.select({ templateKey: procedures.templateKey, key: procedures.key, title: procedures.title }).from(procedures).where(and(eq(procedures.moveId, moveId), isNull(procedures.deletedAt)));
  const seen = new Set(existing.flatMap((e) => [e.templateKey && e.key ? `${e.templateKey}:${e.key}` : null, normalizeText(e.title)]).filter(Boolean) as string[]);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${procedures.position}), 0)::int` }).from(procedures).where(eq(procedures.moveId, moveId));
  let position = max;
  const created: string[] = [];
  for (const p of list) {
    const keys = [p.templateKey && p.key ? `${p.templateKey}:${p.key}` : null, normalizeText(p.title)].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    const [row] = await db
      .insert(procedures)
      .values({
        moveId,
        templateKey: p.templateKey,
        key: p.key,
        title: p.title,
        category: p.category,
        country: p.country,
        summary: p.summary,
        appliesIf: p.appliesIf,
        dueDate: p.dueDate,
        officialUrl: p.officialUrl,
        sources: p.sources ?? [],
        source: p.source,
        checkedAt: p.checkedAt,
        position: ++position,
      })
      .returning();
    if (p.steps.length) await db.insert(procedureSteps).values(p.steps.map((s, i) => ({ procedureId: row.id, position: i + 1, title: s.title, detail: s.detail, officialUrl: s.officialUrl, requiredDocuments: s.requiredDocuments })));
    created.push(row.id);
  }
  if (created.length) await logAudit(db, { entityType: "move", entityId: moveId, action: "UPDATE", summary: `${created.length} démarche(s) ajoutée(s)` }, ctx);
  return created;
}

/** Adds the procedures of templates (default: those that fit the move). Already added ones are skipped. */
export async function addProceduresFromTemplates(moveId: string, templateKeys: string[] | null | undefined, ctx: Ctx) {
  const move = await loadMove(moveId);
  const destination = countryCode(move.country);
  const fitting = templatesFor(PROCEDURE_TEMPLATES, ORIGIN, destination);
  const chosen = templateKeys?.length ? templateKeys.map((k) => getTemplate(k)).filter((t): t is NonNullable<typeof t> => !!t) : fitting;
  // Destination templates first: their country-specific version wins over the generic one.
  const templates = [...chosen].sort((a, b) => Number(a.to === "*") - Number(b.to === "*"));
  const today = await todayForUser();
  const list = templates.flatMap((t) => proceduresFromTemplate(t, move, "TEMPLATE", { destination, today }));
  const created = await insertProcedures(moveId, list, ctx);
  return { added: created.length, templates: templates.map((t) => t.key) };
}

/** Claude looks up the procedures on official sites (web search). Results are marked "à vérifier". */
export async function researchProcedures(moveId: string, ctx: Ctx) {
  const move = await loadMove(moveId);
  const settings = await getSettings();
  const opp = move.opportunityId ? (await db.select().from(opportunities).where(eq(opportunities.id, move.opportunityId)))[0] : null;
  const offer = parseOffer(opp?.details);
  const current = await listProcedures(moveId);
  const situation = {
    nationality: "French",
    leavingFrom: "France",
    destination: [move.city, move.country].filter(Boolean).join(", "),
    arrivalDate: move.arrivalDate,
    departureDate: move.departureDate,
    contract: offer?.contractLabel ?? (offer?.contractType ? CONTRACT_LABEL[offer.contractType] : opp?.type ?? null),
    workAddress: move.workAddress,
  };
  const prompt = [`SITUATION:\n${JSON.stringify(situation, null, 1)}`, `ALREADY IN THE USER'S LIST:\n${current.map((p) => `- ${p.title}`).join("\n") || "(none)"}`].join("\n\n");
  const { data } = await generateStructured({ ...proceduresResearchTask, system: proceduresResearchSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 900_000, webTools: true });
  const today = new Date().toISOString().slice(0, 10);
  const created = await insertProcedures(moveId, proceduresFromResearch(data, move, today), ctx);
  return { added: created.length, caveats: data.caveats };
}

/** Adds procedures given by Claude Code (MCP) or typed by hand. */
export async function addProcedures(moveId: string, list: unknown[], ctx: Ctx, source: "AI" | "USER" = "USER") {
  await loadMove(moveId);
  const parsed = list.map((raw) => {
    const r = raw as Record<string, unknown>;
    const input = procedureInputSchema.parse(r);
    const steps = Array.isArray(r.steps) ? r.steps.map((s) => stepInputSchema.parse(s)) : [];
    const sources = Array.isArray(r.sources) ? (r.sources as { label?: string; url?: string }[]).filter((s) => typeof s.url === "string" && /^https:\/\//.test(s.url)).map((s) => ({ label: String(s.label ?? s.url), url: String(s.url) })) : [];
    return {
      templateKey: null,
      key: null,
      title: input.title,
      category: input.category,
      country: input.country ?? null,
      summary: input.summary ?? null,
      appliesIf: null,
      dueDate: input.dueDate ?? null,
      officialUrl: input.officialUrl ?? null,
      source,
      checkedAt: source === "AI" ? new Date().toISOString().slice(0, 10) : null,
      sources,
      steps: steps.map((s) => ({ title: s.title, detail: s.detail ?? null, officialUrl: s.officialUrl ?? null, requiredDocuments: s.requiredDocuments ?? [] })),
    } satisfies NewProcedure & { sources: { label: string; url: string }[] };
  });
  const created = await insertProcedures(moveId, parsed, ctx);
  return { added: created.length, ids: created };
}

export async function updateProcedure(id: string, raw: unknown, ctx: Ctx) {
  const { verified, ...patch } = procedurePatchSchema.parse(raw);
  const [before] = await db.select().from(procedures).where(and(eq(procedures.id, id), isNull(procedures.deletedAt)));
  if (!before) throw notFound("Procedure");
  const values: Partial<typeof procedures.$inferInsert> = { ...patch };
  if (verified !== undefined) values.verifiedAt = verified ? new Date() : null;
  const [row] = await db.update(procedures).set(values).where(eq(procedures.id, id)).returning();
  await logAudit(db, { entityType: "move", entityId: before.moveId, action: "UPDATE", summary: `Démarche : ${row.title}` }, ctx);
  return row;
}

export async function deleteProcedure(id: string, ctx: Ctx) {
  const [row] = await db.update(procedures).set({ deletedAt: new Date() }).where(eq(procedures.id, id)).returning();
  if (!row) throw notFound("Procedure");
  await logAudit(db, { entityType: "move", entityId: row.moveId, action: "UPDATE", summary: `Démarche retirée : ${row.title}` }, ctx);
  return { deleted: true };
}

async function syncStatus(procedureId: string) {
  const [p] = await db.select().from(procedures).where(eq(procedures.id, procedureId));
  if (!p) return;
  const steps = await db.select({ done: procedureSteps.done }).from(procedureSteps).where(eq(procedureSteps.procedureId, procedureId));
  const next = statusFromSteps(p.status, steps);
  if (next !== p.status) await db.update(procedures).set({ status: next }).where(eq(procedures.id, procedureId));
}

export async function addStep(procedureId: string, raw: unknown) {
  const input = stepInputSchema.parse(raw);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${procedureSteps.position}), 0)::int` }).from(procedureSteps).where(eq(procedureSteps.procedureId, procedureId));
  const [row] = await db
    .insert(procedureSteps)
    .values({ procedureId, position: max + 1, title: input.title, detail: input.detail ?? null, done: input.done ?? false, dueDate: input.dueDate ?? null, officialUrl: input.officialUrl ?? null, requiredDocuments: input.requiredDocuments ?? [], documentVersionIds: input.documentVersionIds ?? [] })
    .returning();
  await syncStatus(procedureId);
  return row;
}

export async function updateStep(stepId: string, raw: unknown) {
  const patch = stepPatchSchema.parse(raw);
  const values: Partial<typeof procedureSteps.$inferInsert> = { ...patch };
  if (patch.done !== undefined) values.doneAt = patch.done ? new Date() : null;
  const [row] = await db.update(procedureSteps).set(values).where(eq(procedureSteps.id, stepId)).returning();
  if (!row) throw notFound("Step");
  await syncStatus(row.procedureId);
  return row;
}

export async function deleteStep(stepId: string) {
  const [row] = await db.delete(procedureSteps).where(eq(procedureSteps.id, stepId)).returning();
  if (!row) throw notFound("Step");
  await syncStatus(row.procedureId);
  return { deleted: true };
}

/** Open procedures with a due date, across active moves (for Today). */
export async function dueProcedures(until: string) {
  return db
    .select({ procedure: procedures, moveTitle: moves.title })
    .from(procedures)
    .innerJoin(moves, eq(moves.id, procedures.moveId))
    .where(and(isNull(procedures.deletedAt), isNull(moves.deletedAt), isNull(moves.archivedAt), inArray(procedures.status, OPEN_PROCEDURE_STATUSES), sql`${procedures.dueDate} is not null and ${procedures.dueDate} <= ${until}`))
    .orderBy(asc(procedures.dueDate));
}
