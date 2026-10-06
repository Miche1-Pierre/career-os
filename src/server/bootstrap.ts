import { eq, sql } from "drizzle-orm";
import type { DBOrTx } from "@/server/db";
import { savedViews, settings, tags } from "@/server/db/schema";
import { ensureDefaultStages } from "@/server/services/stages";

const DEFAULT_TAGS: [string, string][] = [
  ["HealthTech", "teal"],
  ["AI", "violet"],
  ["Product", "blue"],
  ["Full-stack", "sky"],
  ["International", "amber"],
  ["France", "blue"],
  ["Asia", "red"],
  ["Remote", "green"],
  ["Startup", "orange"],
  ["Large company", "slate"],
  ["Bioinformatics", "pink"],
  ["Master", "violet"],
  ["Priority", "red"],
  ["Software", "sky"],
];

const DEFAULT_VIEWS = [
  { name: "International", filters: { tags: ["International"] } },
  { name: "HealthTech", filters: { tags: ["HealthTech"] } },
  { name: "Software", filters: { tags: ["Software", "Full-stack"] } },
  { name: "Bioinformatics", filters: { tags: ["Bioinformatics"] } },
];

/** Idempotent first-run defaults. Never overwrites user customizations. */
export async function bootstrapDefaults(tx: DBOrTx) {
  const stagesCreated = await ensureDefaultStages(tx);
  const [flag] = await tx.select().from(settings).where(eq(settings.key, "bootstrap"));
  const state = (flag?.value ?? {}) as { tags?: boolean; views?: boolean };
  let tagsCreated = 0;
  let viewsCreated = 0;
  if (!state.tags) {
    const inserted = await tx
      .insert(tags)
      .values(DEFAULT_TAGS.map(([name, color]) => ({ name, color })))
      .onConflictDoNothing()
      .returning();
    tagsCreated = inserted.length;
  }
  if (!state.views) {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(savedViews);
    if (count === 0) {
      await tx.insert(savedViews).values(DEFAULT_VIEWS.map((v, i) => ({ ...v, position: (i + 1) * 10 })));
      viewsCreated = DEFAULT_VIEWS.length;
    }
  }
  await tx
    .insert(settings)
    .values({ key: "bootstrap", value: { tags: true, views: true } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { tags: true, views: true } } });
  return { stagesCreated, tagsCreated, viewsCreated };
}
