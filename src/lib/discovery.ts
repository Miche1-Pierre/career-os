/**
 * Discovery engine (spec v2, P4). Pure and client-safe.
 *
 * Three levels, from the most reliable to the most flexible:
 *  A. connectors: public job APIs (company job boards on Greenhouse / Lever / Ashby, Remotive, Arbeitnow, Adzuna with
 *     its free key) read by deterministic code;
 *  B. the Claude agent (web search + fetch, official public pages only, strict output) for what has no connector;
 *  C. sites behind a login or that forbid automated access (LinkedIn, Indeed, Immoweb…): pre-filled search links that
 *     the user opens themselves, then imports with "Ajoute cette offre" / the browser.
 */
import { z } from "zod";
import { isISODate } from "./dates";
import { normalizeText } from "./text";

export const DISCOVERY_DOMAINS = ["JOBS", "HOUSING"] as const;
export type DiscoveryDomain = (typeof DISCOVERY_DOMAINS)[number];

export const SCHEDULES = ["OFF", "DAILY", "WEEKLY"] as const;
export type Schedule = (typeof SCHEDULES)[number];
export const SCHEDULE_LABEL: Record<Schedule, string> = { OFF: "Manuelle", DAILY: "Tous les jours", WEEKLY: "Chaque semaine" };

export const SOURCE_ACCESS = ["API", "AGENT", "LINK"] as const;
export type SourceAccess = (typeof SOURCE_ACCESS)[number];

export const ATS = ["greenhouse", "lever", "ashby"] as const;
export type Ats = (typeof ATS)[number];

export interface DiscoverySource {
  key: string;
  domain: DiscoveryDomain;
  name: string;
  baseUrl: string;
  access: SourceAccess;
  /** Countries it covers (ISO codes), empty = any. */
  countries: string[];
  note: string;
  /** Environment variables needed by the connector (free developer keys). */
  needsKeys?: string[];
  /** Pre-filled search link for LINK sources ({q} keywords, {l} location). */
  searchUrl?: string;
  /** Domain for a Google "site:" search when there is no reliable search URL. */
  site?: string;
}

