/**
 * Relocation (« Move ») — pure, client-safe logic: housing listing statuses, budget plan, commute and fit.
 * Everything here is deterministic and unit-tested (tests/relocation.test.ts). No AI, no I/O.
 */
import { z } from "zod";
import { isISODate } from "./dates";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MOVE_STATUSES = ["PLANNING", "SEARCHING", "READY", "MOVED", "DONE"] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];
export const MOVE_STATUS_LABEL: Record<MoveStatus, string> = {
  PLANNING: "En préparation",
  SEARCHING: "Recherche de logement",
  READY: "Prêt à partir",
  MOVED: "Installé",
  DONE: "Terminé",
};

/** Housing pipeline. Order matters (board columns, sort). */
export const LISTING_STATUSES = ["NEW", "SHORTLISTED", "CONTACTED", "REPLIED", "VISIT_PLANNED", "VISITED", "APPLIED", "CHOSEN", "DECLINED", "GONE", "EXCLUDED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_META: Record<ListingStatus, { label: string; tone: "neutral" | "info" | "highlight" | "warning" | "success" | "muted"; open: boolean }> = {
  NEW: { label: "Nouveau", tone: "neutral", open: true },
  SHORTLISTED: { label: "À contacter", tone: "info", open: true },
  CONTACTED: { label: "Contacté", tone: "highlight", open: true },
  REPLIED: { label: "Réponse reçue", tone: "highlight", open: true },
  VISIT_PLANNED: { label: "Visite prévue", tone: "warning", open: true },
  VISITED: { label: "Visité", tone: "warning", open: true },
  APPLIED: { label: "Dossier envoyé", tone: "warning", open: true },
  CHOSEN: { label: "Choisi", tone: "success", open: true },
  DECLINED: { label: "Refusé", tone: "muted", open: false },
  GONE: { label: "Plus disponible", tone: "muted", open: false },
  EXCLUDED: { label: "Écarté", tone: "muted", open: false },
};
/** Columns shown on the housing board (closed statuses are grouped in a single « Closed » column). */
export const BOARD_STATUSES: ListingStatus[] = ["NEW", "SHORTLISTED", "CONTACTED", "REPLIED", "VISIT_PLANNED", "VISITED", "APPLIED", "CHOSEN"];

export const HOUSING_TYPES = ["ROOM_COLIVING", "ROOM_FLATSHARE", "STUDIO", "APARTMENT", "OTHER"] as const;
export type HousingType = (typeof HOUSING_TYPES)[number];
export const HOUSING_TYPE_LABEL: Record<HousingType, string> = {
  ROOM_COLIVING: "Chambre en coliving",
  ROOM_FLATSHARE: "Chambre en colocation",
  STUDIO: "Studio",
  APARTMENT: "Appartement",
  OTHER: "Autre",
};

export const FURNISHED = ["YES", "SEMI", "NO", "UNKNOWN"] as const;
export type Furnished = (typeof FURNISHED)[number];

export const PICKS = ["YES", "MAYBE", "NO"] as const;
export type ListingPick = (typeof PICKS)[number];

// ---------------------------------------------------------------------------
// Schemas (shared by services, actions, REST and MCP)
// ---------------------------------------------------------------------------

const money = z.number().int().min(0).max(1_000_000);
const optText = (max = 2000) => z.string().trim().max(max).nullish();
const isoDate = z.string().refine(isISODate, "Expected YYYY-MM-DD");

export const listingContactsSchema = z
  .object({
    app: optText(500).describe("Website / app / booking page URL or name (preferred contact channel)"),
    email: optText(320),
    phone: optText(80),
    whatsapp: optText(80),
    manager: optText(200).describe("Agency / company / owner name"),
  })
  .partial();
export type ListingContacts = z.infer<typeof listingContactsSchema>;

export const listingSourceSchema = z.object({ name: z.string().trim().min(1).max(120), url: z.string().trim().url().max(2000) });
export type ListingSource = z.infer<typeof listingSourceSchema>;

export const listingFeeSchema = z.object({ label: z.string().trim().min(1).max(200), amount: money });

