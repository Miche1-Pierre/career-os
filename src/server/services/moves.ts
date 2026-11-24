/**
 * Relocation projects (« Move ») and their housing listings. Single business layer used by the UI (Server Actions),
 * the REST API and the MCP server. Pure maths live in src/lib/relocation.ts.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { housingListings, moves, opportunities, organizations, type HousingListing, type ListingHistoryEntry, type Move, type MovePlace } from "@/server/db/schema";
import {
  computeBudget,
  distanceKm,
  draftFirstMessage,
  fitLevel,
  LISTING_STATUS_META,
  listingFit,
  listingInputSchema,
  listingPatchSchema,
  listingTotal,
  median,
  moveInputSchema,
  movePatchSchema,
  normalizeBudget,
  placeInputSchema,
  placeTrips,
  walkMinutes,
  type BudgetPlan,
  type BudgetResult,
  type FitIssue,
  type FitLevel,
  type ListingInput,
  type ListingPatch,
  type ListingStatus,
  type MoveInput,
  type PlaceInput,
  type PlaceTrip,
} from "@/lib/relocation";
import { badRequest, notFound, type Ctx } from "@/server/context";
import { moveFromOffer, parseOffer } from "@/lib/offer";
import { logAudit } from "./audit";
import { getSettings } from "./settings";
import { geocode } from "./geocode";
import { countryInfo } from "@/lib/countries";

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface ListingView extends HousingListing {
  total: number | null;
  commuteKm: number | null;
  walkMin: number | null;
  issues: FitIssue[];
  fit: FitLevel;
  budget: BudgetResult | null;
  open: boolean;
  /** Walking distance to each place of the move (when the listing is located). */
  trips: PlaceTrip[];
}

export interface MoveSummary {
  listings: number;
  open: number;
  toContact: number;
  waitingReply: number;
  visitsPlanned: number;
  chosen: { id: string; title: string; total: number | null } | null;
  bestSavings: { id: string; title: string; savings: number } | null;
  daysUntilArrival: number | null;
}

export interface MoveView extends Move {
  budgetPlan: BudgetPlan;
  opportunityTitle: string | null;
  organizationName: string | null;
  listings: ListingView[];
  summary: MoveSummary;
  stayMonths: number | null;
}

function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

export function enrichListings(move: Move, plan: BudgetPlan, rows: HousingListing[]): ListingView[] {
  const totals = rows.map((r) => listingTotal(r)).filter((t): t is number => t !== null);
  const med = totals.length >= 4 ? median(totals) : null;
  return rows.map((r) => {
    const commuteKm =
      r.lat !== null && r.lng !== null && move.workLat !== null && move.workLng !== null ? distanceKm({ lat: r.lat, lng: r.lng }, { lat: move.workLat, lng: move.workLng }) : r.distanceKm;
    const total = listingTotal(r);
    const issues = listingFit(
      { rent: r.rent, charges: r.charges, allInclusive: r.allInclusive, availableFrom: r.availableFrom, minLeaseMonths: r.minLeaseMonths, furnished: r.furnished, distanceKm: commuteKm },
      { arrivalDate: move.arrivalDate, departureDate: move.departureDate, housingTarget: plan.housingTarget ?? null, walkThresholdKm: plan.walkThresholdKm, medianTotal: med },
    );
    return {
      ...r,
      total,
      commuteKm,
      walkMin: commuteKm !== null ? walkMinutes(commuteKm) : null,
      issues,
      fit: fitLevel(issues),
      budget: total !== null ? computeBudget(plan, total, commuteKm) : null,
      open: LISTING_STATUS_META[r.status].open,
      trips: placeTrips(r, move.places ?? []),
    };
  });
}

function summarize(move: Move, listings: ListingView[], today: string): MoveSummary {
  const open = listings.filter((l) => l.open);
  const chosen = listings.find((l) => l.status === "CHOSEN") ?? null;
  const candidates = open.filter((l) => l.budget && l.fit !== "ko");
  const best = candidates.sort((a, b) => b.budget!.savings - a.budget!.savings)[0] ?? null;
  return {
    listings: listings.length,
    open: open.length,
    toContact: listings.filter((l) => l.status === "SHORTLISTED").length,
    waitingReply: listings.filter((l) => l.status === "CONTACTED").length,
    visitsPlanned: listings.filter((l) => l.status === "VISIT_PLANNED" && l.visitDate && l.visitDate >= today).length,
    chosen: chosen ? { id: chosen.id, title: chosen.title, total: chosen.total } : null,
    bestSavings: best ? { id: best.id, title: best.title, savings: best.budget!.savings } : null,
    daysUntilArrival: move.arrivalDate ? daysBetween(today, move.arrivalDate) : null,
  };
}

