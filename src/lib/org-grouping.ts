/**
 * Display-only grouping of organizations by brand ("Alten", "Alten Canada", "Alten Chine" → one row "Alten").
 * Pure and deterministic (client-safe): no data is merged, every entity keeps its own record.
 *
 * Two organizations belong to the same brand when:
 *  1. their websites share the same registrable domain (alten.com, careers.alten.com), job boards excluded;
 *  2. one name is the other name followed by location words ("Alten" / "Alten Canada", "Institut Pasteur de Lille");
 *  3. both names start with the same brand followed only by location words ("Alten Canada" / "Alten Chine").
 * Location words = a small FR/EN list of countries, regions and major cities + the organization's own city/country.
 */
import { normalizeOrgName, normalizeText } from "./text";

// ---------------------------------------------------------------------------
// Website domains
// ---------------------------------------------------------------------------

/** Two-level public suffixes (and multi-tenant hosting platforms) — the registrable domain is one label more. */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk",
  "gouv.fr", "asso.fr", "nom.fr",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "ac.nz", "org.nz",
  "co.jp", "ac.jp", "ne.jp", "or.jp", "go.jp",
  "co.kr", "ac.kr", "or.kr",
  "com.cn", "edu.cn", "net.cn", "org.cn", "gov.cn",
  "com.hk", "edu.hk", "org.hk",
  "com.tw", "edu.tw", "org.tw",
  "com.sg", "edu.sg", "org.sg",
  "co.in", "ac.in", "org.in", "net.in",
  "com.br", "org.br", "edu.br",
  "com.mx", "edu.mx", "org.mx",
  "com.ar", "edu.ar",
  "com.tr", "edu.tr", "org.tr",
  "co.za", "ac.za", "org.za",
  "co.il", "ac.il", "org.il",
  "com.my", "edu.my",
  "co.id", "ac.id",
  "co.th", "ac.th",
  "com.vn", "edu.vn",
  "com.ph", "edu.ph",
  "com.eg", "edu.eg",
  "co.ma", "ac.ma",
  "com.tn",
  "qc.ca", "gc.ca",
  "ac.at", "co.at", "or.at",
  "ac.be",
  "com.pl", "edu.pl",
  "com.es", "edu.es",
  "com.pt",
  "europa.eu",
  // Multi-tenant hosting: every tenant is its own site.
  "github.io", "gitlab.io", "wixsite.com", "notion.site", "webflow.io", "vercel.app", "netlify.app", "herokuapp.com",
  "blogspot.com", "wordpress.com", "myshopify.com", "azurewebsites.net", "pages.dev", "web.app", "firebaseapp.com",
]);

/** Job boards, ATS, social networks, portals: their URL says nothing about the organization's identity. */
const GENERIC_DOMAINS = new Set([
  "linkedin.com", "lnkd.in", "welcometothejungle.com", "wttj.co", "indeed.com", "indeed.fr", "glassdoor.com", "glassdoor.fr",
  "lever.co", "greenhouse.io", "workable.com", "myworkdayjobs.com", "myworkdaysite.com", "smartrecruiters.com", "teamtailor.com",
  "jobteaser.com", "hellowork.com", "apec.fr", "francetravail.fr", "pole-emploi.fr", "monster.fr", "monster.com", "cadremploi.fr",
  "meteojob.com", "jobijoba.com", "talent.com", "recruitee.com", "jobvite.com", "taleo.net", "successfactors.com", "successfactors.eu",
  "icims.com", "ashbyhq.com", "breezy.hr", "personio.de", "personio.com", "join.com", "workatastartup.com", "otta.com",
  "civiweb.com", "businessfrance.fr", "campusfrance.org", "mastersportal.com", "findamasters.com", "findaphd.com", "studyportals.com",
  "phdportal.com", "academictransfer.com", "jobs.ac.uk", "parcoursup.fr", "monmaster.gouv.fr", "euraxess.ec.europa.eu",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com", "medium.com", "github.com", "gitlab.com",
  "bit.ly", "forms.gle", "typeform.com", "calendly.com", "zoom.us", "wix.com", "squarespace.com", "notion.so",
]);