export const listingInputSchema = z.object({
  moveId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(2000).nullish(),
  sources: z.array(listingSourceSchema).max(10).optional(),
  type: z.enum(HOUSING_TYPES).nullish(),
  address: optText(500),
  district: optText(200),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  distanceKm: z.number().min(0).max(500).nullish().describe("Straight-line distance to the workplace, if lat/lng are unknown"),
  distanceEstimated: z.boolean().optional(),
  rent: money.nullish().describe("Monthly rent, whole currency units, WITHOUT charges"),
  charges: money.nullish().describe("Monthly charges, whole currency units (0 if all-inclusive)"),
  chargesInclude: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  allInclusive: z.boolean().optional(),
  deposit: money.nullish(),
  depositText: optText(300),
  fees: z.array(listingFeeSchema).max(10).optional(),
  availableFrom: isoDate.nullish(),
  availableText: optText(200),
  minLeaseMonths: z.number().int().min(0).max(60).nullish(),
  leaseText: optText(300),
  furnished: z.enum(FURNISHED).optional(),
  roomSizeM2: z.number().int().min(1).max(1000).nullish(),
  privateBathroom: z.boolean().nullish(),
  housemates: z.number().int().min(0).max(100).nullish().describe("People living in the home (including you)"),
  housemateProfile: optText(500),
  contacts: listingContactsSchema.optional(),
  photos: z.array(z.string().trim().url().max(2000)).max(20).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  excludedReason: optText(500),
  pick: z.enum(PICKS).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  familyApproved: z.boolean().optional(),
  visitDate: isoDate.nullish(),
  visitTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  notes: optText(10_000),
  provenance: z.record(z.string(), z.unknown()).optional(),
});
export type ListingInput = z.input<typeof listingInputSchema>;
export const listingPatchSchema = listingInputSchema.omit({ moveId: true }).partial();
export type ListingPatch = z.input<typeof listingPatchSchema>;

export const budgetLineSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  amount: money,
  /** Paid with restricted money (e.g. meal vouchers) — reduces this line before it hits the free income. */
  kind: z.enum(["EXPENSE", "TRANSPORT"]).default("EXPENSE"),
  note: optText(300),
});
export type BudgetLine = z.infer<typeof budgetLineSchema>;

export const budgetPlanSchema = z.object({
  income: money.describe("Net monthly income you are sure to receive"),
  incomeNote: optText(300),
  /** Food-only allowance (meal vouchers) — offsets the food line, never counted as free income. */
  foodAllowance: money.default(0),
  food: money.default(0),
  lines: z.array(budgetLineSchema).max(40).default([]),
  /** Transport subscription, only counted when the housing is farther than walkThresholdKm. */
  transitMonthly: money.default(0),
  walkThresholdKm: z.number().min(0).max(50).default(2),
  housingTarget: money.nullish(),
  savingsTarget: money.nullish(),
  oneOff: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(120), amount: money })).max(30).default([]),
});
export type BudgetPlan = z.infer<typeof budgetPlanSchema>;

export const moveInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  opportunityId: z.string().uuid().nullish(),
  city: optText(120),
  country: optText(120),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  arrivalDate: isoDate.nullish(),
  departureDate: isoDate.nullish(),
  workAddress: optText(500),
  workLat: z.number().min(-90).max(90).nullish(),
  workLng: z.number().min(-180).max(180).nullish(),
  status: z.enum(MOVE_STATUSES).optional(),
  notes: optText(10_000),
  budget: budgetPlanSchema.partial().optional(),
});
export type MoveInput = z.input<typeof moveInputSchema>;
export const movePatchSchema = moveInputSchema.partial();

// ---------------------------------------------------------------------------
// Default budget (sensible starting point, every number editable)
// ---------------------------------------------------------------------------

export function defaultBudget(income = 0): BudgetPlan {
  return {
    income,
    incomeNote: null,
    foodAllowance: 0,
    food: 350,
    lines: [
      { id: "phone", label: "Téléphone", amount: 15, kind: "EXPENSE", note: null },
      { id: "sport", label: "Sport", amount: 40, kind: "EXPENSE", note: null },
      { id: "leisure", label: "Loisirs et imprévus", amount: 150, kind: "EXPENSE", note: null },
    ],
    transitMonthly: 50,
    walkThresholdKm: 2,
    housingTarget: null,
    savingsTarget: null,
    oneOff: [],
  };
}

export function normalizeBudget(raw: unknown, income = 0): BudgetPlan {
  const parsed = budgetPlanSchema.safeParse({ ...defaultBudget(income), ...(raw && typeof raw === "object" ? raw : {}) });
  return parsed.success ? parsed.data : defaultBudget(income);
}

// ---------------------------------------------------------------------------
// Geo / commute
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Walking time estimate: straight line × 1.3 (street detours) at 5 km/h, rounded to 5 min. */
export function walkMinutes(km: number): number {
  return Math.max(5, Math.round((km * 1.3 * 12) / 5) * 5);
}

// ---------------------------------------------------------------------------
// Listing maths
// ---------------------------------------------------------------------------

export interface ListingCostView {
  rent: number | null;
  charges: number | null;
  allInclusive: boolean;
}