async function todayISOForUser() {
  const settings = await getSettings();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: settings.general.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export async function listMoves(options: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({ move: moves, opportunityTitle: opportunities.title, organizationName: organizations.name })
    .from(moves)
    .leftJoin(opportunities, eq(opportunities.id, moves.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(isNull(moves.deletedAt), options.includeArchived ? undefined : isNull(moves.archivedAt)))
    .orderBy(asc(moves.arrivalDate), desc(moves.createdAt));
  if (!rows.length) return [] as MoveView[];
  const listings = await db
    .select()
    .from(housingListings)
    .where(and(inArray(housingListings.moveId, rows.map((r) => r.move.id)), isNull(housingListings.deletedAt)));
  const today = await todayISOForUser();
  return rows.map((r) => toView(r.move, listings.filter((l) => l.moveId === r.move.id), r.opportunityTitle, r.organizationName, today));
}

function toView(move: Move, rows: HousingListing[], opportunityTitle: string | null, organizationName: string | null, today: string): MoveView {
  const plan = normalizeBudget(move.budget);
  const listings = enrichListings(move, plan, rows);
  return {
    ...move,
    budgetPlan: plan,
    opportunityTitle,
    organizationName,
    listings,
    summary: summarize(move, listings, today),
    stayMonths: move.arrivalDate && move.departureDate ? Math.max(1, Math.round(daysBetween(move.arrivalDate, move.departureDate) / 30.4)) : null,
  };
}

export async function getMove(id: string): Promise<MoveView> {
  const [row] = await db
    .select({ move: moves, opportunityTitle: opportunities.title, organizationName: organizations.name })
    .from(moves)
    .leftJoin(opportunities, eq(opportunities.id, moves.opportunityId))
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(and(eq(moves.id, id), isNull(moves.deletedAt)));
  if (!row) throw notFound("Move");
  const listings = await db
    .select()
    .from(housingListings)
    .where(and(eq(housingListings.moveId, id), isNull(housingListings.deletedAt)))
    .orderBy(asc(housingListings.createdAt));
  return toView(row.move, listings, row.opportunityTitle, row.organizationName, await todayISOForUser());
}

export interface ListingLine {
  id: string;
  url: string | null;
  title: string;
  status: ListingStatus;
  total: number | null;
  commuteKm: number | null;
  walkMin: number | null;
  /** What is left each month with this listing (budget plan of the move). */
  savings: number | null;
  availableFrom: string | null;
  minLeaseMonths: number | null;
  furnished: string;
  pick: string | null;
  /** Points to check or blocking (dates, lease, furnished, budget…). */
  issues: string[];
}

/**
 * The listings of a move, one short line each, a page at a time: what an assistant reads before adding listings
 * (getMove returns every detail and gets too large past a few dozen listings).
 */
export async function listListingLines(moveId: string, options: { status?: "open" | "excluded" | "all"; offset?: number; limit?: number } = {}) {
  const m = await getMove(moveId);
  const status = options.status ?? "all";
  const rows = m.listings.filter((l) => status === "all" || (status === "open" ? l.open : l.status === "EXCLUDED"));
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const page = rows.slice(offset, offset + limit);
  return {
    move: { id: m.id, title: m.title, arrivalDate: m.arrivalDate, departureDate: m.departureDate, housingTarget: m.budgetPlan.housingTarget ?? null },
    count: rows.length,
    offset,
    nextOffset: offset + page.length < rows.length ? offset + page.length : null,
    listings: page.map(
      (l): ListingLine => ({
        id: l.id,
        url: l.url,
        title: l.title,
        status: l.status,
        total: l.total,
        commuteKm: l.commuteKm !== null ? Math.round(l.commuteKm * 10) / 10 : null,
        walkMin: l.walkMin,
        savings: l.budget?.savings ?? null,
        availableFrom: l.availableFrom,
        minLeaseMonths: l.minLeaseMonths,
        furnished: l.furnished,
        pick: l.pick,
        issues: l.issues.map((i) => i.label),
      }),
    ),
  };
}

async function locateWork(values:{ workAddress?: string | null; workLat?: number | null; workLng?: number | null; city?: string | null; country?: string | null }) {
  if (!values.workAddress || (values.workLat !== null && values.workLat !== undefined)) return {};
  const hit = await geocode(values.workAddress, values.city, values.country);
  return hit ? { workLat: hit.lat, workLng: hit.lng } : {};
}

export async function createMove(raw: MoveInput, ctx: Ctx) {
  const input = moveInputSchema.parse(raw);
  const settings = await getSettings();
  const budget = normalizeBudget(input.budget ?? {}, input.budget?.income ?? 0);
  const [row] = await db
    .insert(moves)
    .values({
      ...input,
      // The destination's currency when the country is known (Suisse → CHF), else the user's.
      currency: input.currency ?? countryInfo(input.country)?.currency ?? settings.general.currency ?? "EUR",
      budget,
      ...(await locateWork(input)),
    })
    .returning();
  await logAudit(db, { entityType: "move", entityId: row.id, action: "CREATE", summary: row.title }, ctx);
  return row;
}

/**
 * Creates the move of an opportunity, pre-filled from it (title, city, country) and from its offer (dates, workplace,
 * net salary, meal vouchers). When the move already exists, only its empty fields are filled from the offer.
 */
export async function createMoveFromOpportunity(opportunityId: string, ctx: Ctx) {
  const [opp] = await db
    .select({ opp: opportunities, org: organizations.name })
    .from(opportunities)
    .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
    .where(eq(opportunities.id, opportunityId));
  if (!opp) throw notFound("Opportunity");
  const offer = parseOffer(opp.opp.details);
  const [existing] = await db.select().from(moves).where(and(eq(moves.opportunityId, opportunityId), isNull(moves.deletedAt)));
  if (existing) {
    const budget = normalizeBudget(existing.budget);
    const patch = moveFromOffer(offer, { ...existing, budget });
    if (!Object.keys(patch).length) return existing;
    return updateMove(existing.id, patch, ctx);
  }
  const place = opp.opp.locationCity ?? opp.opp.locationText ?? null;
  const fromOffer = moveFromOffer(offer);
  return createMove(
    {
      title: [opp.org ?? opp.opp.title, place].filter(Boolean).join(" · "),
      opportunityId,
      city: opp.opp.locationCity,
      country: opp.opp.locationCountry,
      ...fromOffer,
    },
    ctx,
  );
}

/** The installation project linked to an opportunity, if any. */
export async function findMoveForOpportunity(opportunityId: string) {
  const [row] = await db.select({ id: moves.id, title: moves.title }).from(moves).where(and(eq(moves.opportunityId, opportunityId), isNull(moves.deletedAt)));
  return row ?? null;
}

export async function updateMove(id: string, raw: Partial<MoveInput>, ctx: Ctx) {
  const patch = movePatchSchema.parse(raw);
  const [before] = await db.select().from(moves).where(and(eq(moves.id, id), isNull(moves.deletedAt)));
  if (!before) throw notFound("Move");
  const values: Partial<typeof moves.$inferInsert> = { ...patch, budget: undefined };
  if (patch.budget) values.budget = normalizeBudget({ ...normalizeBudget(before.budget), ...patch.budget });
  const workChanged = patch.workAddress !== undefined && patch.workAddress !== before.workAddress;
  const workMissing = before.workLat === null && !!(patch.workAddress ?? before.workAddress);
  if ((workChanged || workMissing) && patch.workLat === undefined) {
    values.workLat = null;
    values.workLng = null;
    Object.assign(values, await locateWork({ ...before, ...patch, workLat: null }));
  }
  const [row] = await db.update(moves).set(values).where(eq(moves.id, id)).returning();
  await logAudit(db, { entityType: "move", entityId: id, action: "UPDATE", summary: row.title }, ctx);
  return row;
}

export async function updateBudget(id: string, plan: Partial<BudgetPlan>, ctx: Ctx) {
  return updateMove(id, { budget: plan }, ctx);
}

const MAX_PLACES = 20;

/**
 * Adds a place to the move (club, station, school…). Located with OpenStreetMap unless coordinates are given; an
 * address that cannot be found is refused (a place without coordinates would not show anywhere).
 */
export async function addPlace(moveId: string, raw: PlaceInput, ctx: Ctx): Promise<MovePlace> {
  const input = placeInputSchema.parse(raw);
  const [move] = await db.select().from(moves).where(and(eq(moves.id, moveId), isNull(moves.deletedAt)));
  if (!move) throw notFound("Move");
  const places = move.places ?? [];
  if (places.length >= MAX_PLACES) throw badRequest(`${MAX_PLACES} lieux au maximum`);
  const hit = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : await geocode(input.address, move.city, move.country);
  if (!hit) throw badRequest("Adresse introuvable sur OpenStreetMap : précise la rue, le numéro et le code postal.");
  const place: MovePlace = { id: crypto.randomUUID(), label: input.label, address: input.address, lat: hit.lat, lng: hit.lng };
  await db.update(moves).set({ places: [...places, place] }).where(eq(moves.id, moveId));
  await logAudit(db, { entityType: "move", entityId: moveId, action: "UPDATE", summary: `Lieu ajouté : ${place.label}` }, ctx);
  return place;
}

export async function removePlace(moveId: string, placeId: string, ctx: Ctx) {
  const [move] = await db.select().from(moves).where(and(eq(moves.id, moveId), isNull(moves.deletedAt)));
  if (!move) throw notFound("Move");
  const place = (move.places ?? []).find((p) => p.id === placeId);
  if (!place) throw notFound("Place");
  await db.update(moves).set({ places: move.places.filter((p) => p.id !== placeId) }).where(eq(moves.id, moveId));
  await logAudit(db, { entityType: "move", entityId: moveId, action: "UPDATE", summary: `Lieu retiré : ${place.label}` }, ctx);
  return { removed: true };
}

export async function archiveMove(id: string, archived: boolean, ctx: Ctx) {
  const [row] = await db.update(moves).set({ archivedAt: archived ? new Date() : null }).where(eq(moves.id, id)).returning();
  if (!row) throw notFound("Move");
  await logAudit(db, { entityType: "move", entityId: id, action: archived ? "ARCHIVE" : "UNARCHIVE", summary: row.title }, ctx);
  return row;
}

export async function deleteMove(id: string, ctx: Ctx) {
  const [row] = await db.update(moves).set({ deletedAt: new Date() }).where(eq(moves.id, id)).returning();
  if (!row) throw notFound("Move");
  await logAudit(db, { entityType: "move", entityId: id, action: "DELETE", summary: row.title }, ctx);
  return row;
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

function historyEntry(text: string, ctx: Ctx): ListingHistoryEntry {
  return { at: new Date().toISOString(), actor: ctx.actor, text };
}

function canonicalUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(p)) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

async function locateListing(values: { address?: string | null; lat?: number | null; district?: string | null }, move: Move) {
  if (!values.address || (values.lat !== null && values.lat !== undefined)) return {};
  const hit = await geocode(values.address, move.city, move.country);
  return hit ? { lat: hit.lat, lng: hit.lng } : {};
}

export async function getListing(id: string) {
  const [row] = await db.select().from(housingListings).where(and(eq(housingListings.id, id), isNull(housingListings.deletedAt)));
  if (!row) throw notFound("Listing");
  return row;
}

const FIELD_LABEL: Partial<Record<keyof ListingPatch, string>> = {
  title: "titre",
  type: "type",
  address: "adresse",
  district: "quartier",
  rent: "loyer",
  charges: "charges",
  chargesInclude: "ce que couvrent les charges",
  allInclusive: "tout compris",
  deposit: "garantie",
  depositText: "garantie",
  fees: "frais",
  availableFrom: "disponibilité",
  availableText: "disponibilité",
  minLeaseMonths: "bail minimum",
  leaseText: "bail",
  furnished: "meublé",
  roomSizeM2: "surface",
  privateBathroom: "salle de bain",
  housemates: "colocataires",
  housemateProfile: "colocataires",
  contacts: "contacts",
  photos: "photos",
  sources: "sources",
  notes: "notes",
  status: "statut",
  excludedReason: "raison",
  pick: "mon top",
  rating: "note",
  familyApproved: "avis de la famille",
  visitDate: "visite",
  visitTime: "visite",
  lat: "position",
  lng: "position",
  distanceKm: "distance",
};

const empty = (v: unknown) => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What a new reading of a listing changes on the one already tracked under the same URL. The facts from the listing
 * (rent, charges, dates, address…) are refreshed; what belongs to the user is kept: the title they know it by, its
 * status once reviewed, « Mon top », rating, family opinion and visits (filled only when still empty). Notes are
 * appended, contacts / provenance merged, sources and photos added. `overwrite` restores a plain replacement.
 */
export function mergeListingUpdate(before: HousingListing, input: ListingPatch, options: { overwrite?: boolean; today?: string } = {}) {
  const given = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as ListingPatch;
  if (options.overwrite) {
    const updated = Object.keys(given).filter((k) => !same(given[k as keyof ListingPatch], before[k as keyof HousingListing]));
    return { patch: given, updated, kept: [] as string[] };
  }
  // A new reading that does not know a value (null) never erases the one already known.
  const patch = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== null)) as ListingPatch;
  const kept: string[] = [];
  const keep = (key: keyof ListingPatch) => {
    if (patch[key] !== undefined && !same(patch[key], before[key as keyof HousingListing])) kept.push(key);
    delete patch[key];
  };

  if (patch.title !== undefined) keep("title");
  if (patch.status !== undefined && before.status !== "NEW") {
    keep("status");
    if (patch.excludedReason !== undefined) keep("excludedReason");
  }
  for (const key of ["pick", "rating", "familyApproved", "visitDate", "visitTime"] as const) {
    if (patch[key] !== undefined && !empty(before[key])) keep(key);
  }
  if (patch.notes !== undefined) {
    const next = patch.notes?.trim() ?? "";
    const prev = before.notes?.trim() ?? "";
    if (!next || prev.includes(next)) delete patch.notes;
    else if (prev && !next.includes(prev)) patch.notes = `${prev}\n\nMise à jour du ${options.today ?? new Date().toISOString().slice(0, 10)} : ${next}`.slice(0, 10_000);
  }
  if (patch.contacts) patch.contacts = { ...before.contacts, ...Object.fromEntries(Object.entries(patch.contacts).filter(([, v]) => !empty(v))) };
  if (patch.provenance) patch.provenance = { ...(before.provenance ?? {}), ...patch.provenance };
  if (patch.sources) {
    const urls = new Set(before.sources.map((s) => s.url));
    patch.sources = [...before.sources, ...patch.sources.filter((s) => !urls.has(s.url))].slice(0, 10);
  }
  if (patch.photos) patch.photos = [...new Set([...before.photos, ...patch.photos])].slice(0, 20);

  const updated = Object.keys(patch).filter((k) => k !== "provenance" && !same(patch[k as keyof ListingPatch], before[k as keyof HousingListing]));
  for (const k of Object.keys(patch) as (keyof ListingPatch)[]) {
    if (k !== "provenance" && same(patch[k], before[k as keyof HousingListing])) delete patch[k];
  }
  return { patch, updated, kept };
}