/** Exact hosts of shared services hosted under a real company's domain. */
const GENERIC_HOSTS = new Set(["sites.google.com", "docs.google.com", "drive.google.com", "forms.google.com", "careers.google.com"]);

const RESERVED_TLDS = new Set(["local", "localhost", "internal", "lan", "home", "test", "example", "invalid", "corp", "intranet"]);

/**
 * Hostname of an organization's website (lowercase, without "www."), or null when it is missing, invalid,
 * private (IP, localhost, single label) or a generic platform (job board, ATS, social network).
 */
export function websiteHost(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\d?\./, "");
  if (!host || host.length > 253 || host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null;
  if (RESERVED_TLDS.has(labels.at(-1)!) || /^\d+$/.test(labels.at(-1)!)) return null;
  if (GENERIC_HOSTS.has(host)) return null;
  const registrable = registrableDomain(host);
  if (GENERIC_DOMAINS.has(registrable) || GENERIC_DOMAINS.has(host)) return null;
  return host;
}

/** "careers.alten.co.uk" → "alten.co.uk" (small built-in public-suffix list, good enough for grouping). */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  if (MULTI_PART_SUFFIXES.has(lastThree)) return labels.slice(-4).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return lastThree;
  return lastTwo;
}

/** Registrable domain of a website, or null (see websiteHost). */
export function websiteDomain(website: string | null | undefined): string | null {
  const host = websiteHost(website);
  return host ? registrableDomain(host) : null;
}

// ---------------------------------------------------------------------------
// Location vocabulary (normalized: lowercase, no accents, words separated by single spaces)
// ---------------------------------------------------------------------------

const COUNTRIES = [
  "france", "germany", "allemagne", "deutschland", "spain", "espagne", "espana", "italy", "italie", "italia", "portugal",
  "belgium", "belgique", "belgie", "netherlands", "pays bas", "nederland", "holland", "hollande", "luxembourg",
  "switzerland", "suisse", "schweiz", "svizzera", "austria", "autriche", "osterreich", "united kingdom", "royaume uni", "uk",
  "great britain", "grande bretagne", "england", "angleterre", "scotland", "ecosse", "wales", "ireland", "irlande",
  "denmark", "danemark", "sweden", "suede", "norway", "norvege", "finland", "finlande", "iceland", "islande", "poland", "pologne",
  "czech republic", "czechia", "republique tcheque", "tchequie", "slovakia", "slovaquie", "hungary", "hongrie", "romania", "roumanie",
  "bulgaria", "bulgarie", "greece", "grece", "croatia", "croatie", "slovenia", "slovenie", "serbia", "serbie", "ukraine",
  "russia", "russie", "turkey", "turquie", "turkiye", "estonia", "estonie", "latvia", "lettonie", "lithuania", "lituanie",
  "malta", "malte", "cyprus", "chypre", "monaco", "andorra", "andorre",
  "usa", "us", "united states", "united states of america", "etats unis", "america", "amerique", "canada", "mexico", "mexique",
  "brazil", "bresil", "brasil", "argentina", "argentine", "chile", "chili", "colombia", "colombie", "peru", "perou", "uruguay",
  "venezuela", "costa rica", "china", "chine", "japan", "japon", "korea", "coree", "south korea", "coree du sud", "india", "inde",
  "singapore", "singapour", "hong kong", "taiwan", "thailand", "thailande", "vietnam", "viet nam", "malaysia", "malaisie",
  "indonesia", "indonesie", "philippines", "australia", "australie", "new zealand", "nouvelle zelande", "israel",
  "uae", "united arab emirates", "emirats arabes unis", "emirates", "saudi arabia", "arabie saoudite", "ksa", "qatar",
  "egypt", "egypte", "morocco", "maroc", "algeria", "algerie", "tunisia", "tunisie", "senegal", "cote d ivoire", "ivory coast",
  "nigeria", "kenya", "south africa", "afrique du sud", "cameroun", "cameroon", "madagascar", "maurice", "mauritius",
  "reunion", "la reunion", "guadeloupe", "martinique", "guyane", "nouvelle caledonie", "polynesie", "quebec",
];