/** Total monthly housing cost, or null when the rent is unknown. Unknown charges count as 0 only when all-inclusive. */
export function listingTotal(l: ListingCostView): number | null {
  if (l.rent === null || l.rent === undefined) return null;
  return l.rent + (l.charges ?? 0);
}

export interface BudgetResult {
  income: number;
  housing: number;
  foodOutOfPocket: number;
  transport: number;
  otherLines: number;
  expenses: number;
  savings: number;
  savingsVsTarget: number | null;
  housingVsTarget: number | null;
  walkable: boolean | null;
}

/**
 * Monthly balance for one housing option. `distance` is the commute distance in km (null = unknown → transport
 * counted, conservative).
 */
export function computeBudget(plan: BudgetPlan, housing: number, distance: number | null): BudgetResult {
  const foodOutOfPocket = Math.max(0, plan.food - plan.foodAllowance);
  const walkable = distance === null ? null : distance <= plan.walkThresholdKm;
  const transport = walkable ? 0 : plan.transitMonthly;
  const otherLines = plan.lines.reduce((sum, l) => sum + (l.kind === "TRANSPORT" && walkable ? 0 : l.amount), 0);
  const expenses = housing + foodOutOfPocket + transport + otherLines;
  const savings = plan.income - expenses;
  return {
    income: plan.income,
    housing,
    foodOutOfPocket,
    transport,
    otherLines,
    expenses,
    savings,
    savingsVsTarget: plan.savingsTarget ? savings - plan.savingsTarget : null,
    housingVsTarget: plan.housingTarget ? housing - plan.housingTarget : null,
    walkable,
  };
}

export function oneOffTotal(plan: BudgetPlan, extra = 0): number {
  return plan.oneOff.reduce((s, o) => s + o.amount, 0) + extra;
}

// ---------------------------------------------------------------------------
// Fit: deterministic checks against the move (dates, lease, furnished, budget)
// ---------------------------------------------------------------------------

export type FitLevel = "ok" | "warn" | "ko" | "unknown";
export interface FitIssue {
  key: "availability" | "lease" | "furnished" | "budget" | "distance" | "price";
  level: Exclude<FitLevel, "ok">;
  label: string;
}

export interface FitContext {
  arrivalDate: string | null;
  departureDate: string | null;
  housingTarget: number | null;
  walkThresholdKm: number;
  /** Median total of the move's listings, to flag suspiciously cheap ones. */
  medianTotal?: number | null;
}

export interface FitListing extends ListingCostView {
  availableFrom: string | null;
  minLeaseMonths: number | null;
  furnished: Furnished;
  distanceKm: number | null;
}

/** Whole months between two ISO dates, rounding up partial months (4 Jan → 2 Jul = 6). */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 > d1) months += 1;
  return Math.max(0, months);
}

export function listingFit(l: FitListing, ctx: FitContext): FitIssue[] {
  const issues: FitIssue[] = [];
  if (l.availableFrom && ctx.arrivalDate && l.availableFrom > ctx.arrivalDate) {
    issues.push({ key: "availability", level: "ko", label: `Disponible le ${l.availableFrom}, après ton arrivée` });
  }
  if (l.minLeaseMonths && ctx.arrivalDate && ctx.departureDate) {
    const stay = monthsBetween(ctx.arrivalDate, ctx.departureDate);
    if (l.minLeaseMonths > stay) issues.push({ key: "lease", level: "ko", label: `Bail minimum ${l.minLeaseMonths} mois (séjour de ${stay})` });
  } else if (l.minLeaseMonths === null) {
    issues.push({ key: "lease", level: "unknown", label: "Bail minimum inconnu" });
  }
  if (l.furnished === "NO") issues.push({ key: "furnished", level: "ko", label: "Non meublé" });
  else if (l.furnished === "SEMI") issues.push({ key: "furnished", level: "warn", label: "Semi-meublé" });
  else if (l.furnished === "UNKNOWN") issues.push({ key: "furnished", level: "unknown", label: "Meublé ?" });
  const total = listingTotal(l);
  if (total === null) issues.push({ key: "budget", level: "unknown", label: "Prix inconnu" });
  else if (ctx.housingTarget && total > ctx.housingTarget * 1.15) issues.push({ key: "budget", level: "ko", label: `Hors budget (+${total - ctx.housingTarget})` });
  else if (ctx.housingTarget && total > ctx.housingTarget) issues.push({ key: "budget", level: "warn", label: `Un peu au-dessus du budget (+${total - ctx.housingTarget})` });
  if (total !== null && ctx.medianTotal && total < ctx.medianTotal * 0.6) {
    issues.push({ key: "price", level: "warn", label: "Bien moins cher que les autres annonces : vérifie avant de payer quoi que ce soit" });
  }
  if (l.distanceKm !== null && l.distanceKm > ctx.walkThresholdKm * 2.5) issues.push({ key: "distance", level: "warn", label: "Loin du travail" });
  return issues;
}