/** Registry of sources (versioned with the code). */
export const DISCOVERY_SOURCES: DiscoverySource[] = [
  // Jobs: connectors
  { key: "greenhouse", domain: "JOBS", name: "Greenhouse (pages carrières)", baseUrl: "https://boards.greenhouse.io", access: "API", countries: [], note: "API publique des pages carrières : indique les entreprises et leur identifiant Greenhouse." },
  { key: "lever", domain: "JOBS", name: "Lever (pages carrières)", baseUrl: "https://jobs.lever.co", access: "API", countries: [], note: "API publique des pages carrières Lever, par entreprise." },
  { key: "ashby", domain: "JOBS", name: "Ashby (pages carrières)", baseUrl: "https://jobs.ashbyhq.com", access: "API", countries: [], note: "API publique des pages carrières Ashby, par entreprise." },
  { key: "remotive", domain: "JOBS", name: "Remotive", baseUrl: "https://remotive.com", access: "API", countries: [], note: "Offres en télétravail. API publique, à interroger peu souvent (quelques fois par jour au plus)." },
  { key: "arbeitnow", domain: "JOBS", name: "Arbeitnow", baseUrl: "https://www.arbeitnow.com", access: "API", countries: ["DE", "NL", "AT", "CH", "BE", "FR"], note: "Offres en Europe (surtout Allemagne), API publique." },
  { key: "adzuna", domain: "JOBS", name: "Adzuna", baseUrl: "https://www.adzuna.fr", access: "API", countries: ["FR", "BE", "CA", "US", "GB", "DE", "NL", "CH", "AT", "IT", "ES", "PL", "AU", "SG"], note: "Agrégateur. Clé gratuite sur developer.adzuna.com.", needsKeys: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"] },
  { key: "claude-jobs", domain: "JOBS", name: "Claude (recherche web)", baseUrl: "https://claude.ai", access: "AGENT", countries: [], note: "Cherche sur les pages carrières et sites publics ; signale ce qu'il n'a pas pu lire." },
  // Jobs: links only (login or terms that forbid scraping)
  { key: "linkedin", domain: "JOBS", name: "LinkedIn", baseUrl: "https://www.linkedin.com/jobs", access: "LINK", countries: [], note: "Connexion requise, scraping interdit : ouvre la recherche puis importe les offres.", searchUrl: "https://www.linkedin.com/jobs/search/?keywords={q}&location={l}" },
  { key: "indeed", domain: "JOBS", name: "Indeed", baseUrl: "https://www.indeed.com", access: "LINK", countries: [], note: "Anti-robot, scraping interdit : lien de recherche.", searchUrl: "https://www.indeed.com/jobs?q={q}&l={l}" },
  { key: "wttj", domain: "JOBS", name: "Welcome to the Jungle", baseUrl: "https://www.welcometothejungle.com", access: "LINK", countries: ["FR", "BE", "ES", "CZ", "SK"], note: "Lien de recherche.", searchUrl: "https://www.welcometothejungle.com/fr/jobs?query={q}" },
  { key: "hellowork", domain: "JOBS", name: "HelloWork", baseUrl: "https://www.hellowork.com", access: "LINK", countries: ["FR"], note: "Lien de recherche.", searchUrl: "https://www.hellowork.com/fr-fr/emploi/recherche.html?k={q}&l={l}" },
  { key: "francetravail", domain: "JOBS", name: "France Travail", baseUrl: "https://candidat.francetravail.fr", access: "LINK", countries: ["FR"], note: "Lien de recherche (une API existe, avec compte développeur).", searchUrl: "https://candidat.francetravail.fr/offres/recherche?motsCles={q}" },
  { key: "jobat", domain: "JOBS", name: "Jobat", baseUrl: "https://www.jobat.be", access: "LINK", countries: ["BE"], note: "Offres en Belgique : lien de recherche.", site: "jobat.be" },
  { key: "moovijob", domain: "JOBS", name: "Moovijob", baseUrl: "https://www.moovijob.com", access: "LINK", countries: ["LU"], note: "Offres au Luxembourg : lien de recherche.", site: "moovijob.com" },
  { key: "jobsch", domain: "JOBS", name: "jobs.ch", baseUrl: "https://www.jobs.ch", access: "LINK", countries: ["CH"], note: "Offres en Suisse : lien de recherche.", site: "jobs.ch" },
  { key: "stepstone", domain: "JOBS", name: "StepStone", baseUrl: "https://www.stepstone.de", access: "LINK", countries: ["DE"], note: "Offres en Allemagne : lien de recherche.", site: "stepstone.de" },
  { key: "totaljobs", domain: "JOBS", name: "Totaljobs", baseUrl: "https://www.totaljobs.com", access: "LINK", countries: ["GB"], note: "Offres au Royaume-Uni : lien de recherche.", site: "totaljobs.com" },
  // Housing (Brussels first; the agent covers other cities)
  { key: "claude-housing", domain: "HOUSING", name: "Claude (recherche web)", baseUrl: "https://claude.ai", access: "AGENT", countries: [], note: "Lit les annonces publiques (colivings, agences) et sépare loyer, charges, garantie." },
  { key: "immoweb", domain: "HOUSING", name: "Immoweb", baseUrl: "https://www.immoweb.be", access: "LINK", countries: ["BE"], note: "Anti-robot : ouvre la recherche dans ton navigateur.", site: "immoweb.be" },
  { key: "zimmo", domain: "HOUSING", name: "Zimmo", baseUrl: "https://www.zimmo.be", access: "LINK", countries: ["BE"], note: "Favoris derrière connexion : recherche dans ton navigateur.", site: "zimmo.be" },
  { key: "spotahome", domain: "HOUSING", name: "Spotahome", baseUrl: "https://www.spotahome.com", access: "LINK", countries: [], note: "Location meublée moyenne durée.", site: "spotahome.com" },
  { key: "cohabs", domain: "HOUSING", name: "Cohabs", baseUrl: "https://www.cohabs.com", access: "LINK", countries: ["BE", "FR", "US", "LU", "ES"], note: "Coliving meublé, tout compris.", site: "cohabs.com" },
  { key: "ikoab", domain: "HOUSING", name: "Ikoab", baseUrl: "https://www.ikoab.com", access: "LINK", countries: ["BE"], note: "Coliving à Bruxelles.", site: "ikoab.com" },
  { key: "kijiji", domain: "HOUSING", name: "Kijiji", baseUrl: "https://www.kijiji.ca", access: "LINK", countries: ["CA"], note: "Annonces au Canada.", site: "kijiji.ca" },
  { key: "housinganywhere", domain: "HOUSING", name: "HousingAnywhere", baseUrl: "https://housinganywhere.com", access: "LINK", countries: [], note: "Location meublée moyenne durée (stages, études), surtout en Europe.", site: "housinganywhere.com" },
  { key: "leboncoin", domain: "HOUSING", name: "Leboncoin", baseUrl: "https://www.leboncoin.fr", access: "LINK", countries: ["FR"], note: "Anti-robot : recherche dans ton navigateur.", site: "leboncoin.fr" },
  { key: "lacartedescolocs", domain: "HOUSING", name: "La Carte des Colocs", baseUrl: "https://www.lacartedescolocs.fr", access: "LINK", countries: ["FR"], note: "Colocations en France.", site: "lacartedescolocs.fr" },
  { key: "pap", domain: "HOUSING", name: "PAP", baseUrl: "https://www.pap.fr", access: "LINK", countries: ["FR"], note: "Annonces de particulier à particulier.", site: "pap.fr" },
  { key: "athome", domain: "HOUSING", name: "atHome", baseUrl: "https://www.athome.lu", access: "LINK", countries: ["LU"], note: "Annonces au Luxembourg.", site: "athome.lu" },
  { key: "homegate", domain: "HOUSING", name: "Homegate", baseUrl: "https://www.homegate.ch", access: "LINK", countries: ["CH"], note: "Annonces en Suisse.", site: "homegate.ch" },
  { key: "wgzimmer", domain: "HOUSING", name: "WGZimmer", baseUrl: "https://www.wgzimmer.ch", access: "LINK", countries: ["CH"], note: "Colocations en Suisse.", site: "wgzimmer.ch" },
  { key: "pararius", domain: "HOUSING", name: "Pararius", baseUrl: "https://www.pararius.com", access: "LINK", countries: ["NL"], note: "Locations aux Pays-Bas (en anglais).", site: "pararius.com" },
  { key: "kamernet", domain: "HOUSING", name: "Kamernet", baseUrl: "https://kamernet.nl", access: "LINK", countries: ["NL"], note: "Chambres et studios aux Pays-Bas.", site: "kamernet.nl" },
  { key: "wggesucht", domain: "HOUSING", name: "WG-Gesucht", baseUrl: "https://www.wg-gesucht.de", access: "LINK", countries: ["DE"], note: "Colocations en Allemagne.", site: "wg-gesucht.de" },
  { key: "immoscout24", domain: "HOUSING", name: "ImmoScout24", baseUrl: "https://www.immobilienscout24.de", access: "LINK", countries: ["DE"], note: "Anti-robot : recherche dans ton navigateur.", site: "immobilienscout24.de" },
  { key: "spareroom", domain: "HOUSING", name: "SpareRoom", baseUrl: "https://www.spareroom.co.uk", access: "LINK", countries: ["GB"], note: "Colocations au Royaume-Uni.", site: "spareroom.co.uk" },
  { key: "rightmove", domain: "HOUSING", name: "Rightmove", baseUrl: "https://www.rightmove.co.uk", access: "LINK", countries: ["GB"], note: "Locations au Royaume-Uni.", site: "rightmove.co.uk" },
  { key: "idealista", domain: "HOUSING", name: "Idealista", baseUrl: "https://www.idealista.com", access: "LINK", countries: ["ES", "PT", "IT"], note: "Espagne, Portugal, Italie.", site: "idealista.com" },
];

export function sourceByKey(key: string) {
  return DISCOVERY_SOURCES.find((s) => s.key === key) ?? null;
}

/** Sources of a domain that fit a country (sources without countries fit everywhere). */
export function sourcesFor(domain: DiscoveryDomain, country: string | null): DiscoverySource[] {
  const c = country?.toUpperCase() ?? null;
  return DISCOVERY_SOURCES.filter((s) => s.domain === domain && (!s.countries.length || !c || s.countries.includes(c)));
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

const list = (max: number) => z.array(z.string().trim().min(1).max(120)).max(max);

export const companyBoardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ats: z.enum(ATS),
  /** Board identifier: boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, jobs.ashbyhq.com/<slug>. */
  slug: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/, "Identifiant de page carrières invalide"),
});
export type CompanyBoard = z.infer<typeof companyBoardSchema>;

