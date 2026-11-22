import { asc, eq, sql } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { tags } from "@/server/db/schema";
import { uniqueStrings } from "@/lib/text";
import { AppError, type Ctx } from "@/server/context";
import { logAudit } from "./audit";

export const TAG_COLORS = ["slate", "red", "orange", "amber", "green", "teal", "sky", "blue", "violet", "pink"] as const;

const TAGGED_TABLES = ["opportunities", "organizations", "contacts", "documents"] as const;

/** Reuse the existing casing of known tags ("healthtech" → "HealthTech"), register new ones. */
export async function canonicalizeTags(tx: DBOrTx, names: string[] | undefined | null): Promise<string[]> {
  const wanted = uniqueStrings((names ?? []).map((n) => n.replace(/^#/, "").slice(0, 60)));
  if (!wanted.length) return [];
  const existing = await tx.select({ name: tags.name }).from(tags);
  const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t.name]));
  const result: string[] = [];
  const toCreate: string[] = [];
  for (const name of wanted) {
    const known = byLower.get(name.toLowerCase());
    if (known) result.push(known);
    else {
      result.push(name);
      toCreate.push(name);
      byLower.set(name.toLowerCase(), name);
    }
  }
  if (toCreate.length) {
    await tx
      .insert(tags)
      .values(toCreate.map((name, i) => ({ name, color: TAG_COLORS[(existing.length + i) % TAG_COLORS.length] })))
      .onConflictDoNothing();
  }
  return result;
}

export interface TagWithUsage {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  usage: number;
}

export async function listTags(): Promise<TagWithUsage[]> {
  const rows = await db.select().from(tags).orderBy(asc(tags.name));
  const usage = await db.execute<{ name: string; count: number }>(sql`
    select lower(t) as name, count(*)::int as count from (
      select unnest(tags) as t from opportunities where deleted_at is null
      union all select unnest(tags) from organizations where deleted_at is null
      union all select unnest(tags) from contacts where deleted_at is null
      union all select unnest(tags) from documents where deleted_at is null
    ) u group by 1`);
  const counts = new Map<string, number>();
  for (const row of usageRows<{ name: string; count: number }>(usage)) counts.set(row.name, Number(row.count));
  return rows.map((t) => ({ ...t, usage: counts.get(t.name.toLowerCase()) ?? 0 }));
}

/** postgres-js returns an array, PGlite returns { rows }. */
export function usageRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as { rows: T[] }).rows;
  return [];
}

export async function renameTag(oldName: string, newName: string, ctx: Ctx) {
  const target = newName.trim();
  if (!target) throw new AppError("VALIDATION", "Tag name required");
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tags).where(sql`lower(${tags.name}) = lower(${oldName})`);
    if (!existing) throw new AppError("NOT_FOUND", "Tag not found");
    const [clash] = await tx.select().from(tags).where(sql`lower(${tags.name}) = lower(${target})`);
    for (const table of TAGGED_TABLES) {
      await tx.execute(sql`
        update ${sql.identifier(table)}
        set tags = array(select distinct x from unnest(array_replace(tags, ${existing.name}, ${clash?.name ?? target})) as x)
        where ${existing.name} = any(tags)`);
    }
    if (clash && clash.id !== existing.id) await tx.delete(tags).where(eq(tags.id, existing.id));
    else await tx.update(tags).set({ name: target }).where(eq(tags.id, existing.id));
    await logAudit(tx, { entityType: "tag", entityId: existing.id, action: "RENAME", changes: [{ field: "name", from: existing.name, to: target }] }, ctx);
  });
}

export async function deleteTag(name: string, ctx: Ctx) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tags).where(sql`lower(${tags.name}) = lower(${name})`);
    const exact = existing?.name ?? name;
    for (const table of TAGGED_TABLES) {
      await tx.execute(sql`update ${sql.identifier(table)} set tags = array_remove(tags, ${exact}) where ${exact} = any(tags)`);
    }
    if (existing) {
      await tx.delete(tags).where(eq(tags.id, existing.id));
      await logAudit(tx, { entityType: "tag", entityId: existing.id, action: "DELETE", summary: existing.name }, ctx);
    }
  });
}

export async function updateTag(name: string, patch: { color?: string | null; description?: string | null }) {
  const [existing] = await db.select().from(tags).where(sql`lower(${tags.name}) = lower(${name})`);
  if (!existing) {
    const [created] = await db.insert(tags).values({ name, color: patch.color ?? null, description: patch.description ?? null }).returning();
    return created;
  }
  const [row] = await db
    .update(tags)
    .set({ color: patch.color === undefined ? existing.color : patch.color, description: patch.description === undefined ? existing.description : patch.description })
    .where(eq(tags.id, existing.id))
    .returning();
  return row;
}

export async function tagColorMap(): Promise<Record<string, string>> {
  const rows = await db.select({ name: tags.name, color: tags.color }).from(tags);
  return Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r.color ?? "slate"]));
}
