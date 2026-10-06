/** Text helpers shared by client and server. */

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, no accents, collapsed whitespace. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccents(value).toLowerCase().replace(/[’'`]/g, "'").replace(/\s+/g, " ").trim();
}

const LEGAL_SUFFIXES =
  /\b(sas|sasu|sarl|sa|sca|scs|gmbh|ag|inc|incorporated|ltd|limited|llc|plc|bv|nv|spa|srl|corp|corporation|co|company|group|groupe)\b\.?/g;

/** Normalized organization name used for matching ("Zefir SAS" == "zefir"). */
export function normalizeOrgName(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/[^a-z0-9 &+]/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TITLE_NOISE = /\b(h\/f|f\/h|m\/f|f\/m|h\/f\/x|m\/w\/d|w\/m\/d|cdi|cdd|freelance|stage|internship|alternance|remote|hybrid|full[- ]?time|part[- ]?time)\b/g;

export function normalizeTitle(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/[()[\]{}|,;:!?"«»]/g, " ")
    .replace(TITLE_NOISE, " ")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): string[] {
  const s = ` ${value} `;
  const grams: string[] = [];
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice coefficient on character bigrams (0..1). */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of gb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (ga.length + gb.length);
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|refid|trk|trackingid|src$|source$|origin$|currentjobid)/i;

/** Canonical form of a URL used to detect duplicates (no tracking params, no fragment, lowercase host). */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^[a-z]{2}\.linkedin\.com$/, "linkedin.com");
    // LinkedIn job ids are the only thing that matters.
    const linkedinJob = /\/jobs\/view\/(?:[^/]*-)?(\d{6,})/.exec(url.pathname) ?? (url.searchParams.get("currentJobId") ? [null, url.searchParams.get("currentJobId")] : null);
    if (url.hostname.endsWith("linkedin.com") && linkedinJob?.[1]) return `linkedin.com/jobs/view/${linkedinJob[1]}`;
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, "") || "";
    const query = url.searchParams.toString();
    return `${url.hostname}${path}${query ? `?${query}` : ""}`;
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

export function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Replace {{variables}} in a template. Unknown variables become empty strings. */
export function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function uniqueStrings(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function slugify(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Escape LIKE wildcards. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