export const jobsCriteriaSchema = z.object({
  keywords: list(15).min(1),
  excludeKeywords: list(15).default([]),
  locations: list(10).default([]),
  /** ISO codes of the countries searched (Adzuna, links). */
  countries: z.array(z.string().trim().length(2).toUpperCase()).max(10).default([]),
  remoteOk: z.boolean().default(true),
  companies: z.array(companyBoardSchema).max(30).default([]),
  maxAgeDays: z.number().int().min(1).max(120).default(30),
});
export type JobsCriteria = z.infer<typeof jobsCriteriaSchema>;

export const HOUSING_TYPES_SEARCH = ["ROOM_COLIVING", "ROOM_FLATSHARE", "STUDIO", "APARTMENT"] as const;
export const housingCriteriaSchema = z.object({
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).toUpperCase().nullable().optional(),
  maxTotalMonthly: z.number().int().min(0).max(100_000).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("EUR"),
  furnished: z.enum(["REQUIRED", "PREFERRED", "ANY"]).default("REQUIRED"),
  types: z.array(z.enum(HOUSING_TYPES_SEARCH)).max(4).default([]),
  from: z.string().refine(isISODate).nullable().optional(),
  to: z.string().refine(isISODate).nullable().optional(),
  near: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type HousingCriteria = z.infer<typeof housingCriteriaSchema>;

export const savedSearchInputSchema = z.discriminatedUnion("domain", [
  z.object({ domain: z.literal("JOBS"), name: z.string().trim().max(200).nullish(), criteria: jobsCriteriaSchema, sources: z.array(z.string()).max(30).optional(), useAgent: z.boolean().default(false), schedule: z.enum(SCHEDULES).default("OFF") }),
  z.object({ domain: z.literal("HOUSING"), name: z.string().trim().max(200).nullish(), moveId: z.string().uuid(), criteria: housingCriteriaSchema, sources: z.array(z.string()).max(30).optional(), useAgent: z.boolean().default(true), schedule: z.enum(SCHEDULES).default("OFF") }),
]);
export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

const HOUSING_SHORT: Record<(typeof HOUSING_TYPES_SEARCH)[number], string> = { ROOM_COLIVING: "Coliving", ROOM_FLATSHARE: "Coloc", STUDIO: "Studio", APARTMENT: "Appartement" };

/**
 * Name of a search derived from its filters, so the user never has to type one:
 * "AI engineer, full-stack · Bruxelles, Paris" or "Coloc, studio · Bruxelles · max 800 €". Pure.
 */
export function searchName(input: { domain: "JOBS"; criteria: Pick<JobsCriteria, "keywords" | "locations" | "remoteOk" | "companies"> } | { domain: "HOUSING"; criteria: Pick<HousingCriteria, "city" | "types" | "maxTotalMonthly" | "currency"> }): string {
  const cut = (items: string[], n: number) => (items.length > n ? `${items.slice(0, n).join(", ")} +${items.length - n}` : items.join(", "));
  if (input.domain === "JOBS") {
    const c = input.criteria;
    const where = c.locations.length ? cut(c.locations, 2) : c.remoteOk ? "télétravail" : null;
    const followed = !c.keywords.length && c.companies.length ? cut(c.companies.map((x) => x.name), 2) : null;
    return [c.keywords.length ? cut(c.keywords, 3) : followed ?? "Offres", where].filter(Boolean).join(" · ").slice(0, 200);
  }
  const c = input.criteria;
  const types = c.types.length && c.types.length < HOUSING_TYPES_SEARCH.length ? c.types.map((t) => HOUSING_SHORT[t]) : ["Logement"];
  const kinds = types.map((t, i) => (i ? t.toLowerCase() : t)).join(", ");
  let max: string | null = null;
  if (c.maxTotalMonthly) {
    try {
      max = `max ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: c.currency || "EUR", maximumFractionDigits: 0 }).format(c.maxTotalMonthly)}`;
    } catch {
      max = `max ${c.maxTotalMonthly} ${c.currency}`;
    }
  }
  return [kinds, c.city, max].filter(Boolean).join(" · ").slice(0, 200);
}

const BOARD_PATTERNS: { ats: Ats; re: RegExp }[] = [
  { ats: "greenhouse", re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?(?:[^"'\s]*&)?for=)?([A-Za-z0-9._-]+)/gi },
  { ats: "greenhouse", re: /boards-api(?:\.eu)?\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9._-]+)/gi },
  { ats: "lever", re: /(?:jobs|api)(?:\.eu)?\.lever\.co\/(?:v0\/postings\/)?([A-Za-z0-9._-]+)/gi },
  { ats: "ashby", re: /jobs\.ashbyhq\.com\/([A-Za-z0-9._%-]+)/gi },
  { ats: "ashby", re: /api\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9._-]+)/gi },
];
const NOT_A_SLUG = new Set(["embed", "v0", "v1", "api", "js", "static", "assets", "jobs", "postings", "posting-api", "favicon.ico"]);