/** The listing fields of an input, without the move it belongs to. */
export const withoutMove = (input: Partial<ListingInput>): ListingPatch => Object.fromEntries(Object.entries(input).filter(([k]) => k !== "moveId"));

const fieldList = (keys: string[]) => [...new Set(keys.map((k) => FIELD_LABEL[k as keyof ListingPatch] ?? k))].join(", ");

/**
 * Creates a listing, or completes the existing one when the same URL is already tracked in this move (dedup, see
 * mergeListingUpdate; `overwrite: true` replaces instead). Returns { listing, created, updated, kept }: the fields
 * changed and the user's fields left as they were.
 */
export async function upsertListing(raw: ListingInput, ctx: Ctx, options: { overwrite?: boolean } = {}) {
  const input = listingInputSchema.parse(raw);
  const [move] = await db.select().from(moves).where(and(eq(moves.id, input.moveId), isNull(moves.deletedAt)));
  if (!move) throw notFound("Move");
  const url = canonicalUrl(input.url);
  if (url) {
    const [dup] = await db
      .select()
      .from(housingListings)
      .where(and(eq(housingListings.moveId, input.moveId), eq(housingListings.url, url), isNull(housingListings.deletedAt)));
    if (dup) return completeListing(dup, { ...withoutMove(input), url }, ctx, options);
  }
  const sources = input.sources?.length ? input.sources : url ? [{ name: new URL(url).hostname.replace(/^www\./, ""), url }] : [];
  const [row] = await db
    .insert(housingListings)
    .values({
      ...input,
      url,
      sources,
      status: input.status ?? "NEW",
      history: [historyEntry(ctx.actor === "USER" ? "Ajouté" : `Ajouté par ${ctx.actor === "CLAUDE" ? "Claude" : ctx.actor.toLowerCase()}`, ctx)],
      ...(await locateListing(input, move)),
    })
    .returning();
  await logAudit(db, { entityType: "listing", entityId: row.id, action: "CREATE", summary: row.title }, ctx);
  return { listing: row, created: true, updated: [] as string[], kept: [] as string[] };
}

