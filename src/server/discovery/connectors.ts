/**
 * Job connectors (level A of the discovery engine): public JSON APIs read by deterministic code. No personal data is
 * sent; a generic User-Agent; one request per board or search, bounded in time and size.
 */
import { htmlToText } from "@/server/capture/html";
import { matchesJob, type CompanyBoard, type JobResult, type JobsCriteria } from "@/lib/discovery";

export interface ConnectorDeps {
  fetchJson: (url: string) => Promise<unknown>;
  env: (key: string) => string | undefined;
  today: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

export const defaultFetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "CareerOS/1.0 (personal job search)" }, signal: AbortSignal.timeout(25_000) });
  if (res.status === 404) throw new ConnectorError("introuvable (404)");
  if (res.status === 401 || res.status === 403) throw new ConnectorError(`accès refusé (${res.status})`);
  if (res.status === 429) throw new ConnectorError("trop de requêtes, réessayer plus tard (429)");
  if (!res.ok) throw new ConnectorError(`erreur ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new ConnectorError("réponse trop volumineuse");
  return res.json();
};

export class ConnectorError extends Error {}

const text = (html: unknown, max = 6000) => (typeof html === "string" && html ? htmlToText(html).slice(0, max) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isoDay = (v: unknown) => {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString().slice(0, 10);
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString().slice(0, 10);
  return null;
};
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** One company's board on Greenhouse, Lever or Ashby. */
export async function fetchBoard(board: CompanyBoard, deps: ConnectorDeps): Promise<JobResult[]> {
  const slug = encodeURIComponent(board.slug);
  if (board.ats === "greenhouse") {
    const body = obj(await deps.fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`));
    return arr(body.jobs).map((j) => ({
      source: "greenhouse",
      url: String(j.absolute_url ?? ""),
      title: String(j.title ?? ""),
      company: str(j.company_name) ?? board.name,
      location: str(obj(j.location).name),
      remote: null,
      postedAt: isoDay(j.first_published ?? j.updated_at),
      // Greenhouse escapes the HTML of the description.
      description: text(typeof j.content === "string" ? j.content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null),
      salaryText: null,
      contractType: null,
    }));
  }
  if (board.ats === "lever") {
    const body = await deps.fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return arr(body).map((j) => {
      const cat = obj(j.categories);
      return {
        source: "lever",
        url: String(j.hostedUrl ?? ""),
        title: String(j.text ?? ""),
        company: board.name,
        location: str(cat.location),
        remote: j.workplaceType === "remote" ? true : j.workplaceType ? false : null,
        postedAt: isoDay(j.createdAt),
        description: str(j.descriptionPlain)?.slice(0, 6000) ?? text(j.description),
        salaryText: null,
        contractType: str(cat.commitment),
      };
    });
  }
  const body = obj(await deps.fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`));
  return arr(body.jobs)
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      source: "ashby",
      url: String(j.jobUrl ?? ""),
      title: String(j.title ?? ""),
      company: board.name,
      location: str(j.location),
      remote: typeof j.isRemote === "boolean" ? j.isRemote : null,
      postedAt: isoDay(j.publishedAt),
      description: str(j.descriptionPlain)?.slice(0, 6000) ?? text(j.descriptionHtml),
      salaryText: str(obj(j.compensation).compensationTierSummary),
      contractType: str(j.employmentType),
    }));
}

export async function fetchRemotive(c: JobsCriteria, deps: ConnectorDeps): Promise<JobResult[]> {
  const body = obj(await deps.fetchJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(c.keywords.join(" "))}&limit=100`));
  return arr(body.jobs).map((j) => ({
    source: "remotive",
    url: String(j.url ?? ""),
    title: String(j.title ?? ""),
    company: str(j.company_name),
    location: str(j.candidate_required_location) ?? "Remote",
    remote: true,
    postedAt: isoDay(j.publication_date),
    description: text(j.description),
    salaryText: str(j.salary),
    contractType: str(j.job_type),
  }));
}

export async function fetchArbeitnow(_c: JobsCriteria, deps: ConnectorDeps): Promise<JobResult[]> {
  const body = obj(await deps.fetchJson("https://www.arbeitnow.com/api/job-board-api"));
  return arr(body.data).map((j) => ({
    source: "arbeitnow",
    url: String(j.url ?? ""),
    title: String(j.title ?? ""),
    company: str(j.company_name),
    location: str(j.location),
    remote: typeof j.remote === "boolean" ? j.remote : null,
    postedAt: isoDay(j.created_at),
    description: text(j.description),
    salaryText: null,
    contractType: Array.isArray(j.job_types) ? (j.job_types as string[]).join(", ") || null : null,
  }));
}

const ADZUNA_COUNTRIES: Record<string, string> = { FR: "fr", BE: "be", CA: "ca", US: "us", GB: "gb", DE: "de", NL: "nl", CH: "ch", AT: "at", IT: "it", ES: "es", PL: "pl", AU: "au", SG: "sg" };

export async function fetchAdzuna(c: JobsCriteria, deps: ConnectorDeps): Promise<JobResult[]> {
  const id = deps.env("ADZUNA_APP_ID");
  const key = deps.env("ADZUNA_APP_KEY");
  if (!id || !key) throw new ConnectorError("clé manquante : ADZUNA_APP_ID et ADZUNA_APP_KEY (gratuites sur developer.adzuna.com)");
  const countries = (c.countries.length ? c.countries : ["FR"]).map((x) => ADZUNA_COUNTRIES[x]).filter(Boolean);
  const out: JobResult[] = [];
  // One call per keyword (all its words required) and country, at most 3 × 2.
  const calls = countries.slice(0, 2).flatMap((country) => c.keywords.slice(0, 3).map((what) => ({ country, what })));
  for (const { country, what } of calls) {
    const where = c.locations[0] ? `&where=${encodeURIComponent(c.locations[0])}` : "";
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}&results_per_page=50&max_days_old=${c.maxAgeDays}&what=${encodeURIComponent(what)}${where}&content-type=application/json`;
    const body = obj(await deps.fetchJson(url));
    for (const j of arr(body.results)) {
      const min = typeof j.salary_min === "number" ? Math.round(j.salary_min) : null;
      const max = typeof j.salary_max === "number" ? Math.round(j.salary_max) : null;
      out.push({
        source: "adzuna",
        url: String(j.redirect_url ?? ""),
        title: String(j.title ?? ""),
        company: str(obj(j.company).display_name),
        location: str(obj(j.location).display_name),
        remote: null,
        postedAt: isoDay(j.created),
        description: text(j.description),
        salaryText: min || max ? [min, max].filter(Boolean).join(" à ") : null,
        contractType: str(j.contract_type),
      });
    }
  }
  return out;
}

/** Runs one connector and keeps the postings that match the criteria (valid https URL and title only). */
export async function runJobConnector(key: string, c: JobsCriteria, deps: ConnectorDeps): Promise<JobResult[]> {
  let all: JobResult[];
  if (key === "remotive") all = await fetchRemotive(c, deps);
  else if (key === "arbeitnow") all = await fetchArbeitnow(c, deps);
  else if (key === "adzuna") all = await fetchAdzuna(c, deps);
  else if (key === "greenhouse" || key === "lever" || key === "ashby") {
    all = [];
    for (const board of c.companies.filter((b) => b.ats === key)) all.push(...(await fetchBoard(board, deps)));
  } else throw new ConnectorError("connecteur inconnu");
  return all.filter((j) => /^https:\/\//i.test(j.url) && j.title && matchesJob(j, c, deps.today));
}