export function fitLevel(issues: FitIssue[]): FitLevel {
  if (issues.some((i) => i.level === "ko")) return "ko";
  if (issues.some((i) => i.level === "warn")) return "warn";
  if (issues.some((i) => i.level === "unknown")) return "unknown";
  return "ok";
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// First-contact message (deterministic template, asks only for what is missing)
// ---------------------------------------------------------------------------

export interface DraftListing {
  title: string;
  url: string | null;
  rent: number | null;
  charges: number | null;
  allInclusive: boolean;
  chargesInclude: string[];
  deposit: number | null;
  depositText: string | null;
  minLeaseMonths: number | null;
  availableFrom: string | null;
  housemates: number | null;
  furnished: Furnished;
}

export interface DraftContext {
  language: "fr" | "en";
  firstName: string | null;
  city: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  reason: string | null;
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function humanDate(iso: string, lang: "fr" | "en") {
  const [y, m, d] = iso.split("-").map(Number);
  return lang === "fr" ? `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]} ${y}` : `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

export function draftFirstMessage(l: DraftListing, c: DraftContext): { subject: string; body: string; questions: string[] } {
  const fr = c.language === "fr";
  const q: string[] = [];
  const dates = c.arrivalDate && c.departureDate ? (fr ? `du ${humanDate(c.arrivalDate, "fr")} au ${humanDate(c.departureDate, "fr")}` : `from ${humanDate(c.arrivalDate, "en")} to ${humanDate(c.departureDate, "en")}`) : null;
  q.push(fr ? `la disponibilité ${dates ?? "pour mes dates"} et la durée minimale du bail` : `availability ${dates ?? "for my dates"} and the minimum lease length`);
  if (l.rent === null || (!l.allInclusive && l.charges === null) || (!l.allInclusive && !l.chargesInclude.length)) {
    q.push(fr ? "le montant total mensuel et ce que couvrent les charges" : "the total monthly cost and what the charges cover");
  }
  if (l.deposit === null && !l.depositText) q.push(fr ? "le montant de la garantie et d'éventuels frais de dossier" : "the deposit amount and any application fees");
  if (l.housemates === null) q.push(fr ? "le nombre de colocataires et leur profil" : "how many housemates there are and their profile");
  if (l.furnished === "UNKNOWN" || l.furnished === "SEMI") q.push(fr ? "si la chambre est entièrement meublée" : "whether the room is fully furnished");
  const subject = fr ? `Demande d'informations : ${l.title}` : `Enquiry: ${l.title}`;
  const where = c.city ? (fr ? ` à ${c.city}` : ` in ${c.city}`) : "";
  const why = c.reason ? (fr ? `Je commence ${c.reason}${where}` : `I'm starting ${c.reason}${where}`) : fr ? `Je m'installe${where}` : `I'm moving${where}`;
  const lines = fr
    ? [
        "Bonjour,",
        "",
        `Je suis intéressé par votre annonce « ${l.title} »${l.url ? ` (${l.url})` : ""}.`,
        "",
        `${why}${dates ? ` ${dates}` : ""} et je cherche un logement meublé pour cette période.`,
        "",
        "Pourriez-vous me confirmer :",
        ...q.map((x, i) => `- ${x}${i === q.length - 1 ? " ?" : " ;"}`),
        "",
        "Je peux organiser une visite sur place ou en visio, selon ce qui vous arrange.",
        "",
        "Merci d'avance,",
        c.firstName ?? "",
      ]
    : [
        "Hello,",
        "",
        `I'm interested in your listing "${l.title}"${l.url ? ` (${l.url})` : ""}.`,
        "",
        `${why}${dates ? ` ${dates}` : ""} and I'm looking for a furnished place for that period.`,
        "",
        "Could you confirm:",
        ...q.map((x, i) => `- ${x}${i === q.length - 1 ? "?" : ";"}`),
        "",
        "I can visit in person or by video call, whichever suits you.",
        "",
        "Thanks in advance,",
        c.firstName ?? "",
      ];
  return { subject, body: lines.join("\n").trimEnd(), questions: q };
}

/** wa.me link from a phone number in any format (digits only, international). */
export function whatsappLink(phone: string, text?: string): string | null {
  const digits = phone.replace(/^\+/, "").replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** First phone-like value of a contact string (« +32 489 46 49 11 (WhatsApp) » → « +32 489 46 49 11 »). */
export function firstPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/\+?\d[\d\s().-]{6,}\d/);
  return m ? m[0].trim() : null;
}
