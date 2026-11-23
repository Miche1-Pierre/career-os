/**
 * Discovery engine (spec v2, P4): saved searches (jobs or housing), run by connectors (public APIs) and, when asked,
 * by the Claude agent (web search, public pages only). New job postings land in the Inbox (not analyzed: no quota
 * spent until the user asks), new housing listings in the move as "Nouveau". Every run keeps an honest report:
 * sources read, sources blocked and why, pre-filled links for the sites the user must open himself.
 */
import { and, desc, eq, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { housingListings, inboxItems, moves, opportunities, organizations, researchRuns, savedSearches, type ResearchRun, type RunSourceResult, type RunSuggestion, type SavedSearch } from "@/server/db/schema";
import {
  canonicalJobUrl,
  housingCriteriaSchema,
  isHttps,
  jobKey,
  jobsCriteriaSchema,
  nextRun,
  savedSearchInputSchema,
  searchLinks,
  sourceByKey,
  sourcesFor,
  SCHEDULES,
  type HousingCriteria,
  type JobResult,
  type Schedule,
} from "@/lib/discovery";
import { countryCode } from "@/lib/procedures";
import { isISODate, todayISO } from "@/lib/dates";
import { AppError, notFound, CLAUDE, type Ctx } from "@/server/context";
import { generateStructured } from "@/server/ai";
import { discoveryHousingSystemPrompt, discoveryHousingTask, discoveryJobsSystemPrompt, discoveryJobsTask } from "@/server/ai/prompts";
import { defaultFetchJson, runJobConnector, type ConnectorDeps } from "@/server/discovery/connectors";
import { logAudit } from "./audit";
import { getSettings } from "./settings";
import { createCapture } from "./inbox";
import { upsertListing } from "./moves";
import { emitNotification } from "./notifications";

const MAX_NEW_PER_RUN = 40;

export type SearchView = SavedSearch & { lastRun: ResearchRun | null; links: ReturnType<typeof searchLinks> };

function linksFor(s: SavedSearch) {
  if (s.domain === "JOBS") {
    const c = jobsCriteriaSchema.safeParse(s.criteria);
    if (!c.success) return [];
    return searchLinks("JOBS", { keywords: c.data.keywords.slice(0, 2), location: c.data.locations[0] ?? null, country: c.data.countries[0] ?? null });
  }
  const c = housingCriteriaSchema.safeParse(s.criteria);
  if (!c.success) return [];
  return searchLinks("HOUSING", { keywords: [c.data.furnished === "REQUIRED" ? "meublé" : "", c.data.types.includes("ROOM_COLIVING") || c.data.types.includes("ROOM_FLATSHARE") ? "colocation" : "location"].filter(Boolean), location: c.data.city, country: c.data.country ?? null });
}

export async function listSearches(options: { moveId?: string } = {}): Promise<SearchView[]> {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(and(isNull(savedSearches.deletedAt), options.moveId ? eq(savedSearches.moveId, options.moveId) : undefined))
    .orderBy(desc(savedSearches.createdAt));
  if (!rows.length) return [];
  const runs = await db.select().from(researchRuns).where(inArray(researchRuns.searchId, rows.map((r) => r.id))).orderBy(desc(researchRuns.startedAt));
  return rows.map((s) => ({ ...s, lastRun: runs.find((r) => r.searchId === s.id) ?? null, links: linksFor(s) }));
}

export async function getSearch(id: string) {
  const [row] = await db.select().from(savedSearches).where(and(eq(savedSearches.id, id), isNull(savedSearches.deletedAt)));
  if (!row) throw notFound("Search");
  return row;
}

export async function listRuns(searchId: string, limit = 10) {
  return db.select().from(researchRuns).where(eq(researchRuns.searchId, searchId)).orderBy(desc(researchRuns.startedAt)).limit(limit);
}

export async function createSearch(raw: unknown, ctx: Ctx) {
  const input = savedSearchInputSchema.parse(raw);
  if (input.domain === "HOUSING") {
    const [move] = await db.select({ id: moves.id }).from(moves).where(and(eq(moves.id, input.moveId), isNull(moves.deletedAt)));
    if (!move) throw notFound("Move");
  }
  const [row] = await db
    .insert(savedSearches)
    .values({
      domain: input.domain,
      name: input.name,
      moveId: input.domain === "HOUSING" ? input.moveId : null,
      criteria: input.criteria as Record<string, unknown>,
      sources: input.sources ?? [],
      useAgent: input.useAgent,
      schedule: input.schedule,
      nextRunAt: nextRun(input.schedule, new Date()),
    })
    .returning();
  await logAudit(db, { entityType: "search", entityId: row.id, action: "CREATE", summary: row.name }, ctx);
  return row;
}

export async function updateSearch(id: string, raw: Record<string, unknown>, ctx: Ctx) {
  const before = await getSearch(id);
  const values: Partial<typeof savedSearches.$inferInsert> = {};
  if (typeof raw.name === "string" && raw.name.trim()) values.name = raw.name.trim().slice(0, 200);
  if (raw.criteria !== undefined) values.criteria = (before.domain === "JOBS" ? jobsCriteriaSchema.parse(raw.criteria) : housingCriteriaSchema.parse(raw.criteria)) as Record<string, unknown>;
  if (Array.isArray(raw.sources)) values.sources = raw.sources.filter((s): s is string => typeof s === "string" && !!sourceByKey(s));
  if (typeof raw.useAgent === "boolean") values.useAgent = raw.useAgent;
  if (typeof raw.schedule === "string" && (SCHEDULES as readonly string[]).includes(raw.schedule)) {
    values.schedule = raw.schedule as Schedule;
    values.nextRunAt = nextRun(values.schedule, before.lastRunAt ?? new Date());
  }
  const [row] = await db.update(savedSearches).set(values).where(eq(savedSearches.id, id)).returning();
  await logAudit(db, { entityType: "search", entityId: id, action: "UPDATE", summary: row.name }, ctx);
  return row;
}

export async function deleteSearch(id: string, ctx: Ctx) {
  const [row] = await db.update(savedSearches).set({ deletedAt: new Date() }).where(eq(savedSearches.id, id)).returning();
  if (!row) throw notFound("Search");
  await logAudit(db, { entityType: "search", entityId: id, action: "DELETE", summary: row.name }, ctx);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface RunDeps extends ConnectorDeps {
  /** The agent call (stubbed in tests). */
  agent: typeof generateStructured;
}

async function defaultDeps(): Promise<RunDeps> {
  const settings = await getSettings();
  return { fetchJson: defaultFetchJson, env: (k) => process.env[k]?.trim() || undefined, today: todayISO(settings.general.timezone), agent: generateStructured };
}

const running = globalThis as unknown as { __careerOsDiscovery?: Set<string> };
const inFlight = (running.__careerOsDiscovery ??= new Set());

/** Runs a saved search now (one run at a time per search). */
export async function runSearch(id: string, ctx: Ctx, options: { trigger?: "MANUAL" | "SCHEDULE" | "CHAT"; deps?: RunDeps } = {}) {
  const search = await getSearch(id);
  if (inFlight.has(id)) throw new AppError("CONFLICT", "Cette recherche est déjà en cours.");
  inFlight.add(id);
  const deps = options.deps ?? (await defaultDeps());
  const [run] = await db.insert(researchRuns).values({ searchId: id, domain: search.domain, trigger: options.trigger ?? "MANUAL" }).returning();
  try {
    const outcome = search.domain === "JOBS" ? await runJobs(search, ctx, deps) : await runHousing(search, ctx, deps);
    const now = new Date();
    const [done] = await db
      .update(researchRuns)
      .set({ status: "DONE", finishedAt: now, ...outcome })
      .where(eq(researchRuns.id, run.id))
      .returning();
    await db.update(savedSearches).set({ lastRunAt: now, nextRunAt: nextRun(search.schedule, now) }).where(eq(savedSearches.id, id));
    if (done.resultsNew > 0) {
      await emitNotification({
        key: `discovery:${run.id}`,
        kind: "discovery",
        title: search.domain === "JOBS" ? `${done.resultsNew} nouvelle${done.resultsNew > 1 ? "s" : ""} offre${done.resultsNew > 1 ? "s" : ""} à trier` : `${done.resultsNew} nouveau${done.resultsNew > 1 ? "x" : ""} logement${done.resultsNew > 1 ? "s" : ""}`,
        body: search.name,
        entityType: "search",
        entityId: id,
      });
    }
    return done;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [failed] = await db.update(researchRuns).set({ status: "ERROR", finishedAt: new Date(), error: message.slice(0, 2000) }).where(eq(researchRuns.id, run.id)).returning();
    await db.update(savedSearches).set({ nextRunAt: nextRun(search.schedule, new Date()) }).where(eq(savedSearches.id, id));
    return failed;
  } finally {
    inFlight.delete(id);
  }
}

type RunOutcome = Pick<ResearchRun, "sources" | "resultsFound" | "resultsNew" | "createdIds" | "suggestions" | "report" | "model">;

async function runJobs(search: SavedSearch, ctx: Ctx, deps: RunDeps): Promise<RunOutcome> {
  const c = jobsCriteriaSchema.parse(search.criteria);
  const chosen = search.sources.length ? search.sources.map(sourceByKey).filter((s): s is NonNullable<typeof s> => !!s) : sourcesFor("JOBS", c.countries[0] ?? null);
  const sources: RunSourceResult[] = [];
  const found: JobResult[] = [];
  for (const s of chosen.filter((x) => x.access === "API")) {
    if (["greenhouse", "lever", "ashby"].includes(s.key) && !c.companies.some((b) => b.ats === s.key)) continue;
    try {
      const list = await runJobConnector(s.key, c, deps);
      sources.push({ key: s.key, name: s.name, ok: true, found: list.length });
      found.push(...list);
    } catch (error) {
      sources.push({ key: s.key, name: s.name, ok: false, found: 0, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  // Known postings: applications and inbox items (by canonical URL), applications by company + title + city.
  const opps = await db.select({ url: opportunities.url, title: opportunities.title, org: organizations.name, city: opportunities.locationCity }).from(opportunities).leftJoin(organizations, eq(organizations.id, opportunities.organizationId)).where(isNull(opportunities.deletedAt));
  const inbox = await db.select({ url: inboxItems.sourceUrl }).from(inboxItems).where(isNotNull(inboxItems.sourceUrl));
  const knownUrls = new Set([...opps.map((o) => o.url), ...inbox.map((i) => i.url)].filter((u): u is string => !!u).map(canonicalJobUrl));
  const knownKeys = new Set(opps.map((o) => jobKey({ company: o.org, title: o.title, location: o.city })));

  let report: string | null = null;
  let suggestions: RunSuggestion[] = [];
  let model: string | null = null;
  if (search.useAgent) {
    const settings = await getSettings();
    try {
      const prompt = [`CRITERIA:\n${JSON.stringify(c, null, 1)}`, `ALREADY KNOWN (skip):\n${[...knownUrls].slice(0, 150).join("\n") || "(none)"}`].join("\n\n");
      const { data, meta } = await deps.agent({ ...discoveryJobsTask, system: discoveryJobsSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 900_000, webTools: true, model: "sonnet" });
      model = meta.model;
      const results = data.results.filter((r) => isHttps(r.url));
      found.push(...results.map((r) => ({ source: r.source || "Claude", url: r.url.trim(), title: r.title, company: r.company, location: r.location, remote: r.remote, postedAt: r.postedAt && isISODate(r.postedAt.slice(0, 10)) ? r.postedAt.slice(0, 10) : null, description: r.summary, salaryText: r.salaryText, contractType: r.contractType })));
      sources.push({ key: "claude-jobs", name: "Claude (recherche web)", ok: true, found: results.length });
      for (const b of data.blocked) sources.push({ key: "blocked", name: b.name, ok: false, found: 0, reason: b.reason });
      suggestions = data.suggestions.filter((x) => isHttps(x.url));
      report = data.report;
    } catch (error) {
      sources.push({ key: "claude-jobs", name: "Claude (recherche web)", ok: false, found: 0, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const fresh: JobResult[] = [];
  const seenUrls = new Set(knownUrls);
  const seenKeys = new Set(knownKeys);
  for (const j of found) {
    const url = canonicalJobUrl(j.url);
    const key = jobKey(j);
    if (seenUrls.has(url) || seenKeys.has(key)) continue;
    seenUrls.add(url);
    seenKeys.add(key);
    fresh.push(j);
  }
  const createdIds: string[] = [];
  for (const j of fresh.slice(0, MAX_NEW_PER_RUN)) {
    const source = sourceByKey(j.source)?.name ?? j.source;
    const textBody = [
      j.title,
      [j.company, j.location, j.remote ? "télétravail possible" : null].filter(Boolean).join(" · "),
      [j.contractType, j.salaryText].filter(Boolean).join(" · "),
      `Trouvée par la recherche « ${search.name} » (${source})${j.postedAt ? `, publiée le ${j.postedAt}` : ""}.`,
      j.description ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const { item, duplicate } = await createCapture({ url: j.url, text: textBody, title: [j.title, j.company].filter(Boolean).join(" · "), sourceType: "API" }, ctx, { analyze: false });
    if (!duplicate) createdIds.push(item.id);
  }
  const reasons = sources.filter((s) => !s.ok).map((s) => `${s.name} : ${s.reason}`);
  return {
    sources,
    resultsFound: found.length,
    resultsNew: createdIds.length,
    createdIds,
    suggestions,
    model,
    report: report ?? `${found.length} offre${found.length > 1 ? "s" : ""} correspondante${found.length > 1 ? "s" : ""}, ${createdIds.length} nouvelle${createdIds.length > 1 ? "s" : ""} dans l'Inbox.${reasons.length ? ` Non lues : ${reasons.join(" ; ")}.` : ""}`,
  };
}

async function runHousing(search: SavedSearch, ctx: Ctx, deps: RunDeps): Promise<RunOutcome> {
  const c: HousingCriteria = housingCriteriaSchema.parse(search.criteria);
  if (!search.moveId) throw new AppError("VALIDATION", "Recherche de logement sans installation");
  const [move] = await db.select().from(moves).where(eq(moves.id, search.moveId));
  if (!move || move.deletedAt) throw notFound("Move");
  if (!search.useAgent) {
    return { sources: [], resultsFound: 0, resultsNew: 0, createdIds: [], suggestions: [], model: null, report: "Pas de source automatique pour le logement sans Claude : utilise les liens de recherche, puis colle les annonces." };
  }
  const known = await db.select({ url: housingListings.url }).from(housingListings).where(and(eq(housingListings.moveId, move.id), isNull(housingListings.deletedAt), isNotNull(housingListings.url)));
  const settings = await getSettings();
  const criteria = { ...c, country: c.country ?? countryCode(move.country), workplace: move.workAddress, stay: { from: c.from ?? move.arrivalDate, to: c.to ?? move.departureDate } };
  const prompt = [`CRITERIA:\n${JSON.stringify(criteria, null, 1)}`, `ALREADY KNOWN (skip):\n${known.map((k) => k.url).join("\n") || "(none)"}`].join("\n\n");
  const { data, meta } = await deps.agent({ ...discoveryHousingTask, system: discoveryHousingSystemPrompt(settings.ai.outputLanguage), prompt, timeoutMs: 900_000, webTools: true, model: "sonnet" });
  const sources: RunSourceResult[] = [{ key: "claude-housing", name: "Claude (recherche web)", ok: true, found: data.results.length }, ...data.blocked.map((b) => ({ key: "blocked", name: b.name, ok: false, found: 0, reason: b.reason }))];
  const createdIds: string[] = [];
  const today = deps.today;
  for (const r of data.results.filter((x) => isHttps(x.url))) {
    const { listing, created } = await upsertListing(
      {
        moveId: move.id,
        title: r.title,
        url: r.url.trim(),
        sources: [{ name: r.source || "Claude", url: r.url.trim() }],
        type: r.type ?? undefined,
        address: r.address,
        district: r.district,
        rent: r.rent !== null ? Math.round(r.rent) : null,
        charges: r.charges !== null ? Math.round(r.charges) : null,
        chargesInclude: r.chargesInclude,
        allInclusive: r.allInclusive ?? undefined,
        deposit: r.deposit !== null ? Math.round(r.deposit) : null,
        availableFrom: r.availableFrom && isISODate(r.availableFrom) ? r.availableFrom : null,
        minLeaseMonths: r.minLeaseMonths,
        furnished: r.furnished,
        roomSizeM2: r.roomSizeM2,
        housemates: r.housemates,
        contacts: { app: isHttps(r.contactUrl) ? r.contactUrl : undefined, email: r.contactEmail ?? undefined },
        notes: `Trouvée par Claude (${r.source}) le ${today}, recherche « ${search.name} ». Prix relevé : « ${r.evidence} ». À vérifier sur l'annonce.`,
        provenance: { by: "discovery", searchId: search.id, evidence: r.evidence },
      },
      ctx.actor === "USER" ? CLAUDE : ctx,
    );
    if (created) createdIds.push(listing.id);
  }
  return { sources, resultsFound: data.results.length, resultsNew: createdIds.length, createdIds, suggestions: data.suggestions.filter((x) => isHttps(x.url)), model: meta.model, report: data.report };
}

/** Background tick: runs at most one due search (bounded cost). */
export async function runDueSearches(now = new Date()) {
  const [due] = await db
    .select()
    .from(savedSearches)
    .where(and(isNull(savedSearches.deletedAt), ne(savedSearches.schedule, "OFF"), isNotNull(savedSearches.nextRunAt), lte(savedSearches.nextRunAt, now)))
    .orderBy(savedSearches.nextRunAt)
    .limit(1);
  if (!due || inFlight.has(due.id)) return null;
  return runSearch(due.id, CLAUDE, { trigger: "SCHEDULE" });
}