const REGIONS = [
  "europe", "emea", "apac", "asia", "asie", "americas", "north america", "amerique du nord", "latin america", "amerique latine",
  "latam", "africa", "afrique", "middle east", "moyen orient", "nordics", "benelux", "dach", "maghreb",
  "nord", "sud", "est", "ouest", "north", "south", "east", "west", "sud ouest", "sud est", "nord ouest", "nord est",
  "ile de france", "idf", "auvergne rhone alpes", "rhone alpes", "occitanie", "bretagne", "normandie", "grand est",
  "hauts de france", "nouvelle aquitaine", "aquitaine", "provence", "paca", "provence alpes cote d azur", "cote d azur",
  "pays de la loire", "centre val de loire", "bourgogne", "franche comte", "bourgogne franche comte", "corse", "alsace",
  "lorraine", "picardie", "midi pyrenees", "languedoc", "auvergne", "romandie", "suisse romande", "vaud", "valais", "ticino", "tessin",
  "bavaria", "baviere", "catalonia", "catalogne",
];

const CITIES = [
  "paris", "lyon", "marseille", "toulouse", "nice", "nantes", "strasbourg", "montpellier", "bordeaux", "lille", "rennes", "reims",
  "grenoble", "toulon", "dijon", "angers", "nimes", "clermont ferrand", "le mans", "aix en provence", "brest", "tours", "amiens",
  "limoges", "annecy", "metz", "nancy", "rouen", "caen", "orleans", "mulhouse", "perpignan", "besancon", "saint etienne",
  "sophia antipolis", "la defense", "saclay", "paris saclay", "versailles", "boulogne billancourt", "issy les moulineaux", "massy",
  "velizy", "pau", "la rochelle", "poitiers", "le havre", "compiegne", "cergy", "evry", "marne la vallee",
  "london", "londres", "manchester", "birmingham", "edinburgh", "edimbourg", "glasgow", "cambridge", "oxford", "dublin",
  "berlin", "munich", "munchen", "hamburg", "hambourg", "frankfurt", "francfort", "cologne", "koln", "stuttgart", "dusseldorf",
  "heidelberg", "madrid", "barcelona", "barcelone", "valencia", "seville", "lisbon", "lisbonne", "lisboa", "porto", "rome", "roma",
  "milan", "milano", "turin", "torino", "florence", "bologna", "bologne", "naples", "amsterdam", "rotterdam", "eindhoven", "delft",
  "utrecht", "the hague", "la haye", "brussels", "bruxelles", "brussel", "antwerp", "anvers", "ghent", "gand", "liege", "louvain",
  "leuven", "geneva", "geneve", "lausanne", "zurich", "basel", "bale", "bern", "berne", "vienna", "vienne", "wien", "prague",
  "warsaw", "varsovie", "krakow", "cracovie", "budapest", "bucharest", "bucarest", "athens", "athenes", "stockholm", "copenhagen",
  "copenhague", "oslo", "helsinki", "tallinn", "riga", "vilnius", "istanbul", "moscow", "moscou", "kyiv", "kiev",
  "new york", "nyc", "boston", "san francisco", "los angeles", "chicago", "seattle", "austin", "washington", "miami", "atlanta",
  "houston", "dallas", "denver", "toronto", "montreal", "vancouver", "ottawa", "calgary", "mexico city", "sao paulo",
  "rio de janeiro", "buenos aires", "santiago", "bogota", "lima", "beijing", "pekin", "shanghai", "shenzhen", "guangzhou", "canton",
  "tokyo", "osaka", "kyoto", "seoul", "bangalore", "bengaluru", "mumbai", "bombay", "delhi", "new delhi", "pune", "hyderabad",
  "chennai", "bangkok", "hanoi", "ho chi minh", "kuala lumpur", "jakarta", "manila", "taipei", "sydney", "melbourne", "brisbane",
  "perth", "auckland", "dubai", "abu dhabi", "doha", "riyadh", "tel aviv", "cairo", "le caire", "casablanca", "rabat", "tunis",
  "alger", "algiers", "dakar", "abidjan", "lagos", "nairobi", "johannesburg", "cape town", "le cap",
];

