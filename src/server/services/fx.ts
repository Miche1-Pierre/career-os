/**
 * Euro reference rates of the European Central Bank, for indicative conversions (P6). One small public XML file,
 * no key, no personal data sent. Kept in memory and in the settings table (key "fxRates") so the last known rates
 * survive restarts and offline periods. Never throws: without rates the app simply shows no conversion.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";
import { parseEcbRates, type FxRates } from "@/lib/fx";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const KEY = "fxRates";
/** The ECB publishes once per working day: refreshing a few times a day is plenty. */
const FRESH_MS = 6 * 3600_000;
/** After a failed download, wait before trying again. */
const RETRY_MS = 15 * 60_000;

interface Stored extends FxRates {
  fetchedAt: number;
}

const g = globalThis as unknown as { __careerOsFx?: { value: Stored | null; loaded: boolean; failedAt: number; pending: Promise<void> | null } };
const state = (g.__careerOsFx ??= { value: null, loaded: false, failedAt: 0, pending: null });

function fxEnabled() {
  return process.env.FX_RATES !== "off" && process.env.NODE_ENV !== "test" && !process.env.VITEST;
}

async function loadStored() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
    const v = row?.value as Stored | undefined;
    if (v?.date && v.rates && typeof v.fetchedAt === "number") state.value = v;
  } catch {
    // No stored rates: fine.
  }
}

async function refresh() {
  try {
    const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/xml" } });
    const parsed = res.ok ? parseEcbRates(await res.text()) : null;
    if (!parsed) throw new Error("No rates");
    const value: Stored = { ...parsed, fetchedAt: Date.now() };
    state.value = value;
    await db
      .insert(settings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  } catch {
    state.failedAt = Date.now();
  }
}

/**
 * Latest known rates. Stale rates are returned at once and refreshed in the background; the very first call waits
 * for the download (5 s at most).
 */
export async function getFxRates(): Promise<FxRates | null> {
  await loadStored();
  const now = Date.now();
  const stale = !state.value || now - state.value.fetchedAt > FRESH_MS;
  if (stale && fxEnabled() && now - state.failedAt > RETRY_MS && !state.pending) {
    state.pending = refresh().finally(() => {
      state.pending = null;
    });
    if (!state.value) await state.pending;
  }
  return state.value ? { date: state.value.date, rates: state.value.rates } : null;
}
