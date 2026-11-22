import { inArray } from "drizzle-orm";
import { db, type DBOrTx } from "@/server/db";
import { settings as settingsTable } from "@/server/db/schema";
import { settingsSchema, type AppSettings, type SettingsSection, SETTINGS_SECTIONS } from "@/lib/settings-schema";
import type { BusinessCalendar } from "@/lib/dates";
import { todayISO } from "@/lib/dates";
import { logAudit } from "./audit";
import type { Ctx } from "@/server/context";

const CACHE_TTL_MS = 5_000;
const cache = globalThis as unknown as { __careerOsSettings?: { value: AppSettings; at: number } };

export async function getSettings(tx: DBOrTx = db): Promise<AppSettings> {
  const cached = cache.__careerOsSettings;
  if (tx === db && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const rows = await tx
    .select()
    .from(settingsTable)
    .where(inArray(settingsTable.key, SETTINGS_SECTIONS as string[]));
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;
  const parsed = settingsSchema.safeParse(raw);
  // Invalid stored sections fall back to defaults section by section instead of breaking the app.
  let value: AppSettings;
  if (parsed.success) value = parsed.data;
  else {
    const fallback: Record<string, unknown> = {};
    for (const key of SETTINGS_SECTIONS) {
      const section = settingsSchema.shape[key].safeParse(raw[key]);
      fallback[key] = section.success ? section.data : settingsSchema.shape[key].parse(undefined);
    }
    value = fallback as AppSettings;
  }
  if (tx === db) cache.__careerOsSettings = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache() {
  cache.__careerOsSettings = undefined;
}

export async function updateSettingsSection<K extends SettingsSection>(
  section: K,
  value: unknown,
  ctx: Ctx,
  tx: DBOrTx = db,
): Promise<AppSettings[K]> {
  const schema = settingsSchema.shape[section];
  const parsed = schema.parse(value) as AppSettings[K];
  await tx
    .insert(settingsTable)
    .values({ key: section, value: parsed as unknown })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: parsed as unknown, updatedAt: new Date() } });
  if (section !== "onboarding") {
    await logAudit(tx, { entityType: "settings", entityId: "00000000-0000-0000-0000-000000000000", action: "UPDATE", summary: `Settings: ${section}` }, ctx);
  }
  invalidateSettingsCache();
  return parsed;
}

/** Merge a partial object into a settings section. */
export async function patchSettingsSection<K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>, ctx: Ctx) {
  const current = await getSettings();
  const merged = Array.isArray(current[section]) ? patch : { ...(current[section] as object), ...(patch as object) };
  return updateSettingsSection(section, merged, ctx);
}

export async function appToday(): Promise<string> {
  const s = await getSettings();
  return todayISO(s.general.timezone);
}

export function businessCalendar(s: AppSettings): BusinessCalendar {
  return { holidays: s.followUp.holidays };
}
