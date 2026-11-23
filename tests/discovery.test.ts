import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, useTempStorage } from "./helpers/db";
import { USER } from "@/server/context";
import * as s from "@/server/db/schema";
import { canonicalJobUrl, jobKey, jobsCriteriaSchema, matchesJob, nextRun, searchLinks, sourcesFor } from "@/lib/discovery";
import { fetchAdzuna, fetchBoard, runJobConnector, type ConnectorDeps } from "@/server/discovery/connectors";
import { createSearch, listSearches, runDueSearches, runSearch, type RunDeps } from "@/server/services/discovery";
import { createMove, getMove } from "@/server/services/moves";
import { exportAll } from "@/server/services/data-transfer";

const TODAY = "2026-11-23";
const criteria = jobsCriteriaSchema.parse({ keywords: ["AI engineer", "full-stack"], excludeKeywords: ["senior"], locations: ["Brussels", "Bruxelles"], companies: [{ name: "Acme", ats: "greenhouse", slug: "acme" }] });

const GREENHOUSE = {
  jobs: [
    { id: 1, title: "AI Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/1?gh_src=abc", location: { name: "Brussels, Belgium" }, first_published: "2026-11-20T10:00:00Z", content: "&lt;p&gt;Build agents &amp;amp; tools&lt;/p&gt;", company_name: "Acme" },
    { id: 2, title: "Senior AI Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/2", location: { name: "Brussels" }, first_published: "2026-11-20T10:00:00Z" },
    { id: 3, title: "Full-Stack Developer", absolute_url: "https://boards.greenhouse.io/acme/jobs/3", location: { name: "Remote, Europe" }, first_published: "2026-11-01T10:00:00Z" },
    { id: 4, title: "Sales Manager", absolute_url: "https://boards.greenhouse.io/acme/jobs/4", location: { name: "Brussels" }, first_published: "2026-11-20T10:00:00Z" },
    { id: 5, title: "AI Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/5", location: { name: "Brussels" }, first_published: "2026-08-01T10:00:00Z" },
  ],
};

function deps(routes: Record<string, unknown>, env: Record<string, string> = {}): ConnectorDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    today: TODAY,
    env: (k) => env[k],
    fetchJson: async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      if (!hit) throw new Error(`unexpected ${url}`);
      return hit[1];
    },
  };
}

