/**
 * Read-only share links of a move's housing shortlist (spec v2 § 4.3, P6), e.g. for the family. The link carries a
 * random 32-character token; it can expire and be revoked. The shared view keeps what helps to decide (cost,
 * availability, lease, commute, fit) and leaves out contacts, notes, history and the income.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { moves, shareLinks, type ShareLink } from "@/server/db/schema";
import { badRequest, notFound, type Ctx } from "@/server/context";
import { fitLevel, LISTING_STATUS_META, type FitIssue, type FitLevel, type HousingType, type Furnished, type ListingStatus } from "@/lib/relocation";
import { logAudit } from "./audit";
import { getMove } from "./moves";

export const shareInputSchema = z.object({
  label: z.string().trim().max(80).nullish(),
  showSavings: z.boolean().default(false),
  /** Days before the link stops working; null = until revoked. */
  expiresInDays: z.number().int().min(1).max(365).nullish(),
});
export type ShareInput = z.input<typeof shareInputSchema>;

const MAX_ACTIVE = 10;

function isActive(l: Pick<ShareLink, "revokedAt" | "expiresAt">, now = new Date()) {
  return !l.revokedAt && (!l.expiresAt || l.expiresAt > now);
}

export async function listShares(moveId: string) {
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.moveId, moveId)).orderBy(desc(shareLinks.createdAt));
  return rows.map((r) => ({ ...r, active: isActive(r) }));
}

export async function createShare(moveId: string, raw: ShareInput, ctx: Ctx) {
  const input = shareInputSchema.parse(raw);
  const [move] = await db
    .select({ id: moves.id, title: moves.title })
    .from(moves)
    .where(and(eq(moves.id, moveId), isNull(moves.deletedAt)));
  if (!move) throw notFound("Move");
  const active = (await listShares(moveId)).filter((s) => s.active);
  if (active.length >= MAX_ACTIVE) throw badRequest(`${MAX_ACTIVE} liens actifs au maximum : révoque un ancien lien.`);
  const [row] = await db
    .insert(shareLinks)
    .values({
      moveId,
      token: randomBytes(24).toString("base64url"),
      label: input.label?.trim() || null,
      showSavings: input.showSavings,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    })
    .returning();
  await logAudit(
    db,
    {
      entityType: "move",
      entityId: moveId,
      action: "UPDATE",
      summary: `Lien de partage créé${row.label ? ` (${row.label})` : ""}`,
    },
    ctx,
  );
  return row;
}

export async function revokeShare(id: string, ctx: Ctx) {
  const [row] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, id), isNull(shareLinks.revokedAt)))
    .returning();
  if (!row) throw notFound("Share link");
  await logAudit(
    db,
    {
      entityType: "move",
      entityId: row.moveId,
      action: "UPDATE",
      summary: `Lien de partage révoqué${row.label ? ` (${row.label})` : ""}`,
    },
    ctx,
  );
  return row;
}

export interface SharedListing {
  id: string;
  title: string;
  url: string | null;
  type: HousingType | null;
  district: string | null;
  total: number | null;
  rent: number | null;
  charges: number | null;
  allInclusive: boolean;
  chargesInclude: string[];
  deposit: number | null;
  depositText: string | null;
  availableFrom: string | null;
  availableText: string | null;
  minLeaseMonths: number | null;
  furnished: Furnished;
  roomSizeM2: number | null;
  privateBathroom: boolean | null;
  housemates: number | null;
  walkMin: number | null;
  commuteKm: number | null;
  status: ListingStatus;
  statusLabel: string;
  pick: string | null;
  familyApproved: boolean;
  fit: FitLevel;
  issues: FitIssue[];
  savings: number | null;
}

export interface SharedMove {
  title: string;
  city: string | null;
  country: string | null;
  currency: string;
  arrivalDate: string | null;
  departureDate: string | null;
  showSavings: boolean;
  listings: SharedListing[];
  updatedAt: string;
}

/**
 * The shortlist behind a token, or null (unknown, revoked or expired link, deleted move). Open listings only,
 * sorted like the app (chosen, starred, fit, savings). Counts the view.
 */
export async function getSharedMove(token: string): Promise<SharedMove | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
  if (!link || !isActive(link)) return null;
  let move;
  try {
    move = await getMove(link.moveId);
  } catch {
    return null;
  }
  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(shareLinks.id, link.id));
  const order: Record<FitLevel, number> = { ok: 0, unknown: 1, warn: 2, ko: 3 };
  const listings = move.listings
    .filter((l) => l.open)
    .sort(
      (a, b) =>
        Number(b.status === "CHOSEN") - Number(a.status === "CHOSEN") ||
        Number(b.pick === "YES") - Number(a.pick === "YES") ||
        order[a.fit] - order[b.fit] ||
        (b.budget?.savings ?? -1e9) - (a.budget?.savings ?? -1e9),
    )
    .map<SharedListing>((l) => {
      // Budget issues reveal the housing budget: shown only with the savings.
      const issues = link.showSavings ? l.issues : l.issues.filter((i) => i.key !== "budget" || i.level === "unknown");
      return {
        id: l.id,
        title: l.title,
        url: l.url,
        type: l.type,
        district: l.district,
        total: l.total,
        rent: l.rent,
        charges: l.charges,
        allInclusive: l.allInclusive,
        chargesInclude: l.chargesInclude ?? [],
        deposit: l.deposit,
        depositText: l.depositText,
        availableFrom: l.availableFrom,
        availableText: l.availableText,
        minLeaseMonths: l.minLeaseMonths,
        furnished: l.furnished,
        roomSizeM2: l.roomSizeM2,
        privateBathroom: l.privateBathroom,
        housemates: l.housemates,
        walkMin: l.walkMin,
        commuteKm: l.commuteKm,
        status: l.status,
        statusLabel: LISTING_STATUS_META[l.status].label,
        pick: l.pick,
        familyApproved: l.familyApproved,
        fit: fitLevel(issues),
        issues,
        savings: link.showSavings ? (l.budget?.savings ?? null) : null,
      };
    });
  return {
    title: move.title,
    city: move.city,
    country: move.country,
    currency: move.currency,
    arrivalDate: move.arrivalDate,
    departureDate: move.departureDate,
    showSavings: link.showSavings,
    listings,
    updatedAt: new Date().toISOString(),
  };
}