/** A listing already tracked, read again (same URL, or targeted by id by the assistant): see mergeListingUpdate. */
export async function completeListing(before: HousingListing, input: ListingPatch, ctx: Ctx, options: { overwrite?: boolean } = {}) {
  const { patch, updated, kept } = mergeListingUpdate(before, input, { overwrite: options.overwrite, today: await todayISOForUser() });
  if (!updated.length) return { listing: before, created: false, updated, kept };
  const who = ctx.actor === "USER" ? "" : ` par ${ctx.actor === "CLAUDE" ? "Claude" : ctx.actor.toLowerCase()}`;
  const listing = await updateListing(before.id, patch, ctx, `Mis à jour${who} : ${fieldList(updated)}`);
  return { listing, created: false, updated, kept };
}

export async function updateListing(id: string, raw: ListingPatch, ctx: Ctx, note?: string) {
  const patch = listingPatchSchema.parse(raw);
  const before = await getListing(id);
  const values: Partial<typeof housingListings.$inferInsert> = { ...patch };
  if (patch.url !== undefined) values.url = canonicalUrl(patch.url);
  const history = [...before.history];
  if (note) history.push(historyEntry(note, ctx));
  if (patch.status && patch.status !== before.status) {
    history.push(historyEntry(`${LISTING_STATUS_META[before.status].label} → ${LISTING_STATUS_META[patch.status].label}${patch.excludedReason ? ` (${patch.excludedReason})` : ""}`, ctx));
    if (patch.status === "CONTACTED" && !before.contactedAt) values.contactedAt = new Date().toISOString().slice(0, 10);
  }
  if (patch.visitDate && patch.visitDate !== before.visitDate) {
    history.push(historyEntry(`Visite prévue le ${patch.visitDate}${patch.visitTime ? ` ${patch.visitTime}` : ""}`, ctx));
    if (!patch.status && ["NEW", "SHORTLISTED", "CONTACTED", "REPLIED"].includes(before.status)) values.status = "VISIT_PLANNED";
  }
  values.history = history.slice(-100);
  const addressChanged = patch.address !== undefined && patch.address !== before.address;
  const addressMissing = patch.address !== undefined && !!patch.address && before.lat === null;
  if ((addressChanged || addressMissing) && patch.lat === undefined) {
    const [move] = await db.select().from(moves).where(eq(moves.id, before.moveId));
    values.lat = null;
    values.lng = null;
    Object.assign(values, await locateListing({ ...patch, lat: null }, move));
  }
  const [row] = await db.update(housingListings).set(values).where(eq(housingListings.id, id)).returning();
  await logAudit(db, { entityType: "listing", entityId: id, action: "UPDATE", summary: row.title }, ctx);
  return row;
}