/** Greenhouse / Lever / Ashby boards referenced by a careers URL or by the HTML of a careers page. Pure. */
export function findBoards(text: string): { ats: Ats; slug: string }[] {
  const out: { ats: Ats; slug: string }[] = [];
  for (const { ats, re } of BOARD_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const slug = decodeURIComponent(m[1]).replace(/[^A-Za-z0-9._-]/g, "");
      if (!slug || NOT_A_SLUG.has(slug.toLowerCase()) || out.some((b) => b.ats === ats && b.slug.toLowerCase() === slug.toLowerCase())) continue;
      out.push({ ats, slug });
    }
  }
  return out;
}

/** Company name from a careers page title ("Jobs at Mistral AI", "Careers | Doctolib", "Alan - Jobs"). Pure. */
export function companyFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:current\s+)?(?:job\s+openings|jobs|careers|offres d['’]emploi|carrières|recrutement)\s+(?:at|chez|@|-|\||:)\s+/i, "");
  t = t.split(/\s+[|·–—-]\s+/).find((part) => !/^(?:jobs?|careers?|carrières|join us|work with us|offres|recrutement|home|accueil)$/i.test(part.trim())) ?? t;
  t = t.replace(/\s+(?:jobs|careers|carrières)$/i, "").trim();
  return t && t.length <= 80 ? t : null;
}

/** "mistral-ai" → "Mistral Ai" (a starting point the user can correct). */
export function prettySlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Job results (connectors and agent)
// ---------------------------------------------------------------------------

export interface JobResult {
  source: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  postedAt: string | null;
  description: string | null;
  salaryText: string | null;
  contractType: string | null;
}

const words = (s: string) => ` ${normalizeText(s).replace(/[^a-z0-9#+]+/g, " ").trim()} `;

/** Whether a posting matches the criteria (keywords in the title, location, remote, age). Pure. */
export function matchesJob(job: Pick<JobResult, "title" | "location" | "remote" | "postedAt" | "description">, c: JobsCriteria, today: string): boolean {
  const title = words(job.title);
  const kw = c.keywords.map((k) => words(k));
  if (!kw.some((k) => title.includes(k))) return false;
  if (c.excludeKeywords.some((k) => title.includes(words(k)))) return false;
  if (c.locations.length) {
    const loc = words(job.location ?? "");
    const inPlace = c.locations.some((l) => loc.includes(words(l)));
    const remote = job.remote === true || /\b(remote|teletravail|anywhere)\b/.test(loc);
    if (!inPlace && !(c.remoteOk && remote)) return false;
  }
  if (job.postedAt && isISODate(job.postedAt.slice(0, 10))) {
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${job.postedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
    if (age > c.maxAgeDays) return false;
  }
  return true;
}

/** Canonical form of a URL for duplicates (no tracking parameters, no trailing slash, lower-case host). Pure. */
export function canonicalJobUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|source|ref|refid|trk|lever-source|src)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/(\?|$)/, "$1");
  } catch {
    return raw.trim();
  }
}