const LOCATIONS = new Set([...COUNTRIES, ...REGIONS, ...CITIES]);
const MAX_PHRASE_WORDS = 5;

/** Glue words allowed between a brand and its location ("Institut Pasteur de Lille", "Bank of … in …"). */
const CONNECTORS = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "of", "in", "en", "au", "aux", "a", "the", "et", "and", "und", "y", "di", "del", "da", "at"]);

/** Words that cannot make a brand on their own ("Université de Lyon" and "Université de Lille" are different schools). */
const GENERIC_WORDS = new Set([
  "university", "universite", "universitat", "universiteit", "universidad", "universita", "universidade", "uni", "technical",
  "technische", "technology", "technologie", "technologies", "polytechnic", "polytechnique", "ecole", "school", "institut",
  "institute", "instituto", "istituto", "college", "academy", "academie", "centre", "center", "national", "nationale", "federal",
  "federale", "international", "research", "recherche", "hopital", "hospital", "chu", "clinique", "clinic", "laboratoire",
  "laboratory", "lab", "labs", "faculte", "faculty", "campus", "business", "management", "graduate", "superieure", "superieur",
  "normale", "sciences", "science", "arts", "metiers", "ministry", "ministere", "region", "city", "ville", "state", "public",
  "conseil", "office", "agence", "agency", "bank", "banque", "credit", "holding", "foundation", "fondation", "association",
  "societe", "society", "company", "compagnie", "services", "service", "solutions", "consulting", "conseil", "air", "new",
  "general", "generale", "royal", "royale", "free", "open", "global", "world", "group", "groupe", "team", "studio", "digital",
]);

function isLocationPhrase(phrase: string, extra: Set<string>) {
  return LOCATIONS.has(phrase) || extra.has(phrase);
}

/** True when the words are only locations (with glue words), and at least one location. */
export function isLocationSuffix(words: string[], extra: Set<string> = new Set()): boolean {
  if (!words.length) return false;
  // reachable[i] = words[0..i) can be segmented; hasLocation tracks whether a real location was used.
  const reachable: (null | boolean)[] = Array(words.length + 1).fill(null);
  reachable[0] = false;
  for (let i = 0; i < words.length; i++) {
    if (reachable[i] === null) continue;
    if (CONNECTORS.has(words[i])) reachable[i + 1] = reachable[i + 1] || reachable[i]!;
    for (let len = 1; len <= MAX_PHRASE_WORDS && i + len <= words.length; len++) {
      if (isLocationPhrase(words.slice(i, i + len).join(" "), extra)) reachable[i + len] = true;
    }
  }
  return reachable[words.length] === true;
}