export async function setListingStatus(id: string, status: ListingStatus, ctx: Ctx, reason?: string | null) {
  if (status === "EXCLUDED" && !reason) {
    const l = await getListing(id);
    if (!l.excludedReason) throw badRequest("Indique pourquoi tu écartes cette annonce (utile pour comparer plus tard).");
  }
  return updateListing(id, { status, ...(reason ? { excludedReason: reason } : {}) }, ctx);
}

export async function addListingNote(id: string, text: string, ctx: Ctx) {
  const before = await getListing(id);
  const [row] = await db
    .update(housingListings)
    .set({ history: [...before.history, historyEntry(text.slice(0, 2000), ctx)].slice(-100) })
    .where(eq(housingListings.id, id))
    .returning();
  return row;
}

export async function deleteListing(id: string, ctx: Ctx) {
  const [row] = await db.update(housingListings).set({ deletedAt: new Date() }).where(eq(housingListings.id, id)).returning();
  if (!row) throw notFound("Listing");
  await logAudit(db, { entityType: "listing", entityId: id, action: "DELETE", summary: row.title }, ctx);
  return row;
}

/** First-contact message, asking only for what the listing does not already say. */
export async function draftListingMessage(id: string, language: "fr" | "en" = "fr") {
  const l = await getListing(id);
  const [move] = await db.select().from(moves).where(eq(moves.id, l.moveId));
  const settings = await getSettings();
  const firstName = (settings.general.userName || settings.profile.fullName || "").split(/\s+/)[0] || null;
  let reason: string | null = null;
  if (move?.opportunityId) {
    const [opp] = await db.select({ type: opportunities.type }).from(opportunities).where(eq(opportunities.id, move.opportunityId));
    if (opp) reason = language === "fr" ? (opp.type === "INTERNSHIP" ? "un stage" : "un nouveau poste") : opp.type === "INTERNSHIP" ? "an internship" : "a new job";
  }
  return draftFirstMessage(
    { ...l, chargesInclude: l.chargesInclude ?? [] },
    { language, firstName, city: move?.city ?? null, arrivalDate: move?.arrivalDate ?? null, departureDate: move?.departureDate ?? null, reason },
  );
}