/** Company + title + city key for duplicates seen on two sites. Pure. */
export function jobKey(j: Pick<JobResult, "company" | "title" | "location">): string {
  return [j.company, j.title, (j.location ?? "").split(/[,(]/)[0]].map((s) => normalizeText(s ?? "").replace(/[^a-z0-9]+/g, "")).join("|");
}

// ---------------------------------------------------------------------------
// Pre-filled search links (level C)
// ---------------------------------------------------------------------------

const INDEED_HOSTS: Record<string, string> = { FR: "fr", BE: "be", CA: "ca", GB: "uk", DE: "de", NL: "nl", CH: "ch" };

export function searchLinks(domain: DiscoveryDomain, input: { keywords?: string[]; location?: string | null; country?: string | null; extra?: string | null }) {
  const q = (input.keywords ?? []).join(" ");
  const l = input.location ?? "";
  return sourcesFor(domain, input.country ?? null)
    .filter((s) => s.access === "LINK")
    .map((s) => ({
      key: s.key,
      name: s.name,
      note: s.note,
      url: s.searchUrl
        ? s.searchUrl
            .replace("https://www.indeed.com", `https://${INDEED_HOSTS[input.country?.toUpperCase() ?? ""] ?? "www"}.indeed.com`)
            .replace("{q}", encodeURIComponent(q))
            .replace("{l}", encodeURIComponent(l))
        : `https://www.google.com/search?q=${encodeURIComponent([`site:${s.site}`, q, l, input.extra ?? ""].filter(Boolean).join(" "))}`,
    }));
}

/** Next run of a schedule after a run (null when manual). Pure. */
export function nextRun(schedule: Schedule, from: Date): Date | null {
  if (schedule === "OFF") return null;
  return new Date(from.getTime() + (schedule === "DAILY" ? 1 : 7) * 86_400_000);
}

// ---------------------------------------------------------------------------
// Agent output (level B)
// ---------------------------------------------------------------------------

const agentSuggestion = z.object({ name: z.string().max(200), url: z.string().max(2048), why: z.string().max(500) });
const agentBlocked = z.object({ name: z.string().max(200), reason: z.string().max(300) });

export const jobsAgentSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().max(2048).describe("The posting page you fetched (https)"),
        title: z.string().max(300),
        company: z.string().max(200).nullable(),
        location: z.string().max(200).nullable(),
        remote: z.boolean().nullable(),
        postedAt: z.string().max(40).nullable().describe("YYYY-MM-DD when shown"),
        contractType: z.string().max(100).nullable(),
        salaryText: z.string().max(200).nullable(),
        summary: z.string().max(1500).describe("What the job is, from the page"),
        source: z.string().max(100).describe("Site where you found it"),
      }),
    )
    .max(25),
  blocked: z.array(agentBlocked).max(15),
  suggestions: z.array(agentSuggestion).max(10),
  report: z.string().max(1500),
});
export type JobsAgentResult = z.infer<typeof jobsAgentSchema>;

