import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { savedViews, type SavedViewFilters } from "@/server/db/schema";
import { notFound, type Ctx } from "@/server/context";
import { logAudit } from "./audit";

export const savedViewFiltersSchema = z
  .object({
    q: z.string().max(200).optional(),
    family: z.enum(["JOB", "EDUCATION"]).optional(),
    types: z.array(z.string().max(30)).max(20).optional(),
    categories: z.array(z.string().max(30)).max(20).optional(),
    stages: z.array(z.string().max(60)).max(50).optional(),
    tags: z.array(z.string().max(60)).max(30).optional(),
    sources: z.array(z.string().max(60)).max(30).optional(),
    priorities: z.array(z.string().max(20)).max(10).optional(),
    countries: z.array(z.string().max(100)).max(30).optional(),
    includeClosed: z.boolean().optional(),
    sort: z.string().max(30).optional(),
  })
  .strip();

export async function listViews() {
  return db.select().from(savedViews).orderBy(asc(savedViews.position), asc(savedViews.createdAt));
}

export async function createView(input: { name: string; filters: SavedViewFilters }, ctx: Ctx) {
  const filters = savedViewFiltersSchema.parse(input.filters);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${savedViews.position}), 0)::int` }).from(savedViews);
  const [row] = await db
    .insert(savedViews)
    .values({ name: input.name.trim().slice(0, 80) || "View", filters, position: (max ?? 0) + 10 })
    .returning();
  await logAudit(db, { entityType: "settings", entityId: row.id, action: "CREATE_VIEW", summary: row.name }, ctx);
  return row;
}

export async function updateView(id: string, input: { name?: string; filters?: SavedViewFilters }, ctx: Ctx) {
  const [row] = await db
    .update(savedViews)
    .set({ name: input.name?.trim() || undefined, filters: input.filters ? savedViewFiltersSchema.parse(input.filters) : undefined })
    .where(eq(savedViews.id, id))
    .returning();
  if (!row) throw notFound("View");
  await logAudit(db, { entityType: "settings", entityId: id, action: "UPDATE_VIEW", summary: row.name }, ctx);
  return row;
}

export async function deleteView(id: string, ctx: Ctx) {
  await db.delete(savedViews).where(eq(savedViews.id, id));
  await logAudit(db, { entityType: "settings", entityId: id, action: "DELETE_VIEW" }, ctx);
}