describe("discovery logic", () => {
  it("matches postings on title keywords, exclusions, place or remote, and age", () => {
    expect(matchesJob({ title: "AI Engineer", location: "Brussels", remote: null, postedAt: "2026-11-20", description: null }, criteria, TODAY)).toBe(true);
    expect(matchesJob({ title: "Senior AI Engineer", location: "Brussels", remote: null, postedAt: null, description: null }, criteria, TODAY)).toBe(false);
    expect(matchesJob({ title: "Full-Stack Developer", location: "Remote, Europe", remote: null, postedAt: "2026-11-01", description: null }, criteria, TODAY)).toBe(true);
    expect(matchesJob({ title: "Full-Stack Developer", location: "Paris", remote: false, postedAt: null, description: null }, criteria, TODAY)).toBe(false);
    expect(matchesJob({ title: "AI Engineer", location: "Brussels", remote: null, postedAt: "2026-08-01", description: null }, criteria, TODAY)).toBe(false); // older than 30 days
    expect(matchesJob({ title: "Chief AI Engineering Officer", location: "Brussels", remote: null, postedAt: null, description: null }, criteria, TODAY)).toBe(false); // whole words
  });

  it("normalizes URLs and keys for duplicates", () => {
    expect(canonicalJobUrl("https://Boards.Greenhouse.io/acme/jobs/1/?gh_src=abc&utm_source=x#apply")).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(jobKey({ company: "Acme SA", title: "AI Engineer", location: "Brussels, Belgium" })).toBe(jobKey({ company: "acme sa", title: "AI engineer", location: "Brussels" }));
  });

  it("builds pre-filled links for sites the user opens himself", () => {
    const links = searchLinks("JOBS", { keywords: ["AI engineer"], location: "Bruxelles", country: "BE" });
    expect(links.find((l) => l.key === "indeed")?.url).toBe("https://be.indeed.com/jobs?q=AI%20engineer&l=Bruxelles");
    expect(links.find((l) => l.key === "linkedin")?.url).toBe("https://www.linkedin.com/jobs/search/?keywords=AI%20engineer&location=Bruxelles");
    expect(links.some((l) => l.key === "hellowork")).toBe(false); // France only
    const housing = searchLinks("HOUSING", { keywords: ["meublé"], location: "Bruxelles", country: "BE" });
    expect(housing.find((l) => l.key === "immoweb")?.url).toBe("https://www.google.com/search?q=site%3Aimmoweb.be%20meubl%C3%A9%20Bruxelles");
    expect(sourcesFor("HOUSING", "CA").some((x) => x.key === "kijiji")).toBe(true);
  });

  it("schedules the next run", () => {
    const from = new Date("2026-11-23T08:00:00Z");
    expect(nextRun("OFF", from)).toBeNull();
    expect(nextRun("DAILY", from)?.toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(nextRun("WEEKLY", from)?.toISOString()).toBe("2026-11-30T08:00:00.000Z");
  });
});

describe("job connectors", () => {
  it("reads a Greenhouse board and keeps the matching postings", async () => {
    const d = deps({ "https://boards-api.greenhouse.io/v1/boards/acme/jobs": GREENHOUSE });
    const raw = await fetchBoard({ name: "Acme", ats: "greenhouse", slug: "acme" }, d);
    expect(raw[0]).toMatchObject({ source: "greenhouse", title: "AI Engineer", company: "Acme", location: "Brussels, Belgium", postedAt: "2026-11-20", description: "Build agents & tools" });
    const kept = await runJobConnector("greenhouse", criteria, d);
    expect(kept.map((j) => j.url)).toEqual(["https://boards.greenhouse.io/acme/jobs/1?gh_src=abc", "https://boards.greenhouse.io/acme/jobs/3"]);
  });

  it("reads Lever and Ashby boards", async () => {
    const lever = await fetchBoard({ name: "Mistral", ats: "lever", slug: "mistral" }, deps({ "https://api.lever.co/v0/postings/mistral": [{ id: "a", text: "AI Engineer", hostedUrl: "https://jobs.lever.co/mistral/a", categories: { location: "Paris", commitment: "Full-time" }, createdAt: 1763600000000, descriptionPlain: "Build", workplaceType: "hybrid" }] }));
    expect(lever[0]).toMatchObject({ source: "lever", url: "https://jobs.lever.co/mistral/a", location: "Paris", contractType: "Full-time", remote: false });
    const ashby = await fetchBoard({ name: "Linear", ats: "ashby", slug: "linear" }, deps({ "https://api.ashbyhq.com/posting-api/job-board/linear": { jobs: [{ id: "x", title: "Product Engineer", location: "Remote", isRemote: true, isListed: true, publishedAt: "2026-11-21T00:00:00Z", jobUrl: "https://jobs.ashbyhq.com/linear/x", employmentType: "FullTime" }, { id: "y", title: "Hidden", isListed: false, jobUrl: "https://jobs.ashbyhq.com/linear/y" }] } }));
    expect(ashby.map((j) => j.title)).toEqual(["Product Engineer"]);
    expect(ashby[0]).toMatchObject({ remote: true, postedAt: "2026-11-21" });
  });

  it("asks for the Adzuna keys instead of failing silently", async () => {
    await expect(fetchAdzuna(criteria, deps({}))).rejects.toThrow(/ADZUNA_APP_ID/);
    const d = deps({ "https://api.adzuna.com/v1/api/jobs/be/search/1": { results: [{ id: "1", title: "AI Engineer", redirect_url: "https://www.adzuna.be/details/1", company: { display_name: "Beta" }, location: { display_name: "Bruxelles" }, created: "2026-11-22T00:00:00Z", salary_min: 50000 }] } }, { ADZUNA_APP_ID: "id", ADZUNA_APP_KEY: "key" });
    const list = await fetchAdzuna({ ...criteria, countries: ["BE"] }, d);
    expect(list[0]).toMatchObject({ source: "adzuna", company: "Beta", salaryText: "50000" });
    expect(d.calls[0]).toContain("what=AI%20engineer");
  });
});

describe("saved searches (database)", () => {
  let moveId: string;

  beforeAll(async () => {
    useTempStorage();
    await createTestDb();
    moveId = (await createMove({ title: "Stage · Bruxelles", city: "Bruxelles", country: "Belgique", arrivalDate: "2027-01-04", departureDate: "2027-07-02" }, USER)).id;
  });

  it("puts new job postings in the Inbox once, with an honest report", async () => {
    const search = await createSearch({ domain: "JOBS", name: "IA Bruxelles", criteria, sources: ["greenhouse", "adzuna"] }, USER);
    const runDeps: RunDeps = { ...deps({ "https://boards-api.greenhouse.io/v1/boards/acme/jobs": GREENHOUSE }), agent: (() => Promise.reject(new Error("agent not expected"))) as never };
    const first = await runSearch(search.id, USER, { deps: runDeps });
    expect(first).toMatchObject({ status: "DONE", resultsFound: 2, resultsNew: 2 });
    expect(first.sources).toEqual([
      { key: "greenhouse", name: "Greenhouse (pages carrières)", ok: true, found: 2 },
      expect.objectContaining({ key: "adzuna", ok: false, reason: expect.stringMatching(/clé manquante/) }),
    ]);
    const items = await createTestDbItems();
    expect(items.map((i) => i.title).sort()).toEqual(["AI Engineer · Acme", "Full-Stack Developer · Acme"]);
    expect(items.every((i) => i.status === "NEW" && i.sourceType === "API")).toBe(true);
    // Second run: nothing new (same URLs).
    const second = await runSearch(search.id, USER, { deps: runDeps });
    expect(second.resultsNew).toBe(0);
    const [view] = await listSearches();
    expect(view.lastRun?.id).toBe(second.id);
    expect(view.links.some((l) => l.key === "linkedin")).toBe(true);
  });

  it("adds housing found by Claude to the move as new listings", async () => {
    const search = await createSearch({ domain: "HOUSING", name: "Colocs Ixelles", moveId, criteria: { city: "Bruxelles", maxTotalMonthly: 850, furnished: "REQUIRED", types: ["ROOM_COLIVING"] }, useAgent: true }, USER);
    const listing = (url: string, title: string) => ({ url, title, source: "Cohabs", type: "ROOM_COLIVING" as const, address: null, district: "Ixelles", rent: 790, charges: 0, chargesInclude: ["wifi", "ménage"], allInclusive: true, deposit: 1580, availableFrom: "2027-01-01", minLeaseMonths: 3, furnished: "YES" as const, roomSizeM2: 14, housemates: 8, contactUrl: "https://www.cohabs.com/contact", contactEmail: null, evidence: "790 € / mois, tout compris" });
    let calls = 0;
    const runDeps: RunDeps = {
      ...deps({}),
      agent: (async (req: { webTools?: boolean; model?: string }) => {
        calls++;
        expect(req.webTools).toBe(true);
        expect(req.model).toBe("sonnet");
        return { data: { results: [listing("https://www.cohabs.com/rooms/1", "Cohabs Ixelles"), listing("http://insecure.example/2", "Insecure")], blocked: [{ name: "Immoweb", reason: "anti-robot" }], suggestions: [{ name: "Ikoab", url: "https://www.ikoab.com", why: "Coliving à Bruxelles" }], report: "1 annonce." }, meta: { model: "claude-sonnet", provider: "claude-code", promptId: "x", promptVersion: "x", durationMs: 1, costUsd: null } };
      }) as never,
    };
    const run = await runSearch(search.id, USER, { deps: runDeps });
    expect(run).toMatchObject({ status: "DONE", resultsFound: 2, resultsNew: 1, model: "claude-sonnet" });
    expect(run.sources.find((x) => x.name === "Immoweb")).toMatchObject({ ok: false, reason: "anti-robot" });
    const move = await getMove(moveId);
    const added = move.listings.find((l) => l.url === "https://www.cohabs.com/rooms/1")!;
    expect(added).toMatchObject({ status: "NEW", rent: 790, furnished: "YES", district: "Ixelles" });
    expect(added.notes).toMatch(/790 € \/ mois, tout compris/);
    const again = await runSearch(search.id, USER, { deps: runDeps });
    expect(again.resultsNew).toBe(0);
    expect(calls).toBe(2);
  });

  it("only runs scheduled searches that are due, and exports them", async () => {
    await createSearch({ domain: "JOBS", name: "Plus tard", criteria: { keywords: ["data"] }, schedule: "WEEKLY" }, USER);
    expect(await runDueSearches(new Date())).toBeNull(); // next run is in a week
    const file = await exportAll();
    expect(file.schemaVersion).toBe(4);
    expect(file.counts.savedSearches).toBe(3);
    expect(file.counts.researchRuns).toBe(4);
  });
});

async function createTestDbItems() {
  const { db } = await import("@/server/db");
  return db.select().from(s.inboxItems).where(eq(s.inboxItems.sourceType, "API"));
}
