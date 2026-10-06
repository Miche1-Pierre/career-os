import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { documents, interviews, opportunities, organizations, pipelineStages } from "@/server/db/schema";
import { opportunityAnalysisSchema, type OpportunityAnalysis, type StoredAnalysis } from "@/lib/schemas";
import { addDays, todayISO } from "@/lib/dates";
import { OPPORTUNITY_TYPE_META } from "@/lib/constants";
import { truncate } from "@/lib/text";
import { generateStructured } from "@/server/ai";
import { commandSystemPrompt, commandTask, matchingSystemPrompt, matchingTask, PROMPT_VERSIONS, type CommandResult } from "@/server/ai/prompts";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";
import { getSettings } from "./settings";
import { getOpportunity } from "./opportunities";
import { listStages } from "./stages";

export async function analyzeOpportunity(id: string, ctx: Ctx) {
  const opp = await getOpportunity(id);
  const settings = await getSettings();
  const docs = await db.select({ name: documents.name, kind: documents.kind }).from(documents).where(isNull(documents.deletedAt));
  const opportunityData = {
    type: OPPORTUNITY_TYPE_META[opp.type].label,
    title: opp.title,
    organization: opp.organization?.name ?? null,
    industry: opp.organization?.industry ?? null,
    location: [opp.locationCity, opp.locationCountry].filter(Boolean).join(", ") || null,
    remotePolicy: opp.remotePolicy,
    details: opp.details,
    summary: opp.summary,
    responsibilities: opp.responsibilities,
    requirements: opp.requirements,
    skills: opp.skills,
    technologies: opp.technologies,
    niceToHave: opp.niceToHave,
    requiredDocuments: opp.requiredDocuments,
    description: truncate(opp.description, 20_000),
  };
  const prompt = [
    `OPPORTUNITY:\n${JSON.stringify(opportunityData, null, 1)}`,
    `USER PROFILE:\n${JSON.stringify(settings.profile, null, 1)}`,
    `USER DOCUMENTS: ${docs.map((d) => `${d.name} (${d.kind})`).join("; ") || "(none)"}`,
  ].join("\n\n");
  const { data, meta } = await generateStructured({ ...matchingTask, system: matchingSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 240_000 });
  return saveAnalysis(id, data, ctx, { model: meta.model, by: "AI" });
}

export async function saveAnalysis(id: string, raw: OpportunityAnalysis | unknown, ctx: Ctx, meta: { model?: string | null; by?: string } = {}) {
  const analysis = opportunityAnalysisSchema.parse(raw);
  const stored: StoredAnalysis = {
    ...analysis,
    generatedAt: new Date().toISOString(),
    by: meta.by ?? ctx.actor,
    model: meta.model ?? null,
    promptVersion: PROMPT_VERSIONS.matching_analysis,
  };
  const [row] = await db.update(opportunities).set({ analysis: stored }).where(eq(opportunities.id, id)).returning();
  if (!row) throw notFound("Opportunity");
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "ANALYSIS", summary: `Analysis by ${stored.by}` }, ctx);
  return stored;
}

export async function clearAnalysis(id: string, ctx: Ctx) {
  await db.update(opportunities).set({ analysis: null }).where(eq(opportunities.id, id));
  await logAudit(db, { entityType: "opportunity", entityId: id, action: "CLEAR_ANALYSIS" }, ctx);
}

// ---------------------------------------------------------------------------
// Natural-language commands ("Ajoute une relance à Zefir dans 5 jours")
// ---------------------------------------------------------------------------

export async function commandSnapshot() {
  const settings = await getSettings();
  const today = todayISO(settings.general.timezone);
  const [opps, stages, upcoming] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        type: opportunities.type,
        title: opportunities.title,
        organization: organizations.name,
        status: pipelineStages.key,
        category: pipelineStages.category,
        appliedAt: opportunities.appliedAt,
        nextFollowUpAt: opportunities.nextFollowUpAt,
        deadline: opportunities.deadline,
        tags: opportunities.tags,
        priority: opportunities.priority,
      })
      .from(opportunities)
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
      .where(isNull(opportunities.deletedAt))
      .orderBy(desc(opportunities.updatedAt))
      .limit(150),
    listStages(),
    db
      .select({ opportunityId: interviews.opportunityId, kind: interviews.kind, at: interviews.scheduledAt })
      .from(interviews)
      .where(and(gte(interviews.scheduledAt, new Date()), lte(interviews.scheduledAt, new Date(`${addDays(today, 30)}T00:00:00Z`)))),
  ]);
  return {
    today,
    timezone: settings.general.timezone,
    statusKeys: { JOB: stages.filter((s) => s.pipeline === "JOB").map((s) => s.key), EDUCATION: stages.filter((s) => s.pipeline === "EDUCATION").map((s) => s.key) },
    opportunities: opps,
    upcomingInterviews: upcoming,
  };
}

export async function interpretCommand(text: string): Promise<CommandResult & { model: string | null }> {
  const settings = await getSettings();
  const snapshot = await commandSnapshot();
  const prompt = `TODAY: ${snapshot.today} (${snapshot.timezone})\n\nSNAPSHOT:\n${JSON.stringify(snapshot)}\n\nUSER REQUEST:\n<request>${text.slice(0, 2000)}</request>`;
  const { data, meta } = await generateStructured({ ...commandTask, system: commandSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 120_000 });
  const ids = new Set(snapshot.opportunities.map((o) => o.id));
  return {
    ...data,
    operations: data.operations.filter((op) => !op.opportunityId || ids.has(op.opportunityId)),
    citations: data.citations.filter((c) => ids.has(c.opportunityId)),
    model: meta.model,
  };
}