// ---------------------------------------------------------------------------
// Export (CSV opened by Excel: « ; » separator + BOM, French-friendly)
// ---------------------------------------------------------------------------

export async function exportListingsCsv(moveId: string) {
  const move = await getMove(moveId);
  const cols: [string, (l: ListingView) => unknown][] = [
    ["Statut", (l) => LISTING_STATUS_META[l.status].label],
    ["Mon top", (l) => (l.pick === "YES" ? "Oui" : l.pick === "NO" ? "Non" : l.pick === "MAYBE" ? "Peut-être" : "")],
    ["Logement", (l) => l.title],
    ["Adresse", (l) => [l.address, l.district].filter(Boolean).join(", ")],
    ["Total / mois", (l) => l.total ?? ""],
    ["Loyer", (l) => l.rent ?? ""],
    ["Charges", (l) => l.charges ?? ""],
    ["Charges couvrent", (l) => (l.chargesInclude ?? []).join(", ")],
    ["Garantie", (l) => l.deposit ?? l.depositText ?? ""],
    ["Disponible", (l) => l.availableFrom ?? l.availableText ?? ""],
    ["Bail minimum (mois)", (l) => l.minLeaseMonths ?? l.leaseText ?? ""],
    ["Meublé", (l) => ({ YES: "Oui", SEMI: "Semi", NO: "Non", UNKNOWN: "?" })[l.furnished]],
    ["Distance (km)", (l) => l.commuteKm ?? ""],
    ["À pied (min)", (l) => l.walkMin ?? ""],
    ["Épargne / mois", (l) => l.budget?.savings ?? ""],
    ["Points bloquants", (l) => l.issues.map((i) => i.label).join(" · ")],
    ["Site / app", (l) => l.contacts?.app ?? ""],
    ["Email", (l) => l.contacts?.email ?? ""],
    ["Téléphone / WhatsApp", (l) => [l.contacts?.phone, l.contacts?.whatsapp].filter(Boolean).join(" / ")],
    ["Lien", (l) => l.url ?? ""],
    ["Notes", (l) => l.notes ?? ""],
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(([h]) => h).join(";"), ...move.listings.map((l) => cols.map(([, f]) => esc(f(l))).join(";"))];
  return { fileName: `${move.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "logements"} - logements.csv`, content: "﻿" + lines.join("\r\n") };
}