export const housingAgentSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().max(2048).describe("The listing detail page you fetched (https)"),
        title: z.string().max(300),
        source: z.string().max(100),
        type: z.enum(["ROOM_COLIVING", "ROOM_FLATSHARE", "STUDIO", "APARTMENT", "OTHER"]).nullable(),
        address: z.string().max(300).nullable(),
        district: z.string().max(120).nullable(),
        rent: z.number().nullable().describe("Monthly rent without charges"),
        charges: z.number().nullable().describe("Monthly charges"),
        chargesInclude: z.array(z.string().max(80)).max(15),
        allInclusive: z.boolean().nullable(),
        deposit: z.number().nullable(),
        availableFrom: z.string().max(20).nullable().describe("YYYY-MM-DD"),
        minLeaseMonths: z.number().int().nullable(),
        furnished: z.enum(["YES", "SEMI", "NO", "UNKNOWN"]),
        roomSizeM2: z.number().int().nullable(),
        housemates: z.number().int().nullable(),
        contactUrl: z.string().max(2048).nullable(),
        contactEmail: z.string().max(200).nullable(),
        evidence: z.string().max(400).describe("Short verbatim quote of the price line on the detail page"),
      }),
    )
    .max(20),
  blocked: z.array(agentBlocked).max(15),
  suggestions: z.array(agentSuggestion).max(10),
  report: z.string().max(1500),
});
export type HousingAgentResult = z.infer<typeof housingAgentSchema>;

export const isHttps = (u: string | null | undefined): u is string => !!u && /^https:\/\/[^\s]+$/i.test(u.trim());
