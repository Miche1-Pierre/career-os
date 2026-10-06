import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DBOrTx } from "@/server/db";
import { opportunities, pipelineStages, type PipelineStage } from "@/server/db/schema";
import { DEFAULT_PIPELINES, STAGE_CATEGORIES, type PipelineKey, type StageCategory } from "@/lib/constants";
import { AppError, notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";

export async function listStages(tx: DBOrTx = db, options: { includeArchived?: boolean } = {}): Promise<PipelineStage[]> {
  const rows = await tx.select().from(pipelineStages).orderBy(asc(pipelineStages.pipeline), asc(pipelineStages.position));
  return options.includeArchived ? rows : rows.filter((s) => !s.isArchived);
}

export async function stagesByPipeline(tx: DBOrTx = db): Promise<Record<PipelineKey, PipelineStage[]>> {
  const rows = await listStages(tx);
  return {
    JOB: rows.filter((r) => r.pipeline === "JOB"),
    EDUCATION: rows.filter((r) => r.pipeline === "EDUCATION"),
  };
}

export async function getStage(id: string, tx: DBOrTx = db): Promise<PipelineStage> {
  const [row] = await tx.select().from(pipelineStages).where(eq(pipelineStages.id, id));
  if (!row) throw notFound("Stage");
  return row;
}

/**
 * Resolve a stage within a pipeline from a key (APPLIED), a label ("Technical interview") or a category (INTERVIEW).
 * Falls back to the default stage when `key` is empty.
 */
export async function resolveStage(pipeline: PipelineKey, key: string | null | undefined, tx: DBOrTx = db): Promise<PipelineStage> {
  const stages = (await listStages(tx, { includeArchived: true })).filter((s) => s.pipeline === pipeline);
  if (!stages.length) throw new AppError("UNAVAILABLE", `No stages configured for pipeline ${pipeline}`);
  const active = stages.filter((s) => !s.isArchived);
  if (!key) return active.find((s) => s.isDefault) ?? active[0];
  const normalized = key.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const byKey = stages.find((s) => s.key === normalized);
  if (byKey) return byKey;
  const byLabel = stages.find((s) => s.label.toLowerCase() === key.trim().toLowerCase());
  if (byLabel) return byLabel;
  if ((STAGE_CATEGORIES as readonly string[]).includes(normalized)) {
    const byCategory = active.find((s) => s.category === normalized);
    if (byCategory) return byCategory;
  }
  // Cross-pipeline aliases (e.g. APPLIED for education = APPLICATION_SUBMITTED).
  const aliases: Record<string, string[]> = {
    APPLIED: ["APPLICATION_SUBMITTED"],
    APPLICATION_SUBMITTED: ["APPLIED"],
    SUBMITTED: ["APPLICATION_SUBMITTED", "APPLIED"],
    ADMITTED: ["OFFER"],
    OFFER: ["ADMITTED"],
    INTERVIEW: ["HR_INTERVIEW", "INTERVIEW"],
    HR_INTERVIEW: ["INTERVIEW"],
    TECHNICAL_INTERVIEW: ["INTERVIEW"],
    MANAGER_INTERVIEW: ["INTERVIEW"],
    FINAL_INTERVIEW: ["INTERVIEW"],
    WAITING: ["FOLLOW_UP", "APPLIED"],
    DECLINED: ["WITHDRAWN"],
    WITHDRAWN: ["DECLINED"],
    GHOSTED: ["CLOSED"],
  };
  for (const alias of aliases[normalized] ?? []) {
    const hit = stages.find((s) => s.key === alias);
    if (hit) return hit;
  }
  throw new AppError(
    "VALIDATION",
    `Unknown status "${key}" for ${pipeline} pipeline. Valid: ${active.map((s) => s.key).join(", ")}`,
  );
}

/** Stage in `target` pipeline equivalent to `stage` (same key, else first of same category, else default). */
export async function mapStageToPipeline(stage: PipelineStage, target: PipelineKey, tx: DBOrTx = db): Promise<PipelineStage> {
  if (stage.pipeline === target) return stage;
  const stages = (await listStages(tx)).filter((s) => s.pipeline === target);
  return (
    stages.find((s) => s.key === stage.key) ??
    stages.find((s) => s.category === stage.category) ??
    stages.find((s) => s.isDefault) ??
    stages[0]
  );
}

export async function ensureDefaultStages(tx: DBOrTx = db) {
  const existing = await tx.select({ pipeline: pipelineStages.pipeline, key: pipelineStages.key }).from(pipelineStages);
  const have = new Set(existing.map((e) => `${e.pipeline}:${e.key}`));
  const rows: (typeof pipelineStages.$inferInsert)[] = [];
  for (const pipeline of Object.keys(DEFAULT_PIPELINES) as PipelineKey[]) {
    const hasAny = existing.some((e) => e.pipeline === pipeline);
    DEFAULT_PIPELINES[pipeline].forEach((stage, index) => {
      if (have.has(`${pipeline}:${stage.key}`)) return;
      // Only seed a full pipeline once; afterwards, the user owns it.
      if (hasAny) return;
      rows.push({ pipeline, key: stage.key, label: stage.label, category: stage.category, position: index * 10, isDefault: !!stage.isDefault });
    });
  }
  if (rows.length) await tx.insert(pipelineStages).values(rows);
  return rows.length;
}

export const stageInputSchema = z.object({
  pipeline: z.enum(["JOB", "EDUCATION"]),
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
  label: z.string().trim().min(1).max(80),
  category: z.enum(STAGE_CATEGORIES),
  color: z.string().max(30).nullable().optional(),
});

export async function createStage(raw: z.input<typeof stageInputSchema>, ctx: Ctx) {
  const input = stageInputSchema.parse(raw);
  const stages = (await listStages(db, { includeArchived: true })).filter((s) => s.pipeline === input.pipeline);
  if (stages.some((s) => s.key === input.key)) throw new AppError("CONFLICT", `Stage ${input.key} already exists`);
  const sameCategory = stages.filter((s) => s.category === input.category);
  const position = sameCategory.length ? Math.max(...sameCategory.map((s) => s.position)) + 1 : (stages.at(-1)?.position ?? 0) + 10;
  const [row] = await db.insert(pipelineStages).values({ ...input, position }).returning();
  await logAudit(db, { entityType: "stage", entityId: row.id, action: "CREATE", summary: `${input.pipeline}: ${input.label}` }, ctx);
  return row;
}

export async function updateStage(
  id: string,
  patch: { label?: string; category?: StageCategory; color?: string | null; isArchived?: boolean; isDefault?: boolean },
  ctx: Ctx,
) {
  const stage = await getStage(id);
  return db.transaction(async (tx) => {
    if (patch.isDefault) {
      await tx.update(pipelineStages).set({ isDefault: false }).where(eq(pipelineStages.pipeline, stage.pipeline));
    }
    if (patch.isArchived) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(eq(opportunities.stageId, id));
      if (count > 0 && stage.isDefault) throw new AppError("CONFLICT", "The default stage cannot be archived");
    }
    const [row] = await tx
      .update(pipelineStages)
      .set({
        label: patch.label?.trim() || undefined,
        category: patch.category,
        color: patch.color === undefined ? undefined : patch.color,
        isArchived: patch.isArchived,
        isDefault: patch.isDefault,
      })
      .where(eq(pipelineStages.id, id))
      .returning();
    await logAudit(tx, { entityType: "stage", entityId: id, action: "UPDATE", summary: `${stage.pipeline}: ${row.label}` }, ctx);
    return row;
  });
}

export async function reorderStages(pipeline: PipelineKey, orderedIds: string[], ctx: Ctx) {
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(pipelineStages)
        .set({ position: index * 10 })
        .where(and(eq(pipelineStages.id, id), eq(pipelineStages.pipeline, pipeline)));
    }
    await logAudit(tx, { entityType: "stage", entityId: orderedIds[0] ?? "00000000-0000-0000-0000-000000000000", action: "REORDER", summary: pipeline }, ctx);
  });
}

export async function deleteStage(id: string, ctx: Ctx) {
  const stage = await getStage(id);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(eq(opportunities.stageId, id));
  if (count > 0) throw new AppError("CONFLICT", `${count} opportunities use "${stage.label}". Move them first or archive the stage.`);
  if (stage.isDefault) throw new AppError("CONFLICT", "The default stage cannot be deleted");
  await db.delete(pipelineStages).where(eq(pipelineStages.id, id));
  await logAudit(db, { entityType: "stage", entityId: id, action: "DELETE", summary: `${stage.pipeline}: ${stage.label}` }, ctx);
}