function locationPhrases(values: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    for (const part of (value ?? "").split(/[,/;|()]+/)) {
      const n = normalizeOrgName(part);
      if (n && n.length >= 2) out.add(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

interface NameToken {
  word: string;
  /** Index of the original (display) word it comes from. */
  source: number;
}

function tokenize(name: string): { tokens: NameToken[]; original: string[] } {
  const original = name.trim().split(/\s+/).filter(Boolean);
  const tokens: NameToken[] = [];
  original.forEach((word, source) => {
    for (const w of normalizeOrgName(word).split(" ")) if (w) tokens.push({ word: w, source });
  });
  return { tokens, original };
}

function isValidBrand(words: string[], strict: boolean): boolean {
  const meaningful = words.filter((w) => !CONNECTORS.has(w));
  if (!meaningful.length) return false;
  // At least one distinctive word: not generic, not a location.
  if (!meaningful.some((w) => !GENERIC_WORDS.has(w) && !LOCATIONS.has(w))) return false;
  if (CONNECTORS.has(words.at(-1)!)) return false;
  // Two different orgs sharing only a short prefix ("Air France" / "Air Canada", "SAP X" / "SAP Y") are too risky.
  if (strict && meaningful.join("").length < 4) return false;
  return true;
}

export interface GroupableOrganization {
  id: string;
  name: string;
  website?: string | null;
  city?: string | null;
  country?: string | null;
}

interface Analyzed<T extends GroupableOrganization> {
  org: T;
  index: number;
  full: string;
  domain: string | null;
  /** Brands this name is "brand + location" of, shortest first. */
  brands: { key: string; display: string }[];
}

function analyze<T extends GroupableOrganization>(org: T, index: number): Analyzed<T> {
  const { tokens, original } = tokenize(org.name);
  const words = tokens.map((t) => t.word);
  const extra = locationPhrases([org.city, org.country]);
  const brands: { key: string; display: string }[] = [];
  for (let k = 1; k < words.length; k++) {
    const brand = words.slice(0, k);
    if (!isValidBrand(brand, false) || !isLocationSuffix(words.slice(k), extra)) continue;
    const lastSource = tokens[k - 1].source;
    // The display keeps the original spelling, without trailing separators ("Alten -", "Alten (").
    const display = original
      .slice(0, lastSource + 1)
      .join(" ")
      .replace(/[\s\-–—,:;(/|]+$/, "");
    brands.push({ key: brand.join(" "), display });
  }
  return { org, index, full: words.join(" "), domain: websiteDomain(org.website), brands };
}

export interface OrganizationGroup<T extends GroupableOrganization> {
  /** Stable key (smallest member id). */
  key: string;
  /** Brand name to display ("Alten"). */
  name: string;
  /** Members, the "brand" entity first, then by name. A single-member group is a plain organization. */
  members: T[];
  /** Why the members were grouped (for tooltips/tests). */
  reasons: ("domain" | "name" | "brand")[];
}

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Groups organizations by brand. Deterministic: the same input always gives the same groups in the same order. */
export function groupOrganizations<T extends GroupableOrganization>(orgs: T[]): OrganizationGroup<T>[] {
  const items = orgs.map(analyze);
  const uf = new UnionFind(items.length);
  const reasons = new Map<number, Set<"domain" | "name" | "brand">>();
  const link = (a: number, b: number, reason: "domain" | "name" | "brand") => {
    uf.union(a, b);
    for (const i of [a, b]) {
      const set = reasons.get(i) ?? new Set();
      set.add(reason);
      reasons.set(i, set);
    }
  };

  const byDomain = new Map<string, number>();
  const byFull = new Map<string, number>();
  const byBrand = new Map<string, number>();
  for (const item of items) {
    if (item.domain) {
      const other = byDomain.get(item.domain);
      if (other === undefined) byDomain.set(item.domain, item.index);
      else link(other, item.index, "domain");
    }
    if (item.full) {
      const other = byFull.get(item.full);
      if (other === undefined) byFull.set(item.full, item.index);
      else link(other, item.index, "name");
    }
  }
  for (const item of items) {
    // "Alten Canada" = "Alten" + location.
    for (const brand of item.brands) {
      const base = byFull.get(brand.key);
      if (base !== undefined && base !== item.index) link(base, item.index, "name");
    }
    // "Alten Canada" / "Alten Chine": same shortest brand, both followed by locations only.
    const shortest = item.brands[0];
    if (shortest && isValidBrand(shortest.key.split(" "), true)) {
      const other = byBrand.get(shortest.key);
      if (other === undefined) byBrand.set(shortest.key, item.index);
      else link(other, item.index, "brand");
    }
  }

  const clusters = new Map<number, Analyzed<T>[]>();
  for (const item of items) {
    const root = uf.find(item.index);
    const list = clusters.get(root) ?? [];
    list.push(item);
    clusters.set(root, list);
  }

  const groups: OrganizationGroup<T>[] = [];
  for (const cluster of clusters.values()) {
    // Input order must not change the result: name the group from members in a canonical order.
    const members = [...cluster].sort((a, b) => collator.compare(a.org.name, b.org.name) || a.org.id.localeCompare(b.org.id));
    const name = groupName(members);
    const nameKey = normalizeOrgName(name);
    const sorted = [...members].sort((a, b) => {
      const aBase = a.full === nameKey ? 0 : 1;
      const bBase = b.full === nameKey ? 0 : 1;
      return aBase - bBase || collator.compare(a.org.name, b.org.name) || a.org.id.localeCompare(b.org.id);
    });
    const why = new Set<"domain" | "name" | "brand">();
    for (const m of members) for (const r of reasons.get(m.index) ?? []) why.add(r);
    groups.push({
      key: members.map((m) => m.org.id).sort()[0],
      name,
      members: sorted.map((m) => m.org),
      reasons: [...why].sort(),
    });
  }
  return groups.sort((a, b) => collator.compare(a.name, b.name) || a.key.localeCompare(b.key));
}

function groupName<T extends GroupableOrganization>(members: Analyzed<T>[]): string {
  if (members.length === 1) return members[0].org.name;
  // 1. A member whose name is a brand of the others ("Alten").
  for (const m of [...members].sort((a, b) => a.full.length - b.full.length || collator.compare(a.org.name, b.org.name))) {
    if (members.every((o) => o === m || o.full === m.full || o.brands.some((b) => b.key === m.full))) return m.org.name;
  }
  // 2. The shared shortest brand ("Alten Canada" + "Alten Chine" → "Alten").
  const shortest = members.map((m) => m.brands[0]?.key ?? null);
  if (shortest[0] && shortest.every((k) => k === shortest[0])) return members[0].brands[0].display;
  // 3. A brand common to every member (via any of its brands or its full name).
  const candidates = members[0].brands.map((b) => b.key).concat(members[0].full);
  for (const key of candidates) {
    if (members.every((m) => m.full === key || m.brands.some((b) => b.key === key))) {
      const owner = members.find((m) => m.full === key);
      return owner ? owner.org.name : members[0].brands.find((b) => b.key === key)!.display;
    }
  }
  // 4. Grouped by domain only: the shortest name ("Capgemini" with "Capgemini Invent").
  return [...members].sort((a, b) => a.org.name.length - b.org.name.length || collator.compare(a.org.name, b.org.name))[0].org.name;
}

/** The other organizations of the same brand as `id` (for "other sites" links). Empty when it is alone. */
export function siblingOrganizations<T extends GroupableOrganization>(id: string, orgs: T[]): { brand: string; siblings: T[] } {
  const group = groupOrganizations(orgs).find((g) => g.members.some((m) => m.id === id));
  if (!group || group.members.length < 2) return { brand: group?.name ?? "", siblings: [] };
  return { brand: group.name, siblings: group.members.filter((m) => m.id !== id) };
}

/** Short, distinct location label of a set of organizations ("Canada, Chine"). */
export function locationsLabel(orgs: GroupableOrganization[], max = 3): { label: string; more: number } {
  const seen = new Map<string, string>();
  for (const o of orgs) {
    const value = o.country || o.city;
    if (!value) continue;
    const key = normalizeText(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  const values = [...seen.values()].sort(collator.compare);
  return { label: values.slice(0, max).join(", "), more: Math.max(0, values.length - max) };
}
